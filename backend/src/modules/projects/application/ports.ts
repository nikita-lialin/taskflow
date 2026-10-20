import type { ProjectsQuery, ProjectTaskCounts } from '@taskflow/contracts'

export type ProjectRecord = {
  id: string
  key: string
  name: string
  description: string | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ProjectDetailRecord = ProjectRecord & { taskCounts: ProjectTaskCounts }

export type NewProject = {
  name: string
  key: string
  description: string | null
}

export type ProjectChanges = {
  name?: string
  description?: string | null
  archivedAt?: Date | null
}

/** Operations that run while the organization row is locked, so project writes queue up. */
export type ProjectsMutation = {
  isNameTaken(name: string, exceptProjectId?: string): Promise<boolean>
  isKeyTaken(key: string): Promise<boolean>
  find(projectId: string): Promise<ProjectRecord | null>
  create(project: NewProject): Promise<ProjectRecord>
  update(projectId: string, changes: ProjectChanges): Promise<ProjectRecord>
}

export interface ProjectsRepository {
  list(organizationId: string, query: ProjectsQuery): Promise<{ items: ProjectRecord[]; total: number }>
  findDetail(organizationId: string, projectId: string): Promise<ProjectDetailRecord | null>
  /** Resolves to `null` when the organization no longer exists. */
  withWriteLock<T>(
    organizationId: string,
    run: (mutation: ProjectsMutation) => Promise<T>,
  ): Promise<T | null>
}
