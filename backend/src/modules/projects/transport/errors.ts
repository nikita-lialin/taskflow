import { AppError } from '../../../http/errors'
import { ProjectsFailure } from '../domain/errors'

export function toProjectsAppError(error: unknown) {
  if (!(error instanceof ProjectsFailure)) return error

  if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
  if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeProjects<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toProjectsAppError(error)
  }
}
