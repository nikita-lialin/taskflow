import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateOrganizationRequest, OrganizationRole } from '@taskflow/contracts'

import { sessionQueryKeys, useAuth } from '@/features/auth'
import type { AuthenticatedTransport } from '@/platform/api'
import {
  addMember,
  createOrganization,
  listMembers,
  listOrganizations,
  removeMember,
  updateMemberRole,
} from './api'

// Every key sits under `session`, so signing out or switching accounts drops the cache. Every
// key of an organization's data also sits under `organizationScopeKey`, so one invalidation
// refreshes a whole organization and two organizations never share an entry.
export const organizationKeys = {
  all: [...sessionQueryKeys.all, 'organizations'] as const,
  list: () => [...organizationKeys.all, 'list'] as const,
  scope: (organizationId: string) => [...organizationKeys.all, organizationId] as const,
  members: (organizationId: string) =>
    [...organizationKeys.scope(organizationId), 'members'] as const,
}

export function organizationScopeKey(organizationId: string) {
  return organizationKeys.scope(organizationId)
}

export function organizationsQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: organizationKeys.list(),
    queryFn: ({ signal }) => listOrganizations(transport, { signal }),
  })
}

export function membersQueryOptions(transport: AuthenticatedTransport, organizationId: string) {
  return queryOptions({
    queryKey: organizationKeys.members(organizationId),
    queryFn: ({ signal }) => listMembers(transport, organizationId, { signal }),
  })
}

export function useOrganizationsQuery() {
  const auth = useAuth()
  return useQuery(organizationsQueryOptions(auth.transport))
}

export function useMembersQuery(organizationId: string) {
  const auth = useAuth()
  return useQuery(membersQueryOptions(auth.transport, organizationId))
}

export function useCreateOrganizationMutation() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrganizationRequest) => createOrganization(auth.transport, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizationKeys.list() }),
  })
}

export function useAddMemberMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; role: OrganizationRole }) =>
      addMember(auth.transport, organizationId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.members(organizationId) }),
  })
}

export function useUpdateMemberRoleMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ role, userId }: { role: OrganizationRole; userId: string }) =>
      updateMemberRole(auth.transport, organizationId, userId, role),
    // A role change can change what the person may do on every screen of the organization.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.scope(organizationId) }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.list() }),
      ]),
  })
}

export function useRemoveMemberMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => removeMember(auth.transport, organizationId, userId),
    // Removing a member unassigns their tasks, so tasks refresh with the member list.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.scope(organizationId) }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.list() }),
      ]),
  })
}
