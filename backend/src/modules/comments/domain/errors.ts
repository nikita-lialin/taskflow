export type CommentsFailureKind = 'forbidden' | 'not_found' | 'conflict'

export class CommentsFailure extends Error {
  constructor(
    public readonly kind: CommentsFailureKind,
    message: string,
  ) {
    super(message)
  }
}

/** One answer for an unknown task and for a task of another organization. */
export function taskNotFound() {
  return new CommentsFailure('not_found', 'Task not found')
}

/** One answer for an unknown comment, a comment of another task, and a comment of another organization. */
export function commentNotFound() {
  return new CommentsFailure('not_found', 'Comment not found')
}

export function projectArchived() {
  return new CommentsFailure('conflict', 'Archived projects are read-only')
}

export function commentForbidden() {
  return new CommentsFailure('forbidden', 'You cannot change this comment')
}
