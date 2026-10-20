import type {
  TaskActivityQuery,
  TaskActivityType,
  TaskPriority,
  TasksQuery,
  TaskStatus,
} from '@taskflow/contracts'

import type { ActivityEntry, TaskSnapshot } from '../domain/activity'

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

/**
 * The fields that decide who may change a task, and whether its project is frozen, with the values
 * the journal compares an update against.
 */
export type TaskAccess = {
  creatorId: string
  assigneeId: string | null
  projectArchived: boolean
  snapshot: TaskSnapshot
}

export type TaskActivityRecord = {
  id: string
  taskId: string
  type: TaskActivityType
  actor: TaskUserRecord
  from: string | null
  to: string | null
  createdAt: Date
}

export type TaskChanges = Partial<
  Pick<NewTask, 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'dueDate'>
>

export type ProjectState = {
  id: string
  archivedAt: Date | null
}

/** Operations that run while the organization row is share-locked. See the repository. */
export type TaskWrite = {
  findProject(projectId: string): Promise<ProjectState | null>
  findTask(taskId: string): Promise<TaskAccess | null>
  isMember(userId: string): Promise<boolean>
  /** Allocates the next number of the project and stores the task. */
  create(task: NewTask): Promise<TaskRecord>
  update(taskId: string, changes: TaskChanges): Promise<TaskRecord>
  /** Adds journal entries for one task, all made by one person at one moment. */
  recordActivity(taskId: string, actorId: string, entries: ActivityEntry[]): Promise<void>
  /** Removes the task and, with it, its comments and journal. */
  delete(taskId: string): Promise<void>
}

export interface TasksRepository {
  list(organizationId: string, filter: TaskFilter): Promise<{ items: TaskRecord[]; total: number }>
  find(organizationId: string, taskId: string): Promise<TaskRecord | null>
  /** Newest first. Resolves to `null` when the task is not in the organization. */
  listActivity(
    organizationId: string,
    taskId: string,
    query: TaskActivityQuery,
  ): Promise<{ items: TaskActivityRecord[]; total: number } | null>
  /** Resolves to `null` when the organization no longer exists. */
  withWriteLock<T>(organizationId: string, run: (write: TaskWrite) => Promise<T>): Promise<T | null>
}
