import { expect, test } from 'bun:test'
import type { OrganizationMemberDto } from '@taskflow/contracts'

import {
  findOrganization,
  memberActions,
  organizationIdFromPath,
  organizationPermissions,
  organizationSectionTitle,
} from '../src/features/organizations/model'

function member(userId: string, role: 'admin' | 'member'): OrganizationMemberDto {
  return {
    displayName: null,
    email: `${userId}@example.com`,
    joinedAt: '2026-01-01T00:00:00.000Z',
    role,
    userId,
  }
}

test('only admins manage members and projects', () => {
  expect(organizationPermissions('admin')).toEqual({
    canManageMembers: true,
    canManageProjects: true,
  })
  expect(organizationPermissions('member')).toEqual({
    canManageMembers: false,
    canManageProjects: false,
  })
})

test('an admin manages other members but not the last admin', () => {
  const members = [member('a', 'admin'), member('b', 'member')]

  expect(
    memberActions({ member: members[1], members, viewerId: 'a', viewerRole: 'admin' }),
  ).toEqual({ blockedReason: null, canChangeRole: true, canRemove: true, removeLabel: 'Remove' })

  const lastAdmin = memberActions({ member: members[0], members, viewerId: 'a', viewerRole: 'admin' })
  expect(lastAdmin.canChangeRole).toBe(false)
  expect(lastAdmin.canRemove).toBe(false)
  expect(lastAdmin.blockedReason).not.toBeNull()
})

test('a second admin makes every admin removable', () => {
  const members = [member('a', 'admin'), member('b', 'admin')]
  const actions = memberActions({ member: members[0], members, viewerId: 'a', viewerRole: 'admin' })

  expect(actions.canChangeRole).toBe(true)
  expect(actions.canRemove).toBe(true)
  expect(actions.removeLabel).toBe('Leave')
})

test('a member can only leave', () => {
  const members = [member('a', 'admin'), member('b', 'member'), member('c', 'member')]

  const own = memberActions({ member: members[1], members, viewerId: 'b', viewerRole: 'member' })
  expect(own).toEqual({ blockedReason: null, canChangeRole: false, canRemove: true, removeLabel: 'Leave' })

  const other = memberActions({ member: members[2], members, viewerId: 'b', viewerRole: 'member' })
  expect(other.canChangeRole).toBe(false)
  expect(other.canRemove).toBe(false)

  // The reason is for people who could act: a member has no controls on the last admin.
  const admin = memberActions({ member: members[0], members, viewerId: 'b', viewerRole: 'member' })
  expect(admin.canRemove).toBe(false)
  expect(admin.blockedReason).toBeNull()
})

test('organization paths resolve the id and the page title', () => {
  expect(organizationIdFromPath('/app/orgs/abc/board')).toBe('abc')
  expect(organizationIdFromPath('/app/orgs/abc')).toBe('abc')
  expect(organizationIdFromPath('/app/profile')).toBeNull()
  expect(organizationIdFromPath('/admin/orgs/abc')).toBeNull()

  expect(organizationSectionTitle('/app/orgs/abc/my-tasks')).toBe('My tasks')
  expect(organizationSectionTitle('/app/orgs/abc/tasks/42')).toBe('Tasks')
  expect(organizationSectionTitle('/app/orgs/abc')).toBeNull()
  expect(organizationSectionTitle('/app/orgs/abc/unknown')).toBeNull()
})

test('an organization outside the list is not found', () => {
  const organizations = [
    { createdAt: '2026-01-01T00:00:00.000Z', id: 'one', name: 'One', role: 'admin' as const, slug: 'one' },
  ]

  expect(findOrganization(organizations, 'one')?.name).toBe('One')
  expect(findOrganization(organizations, 'foreign')).toBeNull()
})
