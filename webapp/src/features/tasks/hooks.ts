import { useMemo } from 'react'

import { useMembersQuery } from '@/features/organizations'
import { isArchived, useProjectOptionsQuery } from '@/features/projects'

/** Projects of the organization plus the ids of the archived ones, whose tasks are read-only. */
export function useProjectIndex(organizationId: string) {
  const query = useProjectOptionsQuery(organizationId)
  const projects = useMemo(() => query.data?.items ?? [], [query.data])
  const archivedIds = useMemo(
    () => new Set(projects.filter(isArchived).map((project) => project.id)),
    [projects],
  )
  return { archivedIds, projects, query }
}

export function useMemberOptions(organizationId: string) {
  const query = useMembersQuery(organizationId)
  const members = useMemo(() => query.data?.items ?? [], [query.data])
  return { members, query }
}
