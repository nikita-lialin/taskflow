import { expect, test } from 'bun:test'
import type { TaskActivityDto } from '@taskflow/contracts'

import { describeActivity } from '../src/features/tasks/activity-model'
import { formatDate } from '../src/platform/intl'

function activity(overrides: Partial<TaskActivityDto>): TaskActivityDto {
  return {
    actor: { displayName: 'Ada', email: 'ada@example.com', id: 'user-1' },
    createdAt: '2026-01-01T10:00:00.000Z',
    from: null,
    id: 'activity-1',
    taskId: 'task-1',
    to: null,
    type: 'created',
    ...overrides,
  }
}

test('every kind of change reads as a short sentence', () => {
  expect(describeActivity(activity({ type: 'created' }))).toBe('created this task')
  expect(describeActivity(activity({ from: 'Old', to: 'New', type: 'title_changed' }))).toBe(
    'renamed the task from “Old” to “New”',
  )
  expect(describeActivity(activity({ type: 'description_changed' }))).toBe(
    'changed the description',
  )
  expect(
    describeActivity(activity({ from: 'todo', to: 'in_progress', type: 'status_changed' })),
  ).toBe('moved the task from To Do to In Progress')
  expect(
    describeActivity(activity({ from: 'low', to: 'high', type: 'priority_changed' })),
  ).toBe('changed the priority from Low to High')
})

test('an assignee change says whether someone was added, removed, or replaced', () => {
  expect(describeActivity(activity({ to: 'Grace', type: 'assignee_changed' }))).toBe(
    'assigned the task to Grace',
  )
  expect(describeActivity(activity({ from: 'Grace', type: 'assignee_changed' }))).toBe(
    'unassigned Grace',
  )
  expect(
    describeActivity(activity({ from: 'Grace', to: 'Linus', type: 'assignee_changed' })),
  ).toBe('reassigned the task from Grace to Linus')
})

test('a due date change says whether it was set, cleared, or moved', () => {
  const first = '2030-01-15T10:00:00.000Z'
  const second = '2030-02-01T10:00:00.000Z'

  expect(describeActivity(activity({ to: first, type: 'due_date_changed' }))).toBe(
    `set the due date to ${formatDate(first)}`,
  )
  expect(describeActivity(activity({ from: first, type: 'due_date_changed' }))).toBe(
    'cleared the due date',
  )
  expect(
    describeActivity(activity({ from: first, to: second, type: 'due_date_changed' })),
  ).toBe(`moved the due date from ${formatDate(first)} to ${formatDate(second)}`)
})
