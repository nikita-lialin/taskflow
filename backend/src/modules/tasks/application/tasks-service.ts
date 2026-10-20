import {
  type CreateTaskRequest,
  MAX_PAGE,
  type TaskDto,
  type TasksQuery,
} from '@taskflow/contracts'

import type { OrganizationMembership } from '../../organizations'
import {
  assigneeNotMember,
  projectNotFound,
  TasksFailure,
  taskNotFound,
} from '../domain/errors'
import type { TaskFilter, TaskRecord, TasksRepository, TaskUserRecord } from './ports'

type TasksServiceDependencies = {
  repository: TasksRepository
  now: () => Date
}

export class TasksService {
  constructor(private readonly dependencies: TasksServiceDependencies) {}

  async create(
    membership: OrganizationMembership,
    callerId: string,
    projectId: string,
    input: CreateTaskRequest,
  ) {
    const task = await this.dependencies.repository.withCreationLock(
      membership.organizationId,
      async (creation) => {
        const project = await creation.findProject(projectId)
        if (!project) throw projectNotFound()
        if (input.assigneeId && !(await creation.isMember(input.assigneeId))) {
          throw assigneeNotMember()
        }
        if (project.archivedAt) {
          throw new TasksFailure('conflict', 'Archived projects are read-only')
        }
        return creation.create({
          projectId,
          creatorId: callerId,
          title: input.title,
          description: input.description || null,
          status: input.status,
          priority: input.priority,
          assigneeId: input.assigneeId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        })
      },
    )
    if (task === null) throw new TasksFailure('not_found', 'Organization not found')
    return { task: toTaskDto(task) }
  }

  async list(membership: OrganizationMembership, callerId: string, query: TasksQuery) {
    const { items, total } = await this.dependencies.repository.list(
      membership.organizationId,
      this.toFilter(query, callerId),
    )
    return {
      items: items.map(toTaskDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasNext: query.page < MAX_PAGE && query.page * query.pageSize < total,
    }
  }

  async get(membership: OrganizationMembership, taskId: string) {
    const task = await this.dependencies.repository.find(membership.organizationId, taskId)
    if (!task) throw taskNotFound()
    return { task: toTaskDto(task) }
  }

  private toFilter({ assigneeId, creatorId, overdue, ...rest }: TasksQuery, callerId: string): TaskFilter {
    return {
      ...rest,
      ...(assigneeId !== undefined && {
        assigneeId: assigneeId === 'none' ? null : assigneeId === 'me' ? callerId : assigneeId,
      }),
      ...(creatorId !== undefined && { creatorId: creatorId === 'me' ? callerId : creatorId }),
      ...(overdue === 'true' && { overdueAt: this.dependencies.now() }),
    }
  }
}

function toUserDto({ id, email, displayName }: TaskUserRecord) {
  return { id, email, displayName }
}

function toTaskDto(record: TaskRecord): TaskDto {
  return {
    id: record.id,
    projectId: record.projectId,
    key: `${record.projectKey}-${record.number}`,
    number: record.number,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    assignee: record.assignee && toUserDto(record.assignee),
    creator: toUserDto(record.creator),
    dueDate: record.dueDate?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}
