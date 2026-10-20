import type { OrganizationDto, OrganizationMemberDto, OrganizationRole } from '@taskflow/contracts'

export const organizationRoleLabels: Record<OrganizationRole, string> = {
  admin: 'Admin',
  member: 'Member',
}

/** What the signed-in person may do in an organization. The backend enforces the same rules. */
export function organizationPermissions(role: OrganizationRole) {
  const isAdmin = role === 'admin'
  return {
    canManageMembers: isAdmin,
    canManageProjects: isAdmin,
  }
}

export type OrganizationPermissions = ReturnType<typeof organizationPermissions>

export function memberLabel(member: Pick<OrganizationMemberDto, 'displayName' | 'email'>) {
  return member.displayName ?? member.email
}

export type MemberActions = {
  canChangeRole: boolean
  canRemove: boolean
  /** Removing yourself reads as leaving. */
  removeLabel: 'Leave' | 'Remove'
  /** Why a control is unavailable, when the reason is not obvious. */
  blockedReason: string | null
}

/**
 * Which member controls to show. Admins manage everyone, members only leave. The last admin can
 * be neither demoted nor removed: the backend answers 409, and the UI explains it up front.
 */
export function memberActions({
  member,
  members,
  viewerId,
  viewerRole,
}: {
  member: OrganizationMemberDto
  members: ReadonlyArray<OrganizationMemberDto>
  viewerId: string
  viewerRole: OrganizationRole
}): MemberActions {
  const isSelf = member.userId === viewerId
  const isLastAdmin =
    member.role === 'admin' && members.filter((entry) => entry.role === 'admin').length <= 1
  const isViewerAdmin = viewerRole === 'admin'

  return {
    canChangeRole: isViewerAdmin && !isLastAdmin,
    canRemove: (isViewerAdmin || isSelf) && !isLastAdmin,
    removeLabel: isSelf ? 'Leave' : 'Remove',
    blockedReason:
      isLastAdmin && (isViewerAdmin || isSelf)
        ? 'An organization needs at least one admin.'
        : null,
  }
}

const sectionTitles: Record<string, string> = {
  board: 'Board',
  tasks: 'Tasks',
  'my-tasks': 'My tasks',
  projects: 'Projects',
  members: 'Members',
}

/** The page title for `/app/orgs/:id/<section>/...`, or null for any other path. */
export function organizationSectionTitle(pathname: string): string | null {
  const [, app, orgs, organizationId, section] = pathname.split('/')
  if (app !== 'app' || orgs !== 'orgs' || !organizationId || !section) return null
  return sectionTitles[section] ?? null
}

/** The organization id in `/app/orgs/:id/...`, or null for any other path. */
export function organizationIdFromPath(pathname: string): string | null {
  const [, app, orgs, organizationId] = pathname.split('/')
  return app === 'app' && orgs === 'orgs' && organizationId ? organizationId : null
}

export function findOrganization(
  organizations: ReadonlyArray<OrganizationDto>,
  organizationId: string,
) {
  return organizations.find((organization) => organization.id === organizationId) ?? null
}
