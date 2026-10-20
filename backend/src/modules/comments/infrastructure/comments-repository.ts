import type { DbClient } from '../../../db'
import type { CommentsRepository, CommentWrite } from '../application/ports'

const commentSelect = {
  id: true,
  taskId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, email: true, displayName: true } },
} as const

export function createPrismaCommentsRepository(db: DbClient): CommentsRepository {
  return {
    async list(organizationId, taskId, { page, pageSize }) {
      const where = { organizationId, taskId }
      // One transaction keeps the task check, the count, and the page consistent with each other.
      return db.$transaction(async (tx) => {
        const task = await tx.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } })
        if (!task) return null
        const [total, items] = await Promise.all([
          tx.comment.count({ where }),
          tx.comment.findMany({
            where,
            // The id breaks ties, so pages never overlap.
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: commentSelect,
          }),
        ])
        return { items, total }
      })
    },

    withWriteLock(organizationId, run) {
      return db.$transaction(async (tx) => {
        // A share lock lets comment writes run side by side. It still blocks project writes, which
        // lock the row for update, so the archive check stays true until the comment is stored.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR SHARE`
        if (locked.length === 0) return null

        const write: CommentWrite = {
          async findTaskProject(taskId) {
            const row = await tx.task.findFirst({
              where: { id: taskId, organizationId },
              select: { project: { select: { archivedAt: true } } },
            })
            return row && { archived: row.project.archivedAt !== null }
          },
          async findComment(taskId, commentId) {
            const row = await tx.comment.findFirst({
              where: { id: commentId, taskId, organizationId },
              select: { authorId: true, task: { select: { project: { select: { archivedAt: true } } } } },
            })
            return row && { authorId: row.authorId, projectArchived: row.task.project.archivedAt !== null }
          },
          create({ createdAt, ...comment }) {
            // Both timestamps come from one value, so a comment that nobody edited has equal ones.
            return tx.comment.create({
              data: { organizationId, createdAt, updatedAt: createdAt, ...comment },
              select: commentSelect,
            })
          },
          update(commentId, body) {
            return tx.comment.update({ where: { id: commentId }, data: { body }, select: commentSelect })
          },
          async delete(commentId) {
            await tx.comment.delete({ where: { id: commentId } })
          },
        }
        return run(write)
      })
    },
  }
}
