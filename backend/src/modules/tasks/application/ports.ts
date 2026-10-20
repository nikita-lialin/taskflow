import type { TaskPriority, TaskStatus, TasksQuery } from '@taskflow/contracts'

export type TaskUserRecord = {
  id: string
  email: string
  displayName: string | null
}

export type TaskRecord = {
  id: string
  projectId: string
  projectKey: string
  number: number
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee: TaskUserRecord | null
  creator: TaskUserRecord
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NewTask = {
  projectId: string
  creatorId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  dueDate: Date | null
}

/** `TasksQuery` with the caller resolved: `me` and `none` become a user id or `null`. */
export type TaskFilter = Omit<TasksQuery, 'assigneeId' | 'creatorId' | 'overdue'> & {
  /** `null` selects unassigned tasks. */
  assigneeId?: string | null
  creatorId?: string
  /** Selects tasks that are not done and due before this time. */
  overdueAt?: Date
}

export type ProjectState = {
  id: string
  archivedAt: Date | null
}

/** Operations that run while the organization row is share-locked. See the repository. */
export type TaskCreation = {
  findProject(projectId: string): Promise<ProjectState | null>
  isMember(userId: string): Promise<boolean>
  /** Allocates the next number of the project and stores the task. */
  create(task: NewTask): Promise<TaskRecord>
}

export interface TasksRepository {
  list(organizationId: string, filter: TaskFilter): Promise<{ items: TaskRecord[]; total: number }>
  find(organizationId: string, taskId: string): Promise<TaskRecord | null>
  /** Resolves to `null` when the organization no longer exists. */
  withCreationLock<T>(
    organizationId: string,
    run: (creation: TaskCreation) => Promise<T>,
  ): Promise<T | null>
}
