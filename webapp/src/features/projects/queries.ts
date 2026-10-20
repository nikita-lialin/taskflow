import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateProjectRequest, ProjectsQuery } from '@taskflow/contracts'

import { useAuth } from '@/features/auth'
import { organizationScopeKey } from '@/features/organizations'
import type { AuthenticatedTransport } from '@/platform/api'
import { createProject, getProject, listProjects, updateProject } from './api'

export const projectKeys = {
  all: (organizationId: string) => [...organizationScopeKey(organizationId), 'projects'] as const,
  list: (organizationId: string, query: Partial<ProjectsQuery>) =>
    [...projectKeys.all(organizationId), 'list', query] as const,
  detail: (organizationId: string, projectId: string) =>
    [...projectKeys.all(organizationId), 'detail', projectId] as const,
}

/** The most projects one list request returns. Pickers show these and nothing deeper. */
export const PROJECT_PICKER_SIZE = 100

export function projectsQueryOptions(
  transport: AuthenticatedTransport,
  organizationId: string,
  query: Partial<ProjectsQuery>,
) {
  return queryOptions({
    queryKey: projectKeys.list(organizationId, query),
    queryFn: ({ signal }) => listProjects(transport, organizationId, query, { signal }),
  })
}

export function projectQueryOptions(
  transport: AuthenticatedTransport,
  organizationId: string,
  projectId: string,
) {
  return queryOptions({
    queryKey: projectKeys.detail(organizationId, projectId),
    queryFn: ({ signal }) => getProject(transport, organizationId, projectId, { signal }),
  })
}

export function useProjectsQuery(organizationId: string, query: Partial<ProjectsQuery>) {
  const auth = useAuth()
  return useQuery(projectsQueryOptions(auth.transport, organizationId, query))
}

/** Active and archived projects, for labels and filters that must resolve any task's project. */
export function useProjectOptionsQuery(organizationId: string) {
  return useProjectsQuery(organizationId, {
    archived: 'all',
    page: 1,
    pageSize: PROJECT_PICKER_SIZE,
  })
}

export function useProjectQuery(organizationId: string, projectId: string) {
  const auth = useAuth()
  return useQuery(projectQueryOptions(auth.transport, organizationId, projectId))
}

export function useCreateProjectMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectRequest) => createProject(auth.transport, organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all(organizationId) }),
  })
}

export function useSetProjectArchivedMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ archived, projectId }: { archived: boolean; projectId: string }) =>
      updateProject(auth.transport, organizationId, projectId, { archived }),
    // Archiving makes a project read-only, which changes what its tasks allow.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizationScopeKey(organizationId) }),
  })
}
