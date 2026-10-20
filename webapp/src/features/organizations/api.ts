import {
  addOrganizationMemberRequestSchema,
  createOrganizationRequestSchema,
  organizationMemberResponseSchema,
  organizationMembersResponseSchema,
  organizationResponseSchema,
  organizationsResponseSchema,
  updateOrganizationMemberRoleRequestSchema,
  type AddOrganizationMemberRequest,
  type CreateOrganizationRequest,
  type OrganizationRole,
} from '@taskflow/contracts'
import { z } from 'zod'

import type { AuthenticatedTransport } from '@/platform/api'

type ReadOptions = { signal?: AbortSignal }

function organizationPath(organizationId: string) {
  return `/api/organizations/${encodeURIComponent(organizationId)}`
}

export function listOrganizations(transport: AuthenticatedTransport, options: ReadOptions = {}) {
  return transport.request('/api/organizations', organizationsResponseSchema, options)
}

export function createOrganization(
  transport: AuthenticatedTransport,
  input: CreateOrganizationRequest,
) {
  return transport.request('/api/organizations', organizationResponseSchema, {
    method: 'POST',
    body: createOrganizationRequestSchema.parse(input),
  })
}

export function listMembers(
  transport: AuthenticatedTransport,
  organizationId: string,
  options: ReadOptions = {},
) {
  return transport.request(
    `${organizationPath(organizationId)}/members`,
    organizationMembersResponseSchema,
    options,
  )
}

export function addMember(
  transport: AuthenticatedTransport,
  organizationId: string,
  input: AddOrganizationMemberRequest,
) {
  return transport.request(
    `${organizationPath(organizationId)}/members`,
    organizationMemberResponseSchema,
    { method: 'POST', body: addOrganizationMemberRequestSchema.parse(input) },
  )
}

export function updateMemberRole(
  transport: AuthenticatedTransport,
  organizationId: string,
  userId: string,
  role: OrganizationRole,
) {
  return transport.request(
    `${organizationPath(organizationId)}/members/${encodeURIComponent(userId)}`,
    organizationMemberResponseSchema,
    { method: 'PATCH', body: updateOrganizationMemberRoleRequestSchema.parse({ role }) },
  )
}

export function removeMember(
  transport: AuthenticatedTransport,
  organizationId: string,
  userId: string,
) {
  return transport.request(
    `${organizationPath(organizationId)}/members/${encodeURIComponent(userId)}`,
    z.undefined(),
    { method: 'DELETE' },
  )
}
