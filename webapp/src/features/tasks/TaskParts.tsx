import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  taskPrioritySchema,
  taskStatusSchema,
  type OrganizationMemberDto,
  type ProjectDto,
  type TaskDto,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/contracts'
import { useState, type FormEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { memberLabel } from '@/features/organizations'
import { formatDate } from '@/platform/intl'
import {
  emptyTaskFilters,
  hasActiveFilters,
  isOverdue,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabels,
  taskStatusLabels,
  type TaskFilters,
} from './model'

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant={priority === 'high' ? 'destructive' : 'outline'}>
      {taskPriorityLabels[priority]}
    </Badge>
  )
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant="secondary">{taskStatusLabels[status]}</Badge>
}

export function TaskDueDateBadge({ task }: { task: Pick<TaskDto, 'dueDate' | 'status'> }) {
  if (task.dueDate === null) return null
  const overdue = isOverdue(task)
  return (
    <Badge data-testid={overdue ? 'task-overdue' : undefined} variant={overdue ? 'destructive' : 'outline'}>
      {overdue ? 'Overdue · ' : 'Due '}
      {formatDate(task.dueDate)}
    </Badge>
  )
}

/** Changes the status of one task. Keyboard users get the native control instead of a drag. */
export function TaskStatusSelect({
  disabled,
  onChange,
  task,
}: {
  disabled: boolean
  onChange: (status: TaskStatus) => void
  task: Pick<TaskDto, 'key' | 'status'>
}) {
  return (
    <NativeSelect
      aria-label={`Status of ${task.key}`}
      className="w-full"
      data-testid="task-status-select"
      disabled={disabled}
      onChange={(event) => {
        const parsed = taskStatusSchema.safeParse(event.target.value)
        if (parsed.success && parsed.data !== task.status) onChange(parsed.data)
      }}
      size="sm"
      value={task.status}
    >
      {TASK_STATUSES.map((status) => (
        <NativeSelectOption key={status} value={status}>
          {taskStatusLabels[status]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

export function TaskFiltersBar({
  filters,
  members,
  onChange,
  projects,
  showAssignee = true,
  showStatus = false,
  showSearch = false,
}: {
  filters: TaskFilters
  members: ReadonlyArray<OrganizationMemberDto>
  onChange: (filters: TaskFilters) => void
  projects: ReadonlyArray<ProjectDto>
  showAssignee?: boolean
  showSearch?: boolean
  showStatus?: boolean
}) {
  const [draftQuery, setDraftQuery] = useState(filters.q)

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onChange({ ...filters, q: draftQuery.trim() })
  }

  return (
    <div className="grid gap-3" data-testid="task-filters">
      {showSearch && (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitSearch}>
          <InputGroup>
            <InputGroupAddon>
              <HugeiconsIcon aria-hidden icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search tasks"
              data-testid="task-search-input"
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search by title"
              value={draftQuery}
            />
          </InputGroup>
          <Button data-testid="task-search-submit" type="submit">
            Search
          </Button>
        </form>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <NativeSelect
          aria-label="Filter by project"
          className="w-full"
          data-testid="filter-project"
          onChange={(event) => onChange({ ...filters, projectId: event.target.value })}
          value={filters.projectId}
        >
          <NativeSelectOption value="any">All projects</NativeSelectOption>
          {projects.map((project) => (
            <NativeSelectOption key={project.id} value={project.id}>
              {project.key} · {project.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {showAssignee && (
          <NativeSelect
            aria-label="Filter by assignee"
            className="w-full"
            data-testid="filter-assignee"
            onChange={(event) => onChange({ ...filters, assignee: event.target.value })}
            value={filters.assignee}
          >
            <NativeSelectOption value="any">Anyone</NativeSelectOption>
            <NativeSelectOption value="me">Assigned to me</NativeSelectOption>
            <NativeSelectOption value="none">Unassigned</NativeSelectOption>
            {members.map((member) => (
              <NativeSelectOption key={member.userId} value={member.userId}>
                {memberLabel(member)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        <NativeSelect
          aria-label="Filter by priority"
          className="w-full"
          data-testid="filter-priority"
          onChange={(event) => {
            const parsed = taskPrioritySchema.safeParse(event.target.value)
            onChange({ ...filters, priority: parsed.success ? parsed.data : 'any' })
          }}
          value={filters.priority}
        >
          <NativeSelectOption value="any">Any priority</NativeSelectOption>
          {TASK_PRIORITIES.map((priority) => (
            <NativeSelectOption key={priority} value={priority}>
              {taskPriorityLabels[priority]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {showStatus && (
          <NativeSelect
            aria-label="Filter by status"
            className="w-full"
            data-testid="filter-status"
            onChange={(event) => {
              const parsed = taskStatusSchema.safeParse(event.target.value)
              onChange({ ...filters, status: parsed.success ? parsed.data : 'any' })
            }}
            value={filters.status}
          >
            <NativeSelectOption value="any">Any status</NativeSelectOption>
            {TASK_STATUSES.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {taskStatusLabels[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </div>
      {hasActiveFilters(showAssignee ? filters : { ...filters, assignee: 'any' }) && (
        <div>
          <Button
            data-testid="filters-clear"
            onClick={() => {
              setDraftQuery('')
              onChange({ ...emptyTaskFilters, assignee: showAssignee ? 'any' : filters.assignee })
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}
