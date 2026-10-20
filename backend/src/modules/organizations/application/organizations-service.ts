import type {
  AddOrganizationMemberRequest,
  CreateOrganizationRequest,
  OrganizationDto,
  OrganizationMemberDto,
  UpdateOrganizationMemberRoleRequest,
} from '@taskflow/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import { OrganizationsFailure, organizationNotFound } from '../domain/errors'
import { type OrganizationMembership, requireOrganizationAdmin } from '../domain/membership'
import { createSlug } from '../domain/slug'
import type {
  MemberRecord,
  MembershipMutation,
  OrganizationsRepository,
  UserOrganizationRecord,
} from './ports'

type OrganizationsServiceDependencies = {
  repository: OrganizationsRepository
  randomSuffix: () => string
}

export class OrganizationsService {
  constructor(private readonly dependencies: OrganizationsServiceDependencies) {}

  /** The single access check. Routes reach it through the guard, never around it. */
  async resolveMembership(userId: string, organizationId: string): Promise<OrganizationMembership> {
    const role = await this.dependencies.repository.findMembership(organizationId, userId)
    if (!role) throw organizationNotFound()
    return { organizationId, role }
  }

  async create(principal: AuthenticatedPrincipal, input: CreateOrganizationRequest) {
    const slug = createSlug(input.name, this.dependencies.randomSuffix())
    const record = await this.dependencies.repository.create(principal.id, input.name, slug)
    return { organization: toOrganizationDto(record) }
  }

  async list(principal: AuthenticatedPrincipal) {
    const records = await this.dependencies.repository.listForUser(principal.id)
    return { items: records.map(toOrganizationDto) }
  }

  async get(membership: OrganizationMembership) {
    const record = await this.dependencies.repository.findOrganization(membership.organizationId)
    if (!record) throw organizationNotFound()
    return { organization: toOrganizationDto({ ...record, role: membership.role }) }
  }

  async listMembers(membership: OrganizationMembership) {
    const records = await this.dependencies.repository.listMembers(membership.organizationId)
    return { items: records.map(toMemberDto) }
  }

  async addMember(membership: OrganizationMembership, input: AddOrganizationMemberRequest) {
    requireOrganizationAdmin(membership)
    const member = await this.mutate(membership, async (mutation) => {
      const userId = await mutation.findUserIdByEmail(input.email)
      if (!userId) throw new OrganizationsFailure('not_found', 'No registered user has this email')
      if (await mutation.findMember(userId)) {
        throw new OrganizationsFailure('conflict', 'This user is already a member')
      }
      return mutation.addMember(userId, input.role)
    })
    return { member: toMemberDto(member) }
  }

  async updateMemberRole(
    membership: OrganizationMembership,
    targetUserId: string,
    input: UpdateOrganizationMemberRoleRequest,
  ) {
    requireOrganizationAdmin(membership)
    const member = await this.mutate(membership, async (mutation) => {
      const target = await mutation.findMember(targetUserId)
      if (!target) throw memberNotFound()
      if (target.role === 'admin' && input.role !== 'admin') await requireAnotherAdmin(mutation)
      return mutation.updateRole(targetUserId, input.role)
    })
    return { member: toMemberDto(member) }
  }

  /** Admins remove anyone. Every member may remove themselves. */
  async removeMember(
    principal: AuthenticatedPrincipal,
    membership: OrganizationMembership,
    targetUserId: string,
  ) {
    if (targetUserId !== principal.id) requireOrganizationAdmin(membership)
    await this.mutate(membership, async (mutation) => {
      const target = await mutation.findMember(targetUserId)
      if (!target) throw memberNotFound()
      if (target.role === 'admin') await requireAnotherAdmin(mutation)
      await mutation.removeMember(targetUserId)
    })
  }

  private async mutate<T>(
    membership: OrganizationMembership,
    run: (mutation: MembershipMutation) => Promise<T>,
  ): Promise<T> {
    const result = await this.dependencies.repository.withMembershipMutation(
      membership.organizationId,
      run,
    )
    if (result === null) throw organizationNotFound()
    return result
  }
}

async function requireAnotherAdmin(mutation: MembershipMutation) {
  if ((await mutation.countAdmins()) <= 1) {
    throw new OrganizationsFailure('conflict', 'An organization needs at least one administrator')
  }
}

function memberNotFound() {
  return new OrganizationsFailure('not_found', 'Member not found')
}

function toOrganizationDto(record: UserOrganizationRecord): OrganizationDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    role: record.role,
    createdAt: record.createdAt.toISOString(),
  }
}

function toMemberDto(record: MemberRecord): OrganizationMemberDto {
  return {
    userId: record.userId,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    joinedAt: record.createdAt.toISOString(),
  }
}
