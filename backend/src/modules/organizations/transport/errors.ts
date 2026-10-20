import { AppError } from '../../../http/errors'
import { OrganizationsFailure } from '../domain/errors'

export function toOrganizationsAppError(error: unknown) {
  if (!(error instanceof OrganizationsFailure)) return error

  if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
  if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeOrganizations<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toOrganizationsAppError(error)
  }
}
