import {
  createProjectRequestSchema,
  projectDetailResponseSchema,
  projectResponseSchema,
  projectsQuerySchema,
  projectsResponseSchema,
  updateProjectRequestSchema,
  type CreateProjectRequest,
  type ProjectsQuery,
  type UpdateProjectRequest,
} from '@taskflow/contracts'

import { buildQueryString, type AuthenticatedTransport } from '@/platform/api'

type ReadOptions = { signal?: AbortSignal }

function projectsPath(organizationId: string) {
  return `/api/organizations/${encodeURIComponent(organizationId)}/projects`
}

export function listProjects(
  transport: AuthenticatedTransport,
  organizationId: string,
  input: Partial<ProjectsQuery>,
  options: ReadOptions = {},
) {
  const query = projectsQuerySchema.parse(input)
  return transport.request(
    `${projectsPath(organizationId)}${buildQueryString(query)}`,
    projectsResponseSchema,
    options,
  )
}

export function getProject(
  transport: AuthenticatedTransport,
  organizationId: string,
  projectId: string,
  options: ReadOptions = {},
) {
  return transport.request(
    `${projectsPath(organizationId)}/${encodeURIComponent(projectId)}`,
    projectDetailResponseSchema,
    options,
  )
}

export function createProject(
  transport: AuthenticatedTransport,
  organizationId: string,
  input: CreateProjectRequest,
) {
  return transport.request(projectsPath(organizationId), projectResponseSchema, {
    method: 'POST',
    body: createProjectRequestSchema.parse(input),
  })
}

export function updateProject(
  transport: AuthenticatedTransport,
  organizationId: string,
  projectId: string,
  input: UpdateProjectRequest,
) {
  return transport.request(
    `${projectsPath(organizationId)}/${encodeURIComponent(projectId)}`,
    projectResponseSchema,
    { method: 'PATCH', body: updateProjectRequestSchema.parse(input) },
  )
}
