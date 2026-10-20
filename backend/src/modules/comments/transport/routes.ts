import {
  apiErrorSchema,
  commentParamsSchema,
  commentResponseSchema,
  commentsQuerySchema,
  commentsResponseSchema,
  createCommentRequestSchema,
  taskParamsSchema,
  updateCommentRequestSchema,
} from '@taskflow/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import type { ZodType } from 'zod'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { OrganizationHttpEnv } from '../../organizations'
import type { CommentsService } from '../application/comments-service'
import { executeComments } from './errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }
const bearerSecurity = [{ BearerAuth: [] }]
const jsonBody = <T extends ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
})

const unauthorized = { content: errorContent, description: 'Authentication required' }
const notFound = { content: errorContent, description: 'Not found, or not a member' }
const invalid = { content: errorContent, description: 'Invalid request' }
const archived = { content: errorContent, description: 'The project is archived' }

const listCommentsRoute = createRoute({
  method: 'get',
  path: '/tasks/{taskId}/comments',
  security: bearerSecurity,
  request: { params: taskParamsSchema, query: commentsQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: commentsResponseSchema } }, description: 'Comments, oldest first' },
    400: invalid,
    401: unauthorized,
    404: notFound,
  },
})

const createCommentRoute = createRoute({
  method: 'post',
  path: '/tasks/{taskId}/comments',
  security: bearerSecurity,
  request: { params: taskParamsSchema, body: jsonBody(createCommentRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: commentResponseSchema } }, description: 'Created comment' },
    400: invalid,
    401: unauthorized,
    404: notFound,
    409: archived,
  },
})

const updateCommentRoute = createRoute({
  method: 'patch',
  path: '/tasks/{taskId}/comments/{commentId}',
  security: bearerSecurity,
  request: { params: commentParamsSchema, body: jsonBody(updateCommentRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: commentResponseSchema } }, description: 'Updated comment' },
    400: invalid,
    401: unauthorized,
    403: { content: errorContent, description: 'Only the author edits a comment' },
    404: notFound,
    409: archived,
  },
})

const deleteCommentRoute = createRoute({
  method: 'delete',
  path: '/tasks/{taskId}/comments/{commentId}',
  security: bearerSecurity,
  request: { params: commentParamsSchema },
  responses: {
    204: { description: 'Comment deleted' },
    400: invalid,
    401: unauthorized,
    403: { content: errorContent, description: 'Members delete only their own comments' },
    404: notFound,
    409: archived,
  },
})

type CreateCommentsRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireMembership: MiddlewareHandler<OrganizationHttpEnv>
  service: CommentsService
}

/**
 * Mounted at `/api/organizations/:organizationId`. Mount it before the tasks routes: their
 * blanket guard covers `/tasks/*` and would otherwise run a second time on these routes.
 */
export function createCommentsRoutes({ requireAuth, requireMembership, service }: CreateCommentsRoutesOptions) {
  const routes = new OpenAPIHono<OrganizationHttpEnv>({ defaultHook: validationErrorHook })

  for (const path of ['/tasks/:taskId/comments', '/tasks/:taskId/comments/*']) {
    routes.use(path, requireAuth)
    routes.use(path, requireMembership)
  }

  routes.openapi(listCommentsRoute, async (c) => {
    const { taskId } = c.req.valid('param')
    const result = await executeComments(() => service.list(c.var.membership, taskId, c.req.valid('query')))
    return c.json(result, 200)
  })
  routes.openapi(createCommentRoute, async (c) => {
    const { taskId } = c.req.valid('param')
    const result = await executeComments(() =>
      service.create(c.var.membership, c.var.user.id, taskId, c.req.valid('json')),
    )
    return c.json(result, 201)
  })
  routes.openapi(updateCommentRoute, async (c) => {
    const { taskId, commentId } = c.req.valid('param')
    const result = await executeComments(() =>
      service.update(c.var.membership, c.var.user.id, taskId, commentId, c.req.valid('json')),
    )
    return c.json(result, 200)
  })
  routes.openapi(deleteCommentRoute, async (c) => {
    const { taskId, commentId } = c.req.valid('param')
    await executeComments(() => service.delete(c.var.membership, c.var.user.id, taskId, commentId))
    return c.body(null, 204)
  })

  return routes
}
