import {
  taskPrioritySchema,
  taskStatusSchema,
  type OrganizationRole,
  type TaskDto,
  type TaskPriority,
  type TasksQuery,
  type TasksResponse,
  type TaskStatus,
  type TaskUserDto,
  type UpdateTaskRequest,
} from '@taskflow/contracts'

export const TASK_STATUSES = taskStatusSchema.options
export const TASK_PRIORITIES = taskPrioritySchema.options

export const taskStatusLabels: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export function userLabel(user: Pick<TaskUserDto, 'displayName' | 'email'>) {
  return user.displayName ?? user.email
}

/** Up to two letters for an avatar: the first letters of the first two words of the name. */
export function userInitials(user: Pick<TaskUserDto, 'displayName' | 'email'>) {
  return userLabel(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}

/** The column page without a task, for the column the task leaves. Returns the same page when absent. */
export function removeTaskFromPage(page: TasksResponse, taskId: string): TasksResponse {
  if (!page.items.some((item) => item.id === taskId)) return page
  return {
    ...page,
    items: page.items.filter((item) => item.id !== taskId),
    total: page.total - 1,
  }
}

/** The column page with the task first, for the column the task enters. */
export function addTaskToPage(page: TasksResponse, task: TaskDto, status: TaskStatus): TasksResponse {
  if (page.items.some((item) => item.id === task.id)) return page
  return { ...page, items: [{ ...task, status }, ...page.items], total: page.total + 1 }
}

/**
 * What the signed-in person may do with a task (SPEC section 3). Admins change every task.
 * Members change tasks they created or that are assigned to them, and delete only their own.
 * Tasks of an archived project are read-only. The backend enforces the same rules.
 */
export function taskPermissions({
  projectArchived,
  task,
  viewerId,
  viewerRole,
}: {
  projectArchived: boolean
  task: Pick<TaskDto, 'assignee' | 'creator'>
  viewerId: string
  viewerRole: OrganizationRole
}) {
  const isAdmin = viewerRole === 'admin'
  const isCreator = task.creator.id === viewerId
  const isAssignee = task.assignee?.id === viewerId
  return {
    canEdit: !projectArchived && (isAdmin || isCreator || isAssignee),
    canDelete: !projectArchived && (isAdmin || isCreator),
  }
}

export type TaskPermissions = ReturnType<typeof taskPermissions>

/** `any` adds no filter, `me` and `none` are the keywords of the API, anything else is a user id. */
export type AssigneeFilter = 'any' | 'me' | 'none' | (string & {})

export type TaskFilters = {
  assignee: AssigneeFilter
  priority: TaskPriority | 'any'
  projectId: string | 'any'
  q: string
  status: TaskStatus | 'any'
}

export const emptyTaskFilters: TaskFilters = {
  assignee: 'any',
  priority: 'any',
  projectId: 'any',
  q: '',
  status: 'any',
}

export function hasActiveFilters(filters: TaskFilters) {
  return (
    filters.assignee !== 'any' ||
    filters.priority !== 'any' ||
    filters.projectId !== 'any' ||
    filters.q.trim() !== '' ||
    filters.status !== 'any'
  )
}

export function tasksQueryFromFilters(
  filters: TaskFilters,
  paging: Pick<TasksQuery, 'page' | 'pageSize'> & Partial<Pick<TasksQuery, 'order' | 'sort'>>,
): Partial<TasksQuery> {
  const q = filters.q.trim()
  return {
    ...paging,
    assigneeId: filters.assignee === 'any' ? undefined : filters.assignee,
    priority: filters.priority === 'any' ? undefined : [filters.priority],
    projectId: filters.projectId === 'any' ? undefined : filters.projectId,
    q: q === '' ? undefined : q,
    status: filters.status === 'any' ? undefined : [filters.status],
  }
}

/** A task is overdue when it is open and its due date has passed. */
export function isOverdue(task: Pick<TaskDto, 'dueDate' | 'status'>, now = new Date()) {
  return task.status !== 'done' && task.dueDate !== null && Date.parse(task.dueDate) < now.getTime()
}

/**
 * The due date is a calendar day for the person, so it round-trips through the local time zone:
 * `2026-03-05` is stored as local midnight and shown as the same day again.
 */
export function dueDateToIso(day: string): string | null {
  if (day === '') return null
  const date = new Date(`${day}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function isoToDueDateInput(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export type TaskFormValues = {
  assigneeId: string
  description: string
  dueDate: string
  priority: TaskPriority
  status: TaskStatus
  title: string
}

export function taskToFormValues(task: TaskDto): TaskFormValues {
  return {
    assigneeId: task.assignee?.id ?? '',
    description: task.description ?? '',
    dueDate: isoToDueDateInput(task.dueDate),
    priority: task.priority,
    status: task.status,
    title: task.title,
  }
}

/**
 * The fields of the form that differ from the saved task. The API takes a partial update, so an
 * untouched field is never sent and cannot overwrite another person's change to it. An empty
 * description, assignee, or due date clears the field with `null`.
 */
export function buildTaskUpdate(task: TaskDto, values: TaskFormValues): UpdateTaskRequest {
  const saved = taskToFormValues(task)
  const update: UpdateTaskRequest = {}
  if (values.title !== saved.title) update.title = values.title
  if (values.description !== saved.description) {
    update.description = values.description.trim() === '' ? null : values.description
  }
  if (values.status !== saved.status) update.status = values.status
  if (values.priority !== saved.priority) update.priority = values.priority
  if (values.assigneeId !== saved.assigneeId) {
    update.assigneeId = values.assigneeId === '' ? null : values.assigneeId
  }
  if (values.dueDate !== saved.dueDate) update.dueDate = dueDateToIso(values.dueDate)
  return update
}

/**
 * The form values with the saves that are still in flight applied in order. A field shows what the
 * person chose at once, and goes back to the saved value if the save fails.
 */
export function applyPendingUpdates(
  values: TaskFormValues,
  updates: ReadonlyArray<UpdateTaskRequest>,
): TaskFormValues {
  if (updates.length === 0) return values
  const shown = { ...values }
  for (const update of updates) {
    if (update.title !== undefined) shown.title = update.title
    if (update.description !== undefined) shown.description = update.description ?? ''
    if (update.status !== undefined) shown.status = update.status
    if (update.priority !== undefined) shown.priority = update.priority
    if (update.assigneeId !== undefined) shown.assigneeId = update.assigneeId ?? ''
    if (update.dueDate !== undefined) shown.dueDate = isoToDueDateInput(update.dueDate)
  }
  return shown
}
