import {
  type CreateTaskRequest,
  MAX_PAGE,
  type TaskDto,
  type TasksQuery,
  type UpdateTaskRequest,
} from '@taskflow/contracts'

import type { OrganizationMembership } from '../../organizations'
import {
  assigneeNotMember,
  projectArchived,
  projectNotFound,
  TasksFailure,
  taskForbidden,
  taskNotFound,
} from '../domain/errors'
import { canDeleteTask, canEditTask } from '../domain/permissions'
import type {
  TaskChanges,
  TaskFilter,
  TaskRecord,
  TasksRepository,
  TaskUserRecord,
  TaskWrite,
} from './ports'

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
    const task = await this.write(membership, async (write) => {
      const project = await write.findProject(projectId)
      if (!project) throw projectNotFound()
      if (input.assigneeId && !(await write.isMember(input.assigneeId))) throw assigneeNotMember()
      if (project.archivedAt) throw projectArchived()
      return write.create({
        projectId,
        creatorId: callerId,
        title: input.title,
        description: input.description || null,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      })
    })
    return { task: toTaskDto(task) }
  }

  async update(
    membership: OrganizationMembership,
    callerId: string,
    taskId: string,
    input: UpdateTaskRequest,
  ) {
    const task = await this.write(membership, async (write) => {
      const current = await write.findTask(taskId)
      if (!current) throw taskNotFound()
      if (!canEditTask(membership, callerId, current)) throw taskForbidden()
      if (input.assigneeId && !(await write.isMember(input.assigneeId))) throw assigneeNotMember()
      if (current.projectArchived) throw projectArchived()
      return write.update(taskId, toChanges(input))
    })
    return { task: toTaskDto(task) }
  }

  async delete(membership: OrganizationMembership, callerId: string, taskId: string) {
    await this.write(membership, async (write) => {
      const current = await write.findTask(taskId)
      if (!current) throw taskNotFound()
      if (!canDeleteTask(membership, callerId, current)) throw taskForbidden()
      if (current.projectArchived) throw projectArchived()
      await write.delete(taskId)
    })
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

  private async write<T>(
    membership: OrganizationMembership,
    run: (write: TaskWrite) => Promise<T>,
  ): Promise<T> {
    const result = await this.dependencies.repository.withWriteLock(membership.organizationId, run)
    if (result === null) throw new TasksFailure('not_found', 'Organization not found')
    return result
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

function toChanges({ description, dueDate, ...rest }: UpdateTaskRequest): TaskChanges {
  return {
    ...rest,
    ...(description !== undefined && { description: description || null }),
    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
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
