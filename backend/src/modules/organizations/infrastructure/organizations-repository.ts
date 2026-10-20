import type { DbClient } from '../../../db'
import type {
  MemberRecord,
  MembershipMutation,
  OrganizationsRepository,
} from '../application/ports'

const organizationSelect = { id: true, name: true, slug: true, createdAt: true } as const

const memberSelect = {
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { email: true, displayName: true } },
} as const

type MemberRow = {
  userId: string
  role: MemberRecord['role']
  createdAt: Date
  user: { email: string; displayName: string | null }
}

export function createPrismaOrganizationsRepository(db: DbClient): OrganizationsRepository {
  return {
    async create(userId, name, slug) {
      const organization = await db.organization.create({
        data: { name, slug, members: { create: { userId, role: 'admin' } } },
        select: organizationSelect,
      })
      return { ...organization, role: 'admin' }
    },

    async listForUser(userId) {
      const memberships = await db.organizationMember.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { role: true, organization: { select: organizationSelect } },
      })
      return memberships.map(({ role, organization }) => ({ ...organization, role }))
    },

    async findMembership(organizationId, userId) {
      const membership = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
      })
      return membership?.role ?? null
    },

    findOrganization(organizationId) {
      return db.organization.findUnique({ where: { id: organizationId }, select: organizationSelect })
    },

    async listMembers(organizationId) {
      const members = await db.organizationMember.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: memberSelect,
      })
      return members.map(toMemberRecord)
    },

    withMembershipMutation(organizationId, run) {
      return db.$transaction(async (tx) => {
        // Locking the organization row serializes membership changes, so two requests cannot
        // both see a second administrator and both step down.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`
        if (locked.length === 0) return null

        const mutation: MembershipMutation = {
          async findUserIdByEmail(email) {
            const user = await tx.user.findUnique({ where: { email }, select: { id: true } })
            return user?.id ?? null
          },
          async findMember(userId) {
            const member = await tx.organizationMember.findUnique({
              where: { organizationId_userId: { organizationId, userId } },
              select: memberSelect,
            })
            return member ? toMemberRecord(member) : null
          },
          countAdmins: () => tx.organizationMember.count({ where: { organizationId, role: 'admin' } }),
          async addMember(userId, role) {
            const member = await tx.organizationMember.create({
              data: { organizationId, userId, role },
              select: memberSelect,
            })
            return toMemberRecord(member)
          },
          async updateRole(userId, role) {
            const member = await tx.organizationMember.update({
              where: { organizationId_userId: { organizationId, userId } },
              data: { role },
              select: memberSelect,
            })
            return toMemberRecord(member)
          },
          async removeMember(userId) {
            // A task may only be assigned to a current member, so the member's tasks in this
            // organization become unassigned in the same transaction.
            await tx.task.updateMany({
              where: { organizationId, assigneeId: userId },
              data: { assigneeId: null },
            })
            await tx.organizationMember.delete({
              where: { organizationId_userId: { organizationId, userId } },
            })
          },
        }
        return run(mutation)
      })
    },
  }
}

function toMemberRecord(member: MemberRow): MemberRecord {
  return {
    userId: member.userId,
    email: member.user.email,
    displayName: member.user.displayName,
    role: member.role,
    createdAt: member.createdAt,
  }
}
