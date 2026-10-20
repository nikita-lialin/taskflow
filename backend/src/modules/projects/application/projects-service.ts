import {
  type CreateProjectRequest,
  MAX_PAGE,
  type ProjectDetailDto,
  type ProjectDto,
  type ProjectsQuery,
  type UpdateProjectRequest,
} from '@taskflow/contracts'

import type { OrganizationMembership } from '../../organizations'
import { ProjectsFailure, projectNotFound } from '../domain/errors'
import type {
  ProjectChanges,
  ProjectDetailRecord,
  ProjectRecord,
  ProjectsMutation,
  ProjectsRepository,
} from './ports'

type ProjectsServiceDependencies = {
  repository: ProjectsRepository
  now: () => Date
}

export class ProjectsService {
  constructor(private readonly dependencies: ProjectsServiceDependencies) {}

  async create(membership: OrganizationMembership, input: CreateProjectRequest) {
    requireAdmin(membership)
    const project = await this.write(membership, async (mutation) => {
      if (await mutation.isNameTaken(input.name)) {
        throw new ProjectsFailure('conflict', 'A project with this name already exists')
      }
      if (await mutation.isKeyTaken(input.key)) {
        throw new ProjectsFailure('conflict', 'A project with this key already exists')
      }
      return mutation.create({
        name: input.name,
        key: input.key,
        description: input.description || null,
      })
    })
    return { project: toProjectDto(project) }
  }

  async list(membership: OrganizationMembership, query: ProjectsQuery) {
    const { items, total } = await this.dependencies.repository.list(membership.organizationId, query)
    return {
      items: items.map(toProjectDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasNext: query.page < MAX_PAGE && query.page * query.pageSize < total,
    }
  }

  async get(membership: OrganizationMembership, projectId: string) {
    const project = await this.dependencies.repository.findDetail(membership.organizationId, projectId)
    if (!project) throw projectNotFound()
    return { project: toProjectDetailDto(project) }
  }

  async update(membership: OrganizationMembership, projectId: string, input: UpdateProjectRequest) {
    requireAdmin(membership)
    const project = await this.write(membership, async (mutation) => {
      const current = await mutation.find(projectId)
      if (!current) throw projectNotFound()
      if (input.name !== undefined && (await mutation.isNameTaken(input.name, projectId))) {
        throw new ProjectsFailure('conflict', 'A project with this name already exists')
      }
      return mutation.update(projectId, toChanges(current, input, this.dependencies.now()))
    })
    return { project: toProjectDto(project) }
  }

  private async write<T>(
    membership: OrganizationMembership,
    run: (mutation: ProjectsMutation) => Promise<T>,
  ): Promise<T> {
    const result = await this.dependencies.repository.withWriteLock(membership.organizationId, run)
    if (result === null) throw new ProjectsFailure('not_found', 'Organization not found')
    return result
  }
}

function requireAdmin(membership: OrganizationMembership) {
  if (membership.role !== 'admin') {
    throw new ProjectsFailure('forbidden', 'Organization administrator access required')
  }
}

/** Archiving an archived project keeps its first archive time. */
function toChanges(current: ProjectRecord, input: UpdateProjectRequest, now: Date): ProjectChanges {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description || null }),
    ...(input.archived !== undefined && {
      archivedAt: input.archived ? (current.archivedAt ?? now) : null,
    }),
  }
}

function toProjectDto(record: ProjectRecord): ProjectDto {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    description: record.description,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toProjectDetailDto(record: ProjectDetailRecord): ProjectDetailDto {
  return { ...toProjectDto(record), taskCounts: record.taskCounts }
}
