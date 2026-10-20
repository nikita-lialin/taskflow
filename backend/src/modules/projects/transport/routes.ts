import {
  apiErrorSchema,
  createProjectRequestSchema,
  organizationParamsSchema,
  projectDetailResponseSchema,
  projectParamsSchema,
  projectResponseSchema,
  projectsQuerySchema,
  projectsResponseSchema,
  updateProjectRequestSchema,
} from '@taskflow/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import type { ZodType } from 'zod'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { OrganizationHttpEnv } from '../../organizations'
import type { ProjectsService } from '../application/projects-service'
import { executeProjects } from './errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }
const bearerSecurity = [{ BearerAuth: [] }]
const jsonBody = <T extends ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
})

const unauthorized = { content: errorContent, description: 'Authentication required' }
const notFound = { content: errorContent, description: 'Not found, or not a member' }
const forbidden = { content: errorContent, description: 'Organization administrator access required' }
const invalid = { content: errorContent, description: 'Invalid request' }

const createProjectRoute = createRoute({
  method: 'post',
  path: '/',
  security: bearerSecurity,
  request: { params: organizationParamsSchema, body: jsonBody(createProjectRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: projectResponseSchema } }, description: 'Created project' },
    400: invalid,
    401: unauthorized,
    403: forbidden,
    404: notFound,
    409: { content: errorContent, description: 'The name or key is already used' },
  },
})

const listProjectsRoute = createRoute({
  method: 'get',
  path: '/',
  security: bearerSecurity,
  request: { params: organizationParamsSchema, query: projectsQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: projectsResponseSchema } }, description: 'Projects' },
    400: invalid,
    401: unauthorized,
    404: notFound,
  },
})

const getProjectRoute = createRoute({
  method: 'get',
  path: '/{projectId}',
  security: bearerSecurity,
  request: { params: projectParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: projectDetailResponseSchema } }, description: 'Project with task counts' },
    400: invalid,
    401: unauthorized,
    404: notFound,
  },
})

const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/{projectId}',
  security: bearerSecurity,
  request: { params: projectParamsSchema, body: jsonBody(updateProjectRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: projectResponseSchema } }, description: 'Updated project' },
    400: invalid,
    401: unauthorized,
    403: forbidden,
    404: notFound,
    409: { content: errorContent, description: 'The name is already used' },
  },
})

type CreateProjectsRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireMembership: MiddlewareHandler<OrganizationHttpEnv>
  service: ProjectsService
}

/** Mounted at `/api/organizations/:organizationId/projects`. */
export function createProjectsRoutes({ requireAuth, requireMembership, service }: CreateProjectsRoutesOptions) {
  const routes = new OpenAPIHono<OrganizationHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('*', requireAuth)
  routes.use('*', requireMembership)

  routes.openapi(createProjectRoute, async (c) => {
    const result = await executeProjects(() => service.create(c.var.membership, c.req.valid('json')))
    return c.json(result, 201)
  })
  routes.openapi(listProjectsRoute, async (c) => {
    return c.json(await service.list(c.var.membership, c.req.valid('query')), 200)
  })
  routes.openapi(getProjectRoute, async (c) => {
    const { projectId } = c.req.valid('param')
    return c.json(await executeProjects(() => service.get(c.var.membership, projectId)), 200)
  })
  routes.openapi(updateProjectRoute, async (c) => {
    const { projectId } = c.req.valid('param')
    const result = await executeProjects(() =>
      service.update(c.var.membership, projectId, c.req.valid('json')),
    )
    return c.json(result, 200)
  })

  return routes
}
