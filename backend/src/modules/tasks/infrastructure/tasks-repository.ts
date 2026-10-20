import { containsText, type DbClient } from '../../../db'
import type { Prisma } from '../../../generated/prisma/client'
import type { TaskFilter, TaskRecord, TasksRepository, TaskWrite } from '../application/ports'

const userSelect = { id: true, email: true, displayName: true } as const

const taskSelect = {
  id: true,
  projectId: true,
  number: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { key: true } },
  assignee: { select: userSelect },
  creator: { select: userSelect },
} as const

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>

export function createPrismaTasksRepository(db: DbClient): TasksRepository {
  return {
    async list(organizationId, filter) {
      const where = toWhere(organizationId, filter)
      const [total, rows] = await db.$transaction([
        db.task.count({ where }),
        db.task.findMany({
          where,
          orderBy: toOrderBy(filter),
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
          select: taskSelect,
        }),
      ])
      return { items: rows.map(toTaskRecord), total }
    },

    async find(organizationId, taskId) {
      const row = await db.task.findFirst({
        where: { id: taskId, organizationId },
        select: taskSelect,
      })
      return row && toTaskRecord(row)
    },

    withWriteLock(organizationId, run) {
      return db.$transaction(async (tx) => {
        // A share lock lets task writes run side by side. It still blocks membership changes and
        // project writes, which lock the row for update, so the assignee check and the archive
        // check stay true until the task is stored.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR SHARE`
        if (locked.length === 0) return null

        const write: TaskWrite = {
          findProject: (projectId) =>
            tx.project.findFirst({
              where: { id: projectId, organizationId },
              select: { id: true, archivedAt: true },
            }),
          async findTask(taskId) {
            const row = await tx.task.findFirst({
              where: { id: taskId, organizationId },
              select: { creatorId: true, assigneeId: true, project: { select: { archivedAt: true } } },
            })
            return (
              row && {
                creatorId: row.creatorId,
                assigneeId: row.assigneeId,
                projectArchived: row.project.archivedAt !== null,
              }
            )
          },
          async isMember(userId) {
            const member = await tx.organizationMember.findUnique({
              where: { organizationId_userId: { organizationId, userId } },
              select: { id: true },
            })
            return member !== null
          },
          async create(task) {
            // One atomic statement hands out each number once, even for concurrent requests: the
            // row lock makes the second update wait for the first transaction.
            const [{ number }] = await tx.$queryRaw<{ number: number }[]>`
              UPDATE projects SET next_task_number = next_task_number + 1
              WHERE id = ${task.projectId}::uuid AND organization_id = ${organizationId}::uuid
              RETURNING next_task_number - 1 AS number`
            const row = await tx.task.create({
              data: { organizationId, number, ...task },
              select: taskSelect,
            })
            return toTaskRecord(row)
          },
          async update(taskId, changes) {
            const row = await tx.task.update({ where: { id: taskId }, data: changes, select: taskSelect })
            return toTaskRecord(row)
          },
          async delete(taskId) {
            await tx.task.delete({ where: { id: taskId } })
          },
        }
        return run(write)
      })
    },
  }
}

function toWhere(organizationId: string, filter: TaskFilter): Prisma.TaskWhereInput {
  const { projectId, status, priority, assigneeId, creatorId, dueBefore, dueAfter, overdueAt, q } = filter
  const and: Prisma.TaskWhereInput[] = []
  if (dueBefore) and.push({ dueDate: { lt: new Date(dueBefore) } })
  if (dueAfter) and.push({ dueDate: { gt: new Date(dueAfter) } })
  if (overdueAt) and.push({ status: { not: 'done' }, dueDate: { lt: overdueAt } })
  return {
    organizationId,
    ...(projectId && { projectId }),
    ...(status && { status: { in: status } }),
    ...(priority && { priority: { in: priority } }),
    ...(assigneeId !== undefined && { assigneeId }),
    ...(creatorId && { creatorId }),
    ...(q && { title: containsText(q) }),
    AND: and,
  }
}

/** Every ordering ends with the id, so pages never overlap. */
function toOrderBy({ sort, order }: TaskFilter): Prisma.TaskOrderByWithRelationInput[] {
  const primary: Prisma.TaskOrderByWithRelationInput =
    sort === 'dueDate' ? { dueDate: { sort: order, nulls: 'last' } } : { [sort]: order }
  return [primary, { id: order }]
}

function toTaskRecord({ project, ...row }: TaskRow): TaskRecord {
  return { ...row, projectKey: project.key }
}
