export type TasksFailureKind = 'not_found' | 'conflict' | 'invalid'

export class TasksFailure extends Error {
  constructor(
    public readonly kind: TasksFailureKind,
    message: string,
    /** For `invalid`: the request fields at fault, in the shape of validation issues. */
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

/** One answer for an unknown task and for a task of another organization. */
export function taskNotFound() {
  return new TasksFailure('not_found', 'Task not found')
}

/** One answer for an unknown project and for a project of another organization. */
export function projectNotFound() {
  return new TasksFailure('not_found', 'Project not found')
}

export function assigneeNotMember() {
  const message = 'Assignee must be a member of the organization'
  return new TasksFailure('invalid', message, [{ code: 'custom', path: ['assigneeId'], message }])
}
