import {
  addOrganizationMemberRequestSchema,
  apiErrorSchema,
  createOrganizationRequestSchema,
  organizationMemberParamsSchema,
  organizationMemberResponseSchema,
  organizationMembersResponseSchema,
  organizationParamsSchema,
  organizationResponseSchema,
  organizationsResponseSchema,
  updateOrganizationMemberRoleRequestSchema,
} from '@taskflow/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'
import type { ZodType } from 'zod'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { OrganizationsService } from '../application/organizations-service'
import { executeOrganizations } from './errors'
import { createRequireMembership, type OrganizationHttpEnv } from './middleware'

const errorContent = { 'application/json': { schema: apiErrorSchema } }
const bearerSecurity = [{ BearerAuth: [] }]
const jsonBody = <T extends ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
})

const unauthorized = { content: errorContent, description: 'Authentication required' }
const notFound = { content: errorContent, description: 'Not found, or not a member' }
const forbidden = { content: errorContent, description: 'Organization administrator access required' }

const createRouteDefinition = createRoute({
  method: 'post',
  path: '/',
  security: bearerSecurity,
  request: { body: jsonBody(createOrganizationRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: organizationResponseSchema } }, description: 'Created organization' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: unauthorized,
  },
})

const listRoute = createRoute({
  method: 'get',
  path: '/',
  security: bearerSecurity,
  responses: {
    200: { content: { 'application/json': { schema: organizationsResponseSchema } }, description: 'Organizations of the caller' },
    401: unauthorized,
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/{organizationId}',
  security: bearerSecurity,
  request: { params: organizationParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: organizationResponseSchema } }, description: 'Organization' },
    401: unauthorized,
    404: notFound,
  },
})

const listMembersRoute = createRoute({
  method: 'get',
  path: '/{organizationId}/members',
  security: bearerSecurity,
  request: { params: organizationParamsSchema },
  responses: {
    200: { content: { 'application/json': { schema: organizationMembersResponseSchema } }, description: 'Members' },
    401: unauthorized,
    404: notFound,
  },
})

const addMemberRoute = createRoute({
  method: 'post',
  path: '/{organizationId}/members',
  security: bearerSecurity,
  request: { params: organizationParamsSchema, body: jsonBody(addOrganizationMemberRequestSchema) },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: organizationMemberResponseSchema } }, description: 'Added member' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    409: { content: errorContent, description: 'Already a member' },
  },
})

const updateMemberRoute = createRoute({
  method: 'patch',
  path: '/{organizationId}/members/{userId}',
  security: bearerSecurity,
  request: {
    params: organizationMemberParamsSchema,
    body: jsonBody(updateOrganizationMemberRoleRequestSchema),
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: organizationMemberResponseSchema } }, description: 'Updated member' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    409: { content: errorContent, description: 'The last administrator cannot be demoted' },
  },
})

const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/{organizationId}/members/{userId}',
  security: bearerSecurity,
  request: { params: organizationMemberParamsSchema },
  responses: {
    204: { description: 'Member removed' },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    409: { content: errorContent, description: 'The last administrator cannot be removed' },
  },
})

type CreateOrganizationsRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: OrganizationsService
}

export function createOrganizationsRoutes({ requireAuth, service }: CreateOrganizationsRoutesOptions) {
  const routes = new OpenAPIHono<OrganizationHttpEnv>({ defaultHook: validationErrorHook })
  const requireMembership = createRequireMembership(service)

  routes.use('*', requireAuth)
  routes.use('/:organizationId', requireMembership)
  routes.use('/:organizationId/*', requireMembership)

  routes.openapi(createRouteDefinition, async (c) => {
    const result = await executeOrganizations(() => service.create(c.var.user, c.req.valid('json')))
    return c.json(result, 201)
  })
  routes.openapi(listRoute, async (c) => c.json(await service.list(c.var.user), 200))
  routes.openapi(getRoute, async (c) => {
    return c.json(await executeOrganizations(() => service.get(c.var.membership)), 200)
  })
  routes.openapi(listMembersRoute, async (c) => {
    return c.json(await executeOrganizations(() => service.listMembers(c.var.membership)), 200)
  })
  routes.openapi(addMemberRoute, async (c) => {
    const result = await executeOrganizations(() =>
      service.addMember(c.var.membership, c.req.valid('json')),
    )
    return c.json(result, 201)
  })
  routes.openapi(updateMemberRoute, async (c) => {
    const result = await executeOrganizations(() =>
      service.updateMemberRole(c.var.membership, c.req.valid('param').userId, c.req.valid('json')),
    )
    return c.json(result, 200)
  })
  routes.openapi(removeMemberRoute, async (c) => {
    await executeOrganizations(() =>
      service.removeMember(c.var.user, c.var.membership, c.req.valid('param').userId),
    )
    return c.body(null, 204)
  })

  return routes
}
