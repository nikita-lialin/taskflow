import type { OrganizationRole } from '@taskflow/contracts'

export type OrganizationRecord = {
  id: string
  name: string
  slug: string
  createdAt: Date
}

export type UserOrganizationRecord = OrganizationRecord & { role: OrganizationRole }

export type MemberRecord = {
  userId: string
  email: string
  displayName: string | null
  role: OrganizationRole
  createdAt: Date
}

/** Operations that run while the organization row is locked, so membership changes queue up. */
export type MembershipMutation = {
  findUserIdByEmail(email: string): Promise<string | null>
  findMember(userId: string): Promise<MemberRecord | null>
  countAdmins(): Promise<number>
  addMember(userId: string, role: OrganizationRole): Promise<MemberRecord>
  updateRole(userId: string, role: OrganizationRole): Promise<MemberRecord>
  removeMember(userId: string): Promise<void>
}

export interface OrganizationsRepository {
  create(userId: string, name: string, slug: string): Promise<UserOrganizationRecord>
  listForUser(userId: string): Promise<UserOrganizationRecord[]>
  findMembership(organizationId: string, userId: string): Promise<OrganizationRole | null>
  findOrganization(organizationId: string): Promise<OrganizationRecord | null>
  listMembers(organizationId: string): Promise<MemberRecord[]>
  /** Resolves to `null` when the organization no longer exists. */
  withMembershipMutation<T>(
    organizationId: string,
    run: (mutation: MembershipMutation) => Promise<T>,
  ): Promise<T | null>
}
