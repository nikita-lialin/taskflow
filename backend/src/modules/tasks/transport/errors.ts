import { AppError } from '../../../http/errors'
import { TasksFailure } from '../domain/errors'

export function toTasksAppError(error: unknown) {
  if (!(error instanceof TasksFailure)) return error

  if (error.kind === 'invalid') {
    return new AppError(400, 'VALIDATION_ERROR', error.message, error.details)
  }
  if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeTasks<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toTasksAppError(error)
  }
}
