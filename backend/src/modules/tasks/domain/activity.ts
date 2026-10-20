import type { TaskActivityType, TaskPriority, TaskStatus } from '@taskflow/contracts'

/** The fields of a task that the journal compares. */
export type TaskSnapshot = {
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee: { id: string; email: string; displayName: string | null } | null
  dueDate: Date | null
}

export type ActivityEntry = {
  type: TaskActivityType
  from: string | null
  to: string | null
}

const personLabel = (person: TaskSnapshot['assignee']) => person && (person.displayName ?? person.email)

/**
 * One entry for each field whose value differs, in a fixed order. A description keeps no text,
 * because it can be long: the entry only says that it changed.
 */
export function describeChanges(before: TaskSnapshot, after: TaskSnapshot): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  if (before.title !== after.title) {
    entries.push({ type: 'title_changed', from: before.title, to: after.title })
  }
  if (before.description !== after.description) {
    entries.push({ type: 'description_changed', from: null, to: null })
  }
  if (before.status !== after.status) {
    entries.push({ type: 'status_changed', from: before.status, to: after.status })
  }
  if (before.priority !== after.priority) {
    entries.push({ type: 'priority_changed', from: before.priority, to: after.priority })
  }
  if (before.assignee?.id !== after.assignee?.id) {
    entries.push({
      type: 'assignee_changed',
      from: personLabel(before.assignee),
      to: personLabel(after.assignee),
    })
  }
  if (before.dueDate?.getTime() !== after.dueDate?.getTime()) {
    entries.push({
      type: 'due_date_changed',
      from: before.dueDate?.toISOString() ?? null,
      to: after.dueDate?.toISOString() ?? null,
    })
  }
  return entries
}
