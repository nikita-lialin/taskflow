import type { Prisma } from '../../../generated/prisma/client'
import type { DbClient } from '../../../db'
import type { ProjectsRepository, ProjectsMutation } from '../application/ports'

const projectSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

export function createPrismaProjectsRepository(db: DbClient): ProjectsRepository {
  return {
    async list(organizationId, { archived, page, pageSize, q }) {
      const where: Prisma.ProjectWhereInput = {
        organizationId,
        ...(archived === 'false' && { archivedAt: null }),
        ...(archived === 'true' && { archivedAt: { not: null } }),
        ...(q && { name: { contains: q, mode: 'insensitive' } }),
      }
      const [total, items] = await db.$transaction([
        db.project.count({ where }),
        db.project.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: projectSelect,
        }),
      ])
      return { items, total }
    },

    async findDetail(organizationId, projectId) {
      const project = await db.project.findFirst({
        where: { id: projectId, organizationId },
        select: projectSelect,
      })
      if (!project) return null
      const groups = await db.task.groupBy({
        by: ['status'],
        where: { organizationId, projectId },
        _count: { _all: true },
      })
      const taskCounts = { backlog: 0, todo: 0, in_progress: 0, done: 0 }
      for (const group of groups) taskCounts[group.status] = group._count._all
      return { ...project, taskCounts }
    },

    withWriteLock(organizationId, run) {
      return db.$transaction(async (tx) => {
        // Locking the organization row serializes project writes. The case-insensitive name check
        // cannot rely on the unique index, so two requests must not both pass it.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`
        if (locked.length === 0) return null

        const mutation: ProjectsMutation = {
          async isNameTaken(name, exceptProjectId) {
            const match = await tx.project.findFirst({
              where: {
                organizationId,
                name: { equals: name, mode: 'insensitive' },
                ...(exceptProjectId && { id: { not: exceptProjectId } }),
              },
              select: { id: true },
            })
            return match !== null
          },
          async isKeyTaken(key) {
            const match = await tx.project.findUnique({
              where: { organizationId_key: { organizationId, key } },
              select: { id: true },
            })
            return match !== null
          },
          find: (projectId) =>
            tx.project.findFirst({ where: { id: projectId, organizationId }, select: projectSelect }),
          create: (project) =>
            tx.project.create({ data: { organizationId, ...project }, select: projectSelect }),
          update: (projectId, changes) =>
            tx.project.update({
              where: { id: projectId, organizationId },
              data: changes,
              select: projectSelect,
            }),
        }
        return run(mutation)
      })
    },
  }
}
