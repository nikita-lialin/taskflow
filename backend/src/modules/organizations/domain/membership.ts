import type { OrganizationRole } from '@taskflow/contracts'

import { OrganizationsFailure } from './errors'

/** The caller's verified place in one organization. Every later module scopes its queries by it. */
export type OrganizationMembership = {
  organizationId: string
  role: OrganizationRole
}

export function requireOrganizationAdmin(membership: OrganizationMembership) {
  if (membership.role !== 'admin') {
    throw new OrganizationsFailure('forbidden', 'Organization administrator access required')
  }
}
