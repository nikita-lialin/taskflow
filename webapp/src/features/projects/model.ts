import type { ProjectDto, ProjectsQuery } from '@taskflow/contracts'

export const archivedFilterLabels: Record<ProjectsQuery['archived'], string> = {
  false: 'Active',
  true: 'Archived',
  all: 'All projects',
}

export function isArchived(project: Pick<ProjectDto, 'archivedAt'>) {
  return project.archivedAt !== null
}

/** Tasks can be created and edited only in active projects. */
export function projectAcceptsWork(project: Pick<ProjectDto, 'archivedAt'>) {
  return !isArchived(project)
}
