export type ProjectsFailureKind = 'forbidden' | 'not_found' | 'conflict'

export class ProjectsFailure extends Error {
  constructor(
    public readonly kind: ProjectsFailureKind,
    message: string,
  ) {
    super(message)
  }
}

/** One answer for an unknown project and for a project of another organization. */
export function projectNotFound() {
  return new ProjectsFailure('not_found', 'Project not found')
}
