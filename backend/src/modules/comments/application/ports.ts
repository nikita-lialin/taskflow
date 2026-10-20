import type { CommentsQuery } from '@taskflow/contracts'

export type CommentUserRecord = {
  id: string
  email: string
  displayName: string | null
}

export type CommentRecord = {
  id: string
  taskId: string
  author: CommentUserRecord
  body: string
  createdAt: Date
  updatedAt: Date
}

/** Who wrote a comment, and whether its project is frozen. */
export type CommentAccess = {
  authorId: string
  projectArchived: boolean
}

/** Operations that run while the organization row is share-locked. See the repository. */
export type CommentWrite = {
  /** Resolves to the state of the task's project, or `null` when the task is not in the organization. */
  findTaskProject(taskId: string): Promise<{ archived: boolean } | null>
  findComment(taskId: string, commentId: string): Promise<CommentAccess | null>
  create(comment: { taskId: string; authorId: string; body: string; createdAt: Date }): Promise<CommentRecord>
  update(commentId: string, body: string): Promise<CommentRecord>
  delete(commentId: string): Promise<void>
}

export interface CommentsRepository {
  /** Resolves to `null` when the task is not in the organization. Oldest comments come first. */
  list(
    organizationId: string,
    taskId: string,
    page: CommentsQuery,
  ): Promise<{ items: CommentRecord[]; total: number } | null>
  /** Resolves to `null` when the organization no longer exists. */
  withWriteLock<T>(organizationId: string, run: (write: CommentWrite) => Promise<T>): Promise<T | null>
}
