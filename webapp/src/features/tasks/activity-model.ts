import {
  taskPrioritySchema,
  taskStatusSchema,
  type TaskActivityDto,
} from '@taskflow/contracts'

import { formatDate } from '@/platform/intl'
import { taskPriorityLabels, taskStatusLabels } from './model'

/** A status or priority is stored as its value. An unknown value is shown as it is. */
function statusLabel(value: string | null) {
  const parsed = taskStatusSchema.safeParse(value)
  return parsed.success ? taskStatusLabels[parsed.data] : (value ?? '–')
}

function priorityLabel(value: string | null) {
  const parsed = taskPrioritySchema.safeParse(value)
  return parsed.success ? taskPriorityLabels[parsed.data] : (value ?? '–')
}

/** What one journal entry says, without the name of the person who made it. */
export function describeActivity({ from, to, type }: TaskActivityDto): string {
  switch (type) {
    case 'created':
      return 'created this task'
    case 'title_changed':
      return `renamed the task from “${from}” to “${to}”`
    case 'description_changed':
      return 'changed the description'
    case 'status_changed':
      return `moved the task from ${statusLabel(from)} to ${statusLabel(to)}`
    case 'priority_changed':
      return `changed the priority from ${priorityLabel(from)} to ${priorityLabel(to)}`
    case 'assignee_changed':
      if (from === null) return `assigned the task to ${to}`
      if (to === null) return `unassigned ${from}`
      return `reassigned the task from ${from} to ${to}`
    case 'due_date_changed':
      if (from === null && to !== null) return `set the due date to ${formatDate(to)}`
      if (from !== null && to === null) return 'cleared the due date'
      return `moved the due date from ${from && formatDate(from)} to ${to && formatDate(to)}`
  }
}
