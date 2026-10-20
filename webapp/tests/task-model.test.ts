import { expect, test } from 'bun:test'
import type { TaskDto } from '@taskflow/contracts'

import { commentPermissions, isEdited, lastCommentPage } from '../src/features/comments/model'
import {
  addTaskToPage,
  applyPendingUpdates,
  buildTaskUpdate,
  dueDateToIso,
  emptyTaskFilters,
  hasActiveFilters,
  isOverdue,
  isoToDueDateInput,
  removeTaskFromPage,
  taskPermissions,
  tasksQueryFromFilters,
  taskToFormValues,
  userInitials,
} from '../src/features/tasks/model'

const creator = { displayName: 'Creator', email: 'creator@example.com', id: 'creator' }
const assignee = { displayName: null, email: 'assignee@example.com', id: 'assignee' }

function task(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    assignee,
    createdAt: '2026-01-01T00:00:00.000Z',
    creator,
    description: 'Details',
    dueDate: null,
    id: 'task-1',
    key: 'WEB-1',
    number: 1,
    priority: 'medium',
    projectId: 'project-1',
    status: 'todo',
    title: 'Write tests',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const open = { projectArchived: false }

test('admins edit and delete every task', () => {
  expect(taskPermissions({ ...open, task: task(), viewerId: 'other', viewerRole: 'admin' })).toEqual({
    canDelete: true,
    canEdit: true,
  })
})

test('members edit their own and assigned tasks, and delete only their own', () => {
  expect(taskPermissions({ ...open, task: task(), viewerId: 'creator', viewerRole: 'member' })).toEqual({
    canDelete: true,
    canEdit: true,
  })
  expect(taskPermissions({ ...open, task: task(), viewerId: 'assignee', viewerRole: 'member' })).toEqual({
    canDelete: false,
    canEdit: true,
  })
  expect(taskPermissions({ ...open, task: task(), viewerId: 'other', viewerRole: 'member' })).toEqual({
    canDelete: false,
    canEdit: false,
  })
})

test('tasks of an archived project are read-only for everyone', () => {
  const archived = { projectArchived: true, task: task() }

  expect(taskPermissions({ ...archived, viewerId: 'creator', viewerRole: 'admin' })).toEqual({
    canDelete: false,
    canEdit: false,
  })
  expect(taskPermissions({ ...archived, viewerId: 'creator', viewerRole: 'member' })).toEqual({
    canDelete: false,
    canEdit: false,
  })
})

test('comments: authors edit, authors and admins delete, archived projects freeze them', () => {
  const comment = { author: creator }

  expect(commentPermissions({ comment, readOnly: false, viewerId: 'creator', viewerRole: 'member' })).toEqual({
    canDelete: true,
    canEdit: true,
  })
  expect(commentPermissions({ comment, readOnly: false, viewerId: 'other', viewerRole: 'admin' })).toEqual({
    canDelete: true,
    canEdit: false,
  })
  expect(commentPermissions({ comment, readOnly: false, viewerId: 'other', viewerRole: 'member' })).toEqual({
    canDelete: false,
    canEdit: false,
  })
  expect(commentPermissions({ comment, readOnly: true, viewerId: 'creator', viewerRole: 'admin' })).toEqual({
    canDelete: false,
    canEdit: false,
  })
})

test('a comment counts as edited when it changed after creation', () => {
  expect(isEdited({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })).toBe(false)
  expect(isEdited({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:05:00.000Z' })).toBe(true)
})

test('the newest comment sits on the last page', () => {
  expect(lastCommentPage(0)).toBe(1)
  expect(lastCommentPage(20)).toBe(1)
  expect(lastCommentPage(21)).toBe(2)
})

test('filters become API query parameters, and "any" adds none', () => {
  const paging = { page: 2, pageSize: 20 }

  expect(tasksQueryFromFilters(emptyTaskFilters, paging)).toEqual({
    ...paging,
    assigneeId: undefined,
    priority: undefined,
    projectId: undefined,
    q: undefined,
    status: undefined,
  })
  expect(
    tasksQueryFromFilters(
      { assignee: 'me', priority: 'high', projectId: 'p1', q: '  bug ', status: 'done' },
      paging,
    ),
  ).toEqual({
    ...paging,
    assigneeId: 'me',
    priority: ['high'],
    projectId: 'p1',
    q: 'bug',
    status: ['done'],
  })
})

test('a blank search is not an active filter', () => {
  expect(hasActiveFilters({ ...emptyTaskFilters, q: '   ' })).toBe(false)
  expect(hasActiveFilters({ ...emptyTaskFilters, priority: 'low' })).toBe(true)
})

test('only open tasks past their due date are overdue', () => {
  const now = new Date('2026-06-15T12:00:00.000Z')

  expect(isOverdue({ dueDate: '2026-06-01T00:00:00.000Z', status: 'todo' }, now)).toBe(true)
  expect(isOverdue({ dueDate: '2026-06-01T00:00:00.000Z', status: 'done' }, now)).toBe(false)
  expect(isOverdue({ dueDate: '2026-07-01T00:00:00.000Z', status: 'todo' }, now)).toBe(false)
  expect(isOverdue({ dueDate: null, status: 'todo' }, now)).toBe(false)
})

test('a due date day survives the round trip through the API timestamp', () => {
  const iso = dueDateToIso('2026-03-05')

  expect(iso).not.toBeNull()
  expect(isoToDueDateInput(iso)).toBe('2026-03-05')
  expect(dueDateToIso('')).toBeNull()
  expect(isoToDueDateInput(null)).toBe('')
})

test('an update carries only the changed fields', () => {
  const saved = task()
  const values = taskToFormValues(saved)

  expect(buildTaskUpdate(saved, values)).toEqual({})
  expect(buildTaskUpdate(saved, { ...values, status: 'done', title: 'New title' })).toEqual({
    status: 'done',
    title: 'New title',
  })
})

test('clearing the description, assignee, or due date sends null', () => {
  const saved = task({ dueDate: dueDateToIso('2026-03-05') })
  const values = { ...taskToFormValues(saved), assigneeId: '', description: '', dueDate: '' }

  expect(buildTaskUpdate(saved, values)).toEqual({
    assigneeId: null,
    description: null,
    dueDate: null,
  })
})

function page(items: TaskDto[], total = items.length) {
  return { hasNext: false, items, page: 1, pageSize: 50, total }
}

test('removing a task drops it from the column and lowers the total', () => {
  const kept = task({ id: 'task-2' })
  const result = removeTaskFromPage(page([task(), kept], 7), 'task-1')

  expect(result.items).toEqual([kept])
  expect(result.total).toBe(6)
})

test('removing a task that is not in the column changes nothing', () => {
  const column = page([task()], 7)

  expect(removeTaskFromPage(column, 'other')).toBe(column)
})

test('adding a task puts it first with its new status and raises the total', () => {
  const existing = task({ id: 'task-2', status: 'done' })
  const result = addTaskToPage(page([existing]), task(), 'done')

  expect(result.items.map((item) => item.id)).toEqual(['task-1', 'task-2'])
  expect(result.items[0]?.status).toBe('done')
  expect(result.total).toBe(2)
})

test('adding a task that is already in the column does not duplicate it', () => {
  const column = page([task({ status: 'done' })])

  expect(addTaskToPage(column, task(), 'done')).toBe(column)
})

test('initials come from the name, or from the email when there is no name', () => {
  expect(userInitials({ displayName: 'Ada Lovelace', email: 'ada@example.com' })).toBe('AL')
  expect(userInitials({ displayName: 'Plato', email: 'plato@example.com' })).toBe('P')
  expect(userInitials({ displayName: null, email: 'grace.hopper@example.com' })).toBe('G')
})

test('saves that are still in flight show their values before the server answers', () => {
  const values = taskToFormValues(task({ dueDate: dueDateToIso('2026-03-05') }))
  const shown = applyPendingUpdates(values, [
    { status: 'done' },
    { assigneeId: null, dueDate: null },
    { description: null, priority: 'high', title: 'Renamed' },
  ])

  expect(shown).toEqual({
    assigneeId: '',
    description: '',
    dueDate: '',
    priority: 'high',
    status: 'done',
    title: 'Renamed',
  })
  expect(applyPendingUpdates(values, [])).toBe(values)
})
