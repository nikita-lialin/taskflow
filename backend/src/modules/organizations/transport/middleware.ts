import { organizationParamsSchema } from '@taskflow/contracts'
import { createMiddleware } from 'hono/factory'

import type { AuthHttpEnv } from '../../auth'
import type { OrganizationsService } from '../application/organizations-service'
import { organizationNotFound } from '../domain/errors'
import type { OrganizationMembership } from '../domain/membership'
import { executeOrganizations } from './errors'

export type OrganizationHttpEnv = {
  Variables: AuthHttpEnv['Variables'] & {
    membership: OrganizationMembership
  }
}

/**
 * Guards every route under `/:organizationId`. The caller must be a member of that organization;
 * anyone else, and any malformed id, gets the same 404 as a missing organization. Handlers read
 * the organization from `c.var.membership` and never from the request body.
 */
export function createRequireMembership(service: OrganizationsService) {
  return createMiddleware<OrganizationHttpEnv>(async (c, next) => {
    const parsed = organizationParamsSchema.safeParse({
      organizationId: c.req.param('organizationId'),
    })
    const membership = await executeOrganizations(async () => {
      if (!parsed.success) throw organizationNotFound()
      return service.resolveMembership(c.var.user.id, parsed.data.organizationId)
    })
    c.set('membership', membership)
    await next()
  })
}
