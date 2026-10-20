import {
  apiErrorSchema,
  createTaskRequestSchema,
  organizationParamsSchema,
  projectTasksParamsSchema,
  taskActivityQuerySchema,
  taskActivityResponseSchema,
  taskParamsSchema,
  taskResponseSchema,
  tasksQuerySchema,
  tasksResponseSchema,
  updateTaskRequestSchema,
} from '@taskflow/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import type { ZodType } from 'zod'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses, rateLimitErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { OrganizationHttpEnv } from '../../organizations'
import type { TasksService } from '../application/tasks-service'
import { executeTasks } from './errors'

const errorContent = { 'application/json': { schema: apiErrorSchema } }
const bearerSecurity = [{ BearerAuth: [] }]
const jsonBody = <T extends ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
})

const unauthorized = { content: errorContent, description: 'Authentication required' }
const notFound = { content: errorContent, description: 'Not found, or not a member' }
const invalid = { content: errorContent, description: 'Invalid request' }

const createTaskRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/tasks',
  security: bearerSecurity,
  request: { params: projectTasksParamsSchema, body: jsonBody(createTaskRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: taskResponseSchema } }, description: 'Created task' },
    400: invalid,
    401: unauthorized,
    404: notFound,
    409: { content: errorContent, description: 'The project is archived' },
  },
})

const listTasksRoute = createRoute({
  method: 'get',
  path: '/tasks',
  security: bearerSecurity,
  request: { params: organizationParamsSchema, query: tasksQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: tasksResponseSchema } }, description: 'Tasks' },
    400: invalid,
    401: unauthorized,
    404: notFound,
  },
})

const getTaskRoute = createRoute({
  method: 'get',
  path: '/tasks/{taskId}',
  security: bearerSecurity,
  request: { params: taskParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: taskResponseSchema } }, description: 'Task' },
    400: invalid,
    401: unauthorized,
    404: notFound,
  },
})

const taskActivityRoute = createRoute({
  method: 'get',
  path: '/tasks/{taskId}/activity',
  security: bearerSecurity,
  request: { params: taskParamsSchema, query: taskActivityQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: taskActivityResponseSchema } },
      description: 'Changes of the task, newest first',
    },
    400: invalid,
    401: unauthorized,
    404: notFound,
  },
})

const forbidden = {
  content: errorContent,
  description: 'Members change only the tasks they created or are assigned to',
}
const archived = { content: errorContent, description: 'The project is archived' }

const updateTaskRoute = createRoute({
  method: 'patch',
  path: '/tasks/{taskId}',
  security: bearerSecurity,
  request: { params: taskParamsSchema, body: jsonBody(updateTaskRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: taskResponseSchema } }, description: 'Updated task' },
    400: invalid,
    401: unauthorized,
    403: forbidden,
    404: notFound,
    409: archived,
  },
})

const deleteTaskRoute = createRoute({
  method: 'delete',
  path: '/tasks/{taskId}',
  security: bearerSecurity,
  request: { params: taskParamsSchema },
  responses: {
    ...rateLimitErrorResponses,
    204: { description: 'Task deleted' },
    400: invalid,
    401: unauthorized,
    403: { ...forbidden, description: 'Members delete only the tasks they created' },
    404: notFound,
    409: archived,
  },
})

type CreateTasksRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireMembership: MiddlewareHandler<OrganizationHttpEnv>
  service: TasksService
}

/**
 * Mounted at `/api/organizations/:organizationId`, because tasks are created under a project but
 * listed and read under the organization. Mount it before the projects routes: their blanket
 * guard would otherwise run a second time on the create route.
 */
export function createTasksRoutes({ requireAuth, requireMembership, service }: CreateTasksRoutesOptions) {
  const routes = new OpenAPIHono<OrganizationHttpEnv>({ defaultHook: validationErrorHook })

  for (const path of ['/projects/:projectId/tasks', '/tasks', '/tasks/*']) {
    routes.use(path, requireAuth)
    routes.use(path, requireMembership)
  }

  routes.openapi(createTaskRoute, async (c) => {
    const { projectId } = c.req.valid('param')
    const result = await executeTasks(() =>
      service.create(c.var.membership, c.var.user.id, projectId, c.req.valid('json')),
    )
    return c.json(result, 201)
  })
  routes.openapi(listTasksRoute, async (c) => {
    const result = await service.list(c.var.membership, c.var.user.id, c.req.valid('query'))
    return c.json(result, 200)
  })
  routes.openapi(getTaskRoute, async (c) => {
    const { taskId } = c.req.valid('param')
    return c.json(await executeTasks(() => service.get(c.var.membership, taskId)), 200)
  })
  routes.openapi(taskActivityRoute, async (c) => {
    const { taskId } = c.req.valid('param')
    const result = await executeTasks(() =>
      service.activity(c.var.membership, taskId, c.req.valid('query')),
    )
    return c.json(result, 200)
  })
  routes.openapi(updateTaskRoute, async (c) => {
    const { taskId } = c.req.valid('param')
    const result = await executeTasks(() =>
      service.update(c.var.membership, c.var.user.id, taskId, c.req.valid('json')),
    )
    return c.json(result, 200)
  })
  routes.openapi(deleteTaskRoute, async (c) => {
    const { taskId } = c.req.valid('param')
    await executeTasks(() => service.delete(c.var.membership, c.var.user.id, taskId))
    return c.body(null, 204)
  })

  return routes
}
