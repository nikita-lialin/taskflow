import { Link } from '@tanstack/react-router'
import type { TaskDto } from '@taskflow/contracts'
import { useState } from 'react'

import { DataTableFrame } from '@/components/dashboard'
import { PageContainer, PageHeader } from '@/components/PageLayout'
import { EmptyState, LoadingRows, QueryErrorAlert } from '@/components/QueryStates'
import { Typography } from '@/components/typography'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { useOrganization } from '@/features/organizations'
import { pageSummary, pageWindow } from '@/platform/pagination'
import { useMemberOptions, useProjectIndex } from './hooks'
import {
  emptyTaskFilters,
  hasActiveFilters,
  tasksQueryFromFilters,
  userLabel,
  type TaskFilters,
} from './model'
import { NewTaskAction } from './NewTaskAction'
import { useTasksQuery } from './queries'
import {
  TaskDueDateBadge,
  TaskFiltersBar,
  TaskPriorityBadge,
  TaskStatusBadge,
} from './TaskParts'

const PAGE_SIZE = 20

/** `all` lists every task of the organization. `mine` lists the open and closed tasks assigned to the caller. */
export function TaskListPage({ mode }: { mode: 'all' | 'mine' }) {
  const { organization } = useOrganization()
  const isMine = mode === 'mine'
  const baseFilters: TaskFilters = isMine ? { ...emptyTaskFilters, assignee: 'me' } : emptyTaskFilters
  const [filters, setFilters] = useState<TaskFilters>(baseFilters)
  const [page, setPage] = useState(1)
  const { projects } = useProjectIndex(organization.id)
  const { members } = useMemberOptions(organization.id)
  const tasks = useTasksQuery(
    organization.id,
    tasksQueryFromFilters(filters, {
      order: isMine ? 'asc' : 'desc',
      page,
      pageSize: PAGE_SIZE,
      sort: isMine ? 'dueDate' : 'createdAt',
    }),
  )
  const pages = tasks.data ? pageWindow(tasks.data) : null
  const filtered = hasActiveFilters(isMine ? { ...filters, assignee: 'any' } : filters)

  return (
    <PageContainer>
      <PageHeader
        actions={<NewTaskAction organizationId={organization.id} />}
        description={
          isMine
            ? 'Tasks assigned to you, the ones due soonest first.'
            : 'Search, filter, and page through every task of the organization.'
        }
        title={isMine ? 'My tasks' : 'Tasks'}
      />
      <DataTableFrame
        nextDisabled={!pages?.canGoNext}
        onNext={() => setPage((current) => current + 1)}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        previousDisabled={page <= 1}
        summary={
          tasks.data ? pageSummary(tasks.data, { one: 'task', other: 'tasks' }) : 'Loading tasks'
        }
        title={isMine ? 'Assigned to me' : 'All tasks'}
        toolbar={
          <TaskFiltersBar
            filters={filters}
            members={members}
            onChange={(next) => {
              setFilters(next)
              setPage(1)
            }}
            projects={projects}
            showAssignee={!isMine}
            showSearch
            showStatus
          />
        }
      >
        {tasks.isPending && <LoadingRows label="Loading tasks" />}
        {tasks.isError && (
          <QueryErrorAlert
            error={tasks.error}
            onRetry={() => void tasks.refetch()}
            title="Tasks are unavailable"
          />
        )}
        {tasks.data && tasks.data.items.length === 0 && (
          <EmptyState
            description={
              filtered
                ? 'No task matches these filters.'
                : isMine
                  ? 'Nothing is assigned to you.'
                  : 'Create the first task to get started.'
            }
            testId="tasks-empty"
            title="No tasks"
          />
        )}
        {tasks.data && tasks.data.items.length > 0 && (
          <ul aria-label="Tasks" className="grid gap-3" role="list">
            {tasks.data.items.map((task) => (
              <TaskRow key={task.id} organizationId={organization.id} task={task} />
            ))}
          </ul>
        )}
      </DataTableFrame>
    </PageContainer>
  )
}

function TaskRow({ organizationId, task }: { organizationId: string; task: TaskDto }) {
  return (
    <li>
      <Item asChild variant="outline">
        <Link
          data-testid="task-row"
          params={{ organizationId, taskId: task.id }}
          to="/app/orgs/$organizationId/tasks/$taskId"
        >
          <ItemContent>
            <ItemTitle>
              <Typography tone="muted" variant="caption">
                {task.key}
              </Typography>
              {task.title}
            </ItemTitle>
            <ItemDescription>
              {task.assignee ? `Assigned to ${userLabel(task.assignee)}` : 'Unassigned'}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            <TaskDueDateBadge task={task} />
          </ItemActions>
        </Link>
      </Item>
    </li>
  )
}
