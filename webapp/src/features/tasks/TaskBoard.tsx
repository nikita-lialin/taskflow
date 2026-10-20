import { Link } from '@tanstack/react-router'
import type { TaskDto, TaskStatus } from '@taskflow/contracts'
import { useState } from 'react'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { LoadingRows, MutationErrorAlert, QueryErrorAlert } from '@/components/QueryStates'
import { Typography } from '@/components/typography'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useOrganization } from '@/features/organizations'
import { useMemberOptions, useProjectIndex } from './hooks'
import {
  emptyTaskFilters,
  TASK_STATUSES,
  taskPermissions,
  taskStatusLabels,
  tasksQueryFromFilters,
  userLabel,
  type TaskFilters,
} from './model'
import { NewTaskAction } from './NewTaskAction'
import { useTasksQuery, useUpdateTaskMutation } from './queries'
import {
  TaskDueDateBadge,
  TaskFiltersBar,
  TaskPriorityBadge,
  TaskStatusSelect,
} from './TaskParts'
import { useAuth } from '@/features/auth'

/** Cards one column loads. Longer columns point to the task list. */
const COLUMN_SIZE = 50

export function TaskBoard() {
  const { organization } = useOrganization()
  const [filters, setFilters] = useState<TaskFilters>(emptyTaskFilters)
  const { archivedIds, projects } = useProjectIndex(organization.id)
  const { members } = useMemberOptions(organization.id)
  const updateMutation = useUpdateTaskMutation(organization.id)
  const movingTaskId = updateMutation.isPending ? (updateMutation.variables?.taskId ?? null) : null

  return (
    <PageContainer>
      <PageHeader
        actions={
          <NewTaskAction
            defaultProjectId={filters.projectId === 'any' ? undefined : filters.projectId}
            organizationId={organization.id}
          />
        }
        description="Follow the work from backlog to done. Change a status from the card."
        title="Board"
      />
      <TaskFiltersBar filters={filters} members={members} onChange={setFilters} projects={projects} />
      <MutationErrorAlert error={updateMutation.error} title="Status was not changed" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="task-board">
        {TASK_STATUSES.map((status) => (
          <BoardColumn
            archivedProjectIds={archivedIds}
            filters={filters}
            key={status}
            movingTaskId={movingTaskId}
            onMove={(task, nextStatus) => {
              updateMutation.reset()
              updateMutation.mutate({ input: { status: nextStatus }, taskId: task.id })
            }}
            organizationId={organization.id}
            status={status}
          />
        ))}
      </div>
    </PageContainer>
  )
}

function BoardColumn({
  archivedProjectIds,
  filters,
  movingTaskId,
  onMove,
  organizationId,
  status,
}: {
  archivedProjectIds: ReadonlySet<string>
  filters: TaskFilters
  movingTaskId: string | null
  onMove: (task: TaskDto, status: TaskStatus) => void
  organizationId: string
  status: TaskStatus
}) {
  const tasks = useTasksQuery(
    organizationId,
    tasksQueryFromFilters(
      { ...filters, status },
      { order: 'desc', page: 1, pageSize: COLUMN_SIZE, sort: 'updatedAt' },
    ),
  )

  return (
    <section aria-labelledby={`column-${status}`} data-status={status} data-testid="board-column">
      <Card className="bg-muted/30">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Typography as="h2" id={`column-${status}`} variant="h6">
              {taskStatusLabels[status]}
            </Typography>
            <Badge data-testid="board-column-count" variant="outline">
              {tasks.data?.total ?? '–'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {tasks.isPending && <LoadingRows label={`Loading ${taskStatusLabels[status]}`} rows={2} />}
            {tasks.isError && (
              <QueryErrorAlert
                error={tasks.error}
                onRetry={() => void tasks.refetch()}
                title="Column is unavailable"
              />
            )}
            {tasks.data && tasks.data.items.length === 0 && (
              <Typography data-testid="board-column-empty" tone="muted" variant="bodySm">
                No tasks here.
              </Typography>
            )}
            {tasks.data?.items.map((task) => (
              <BoardCard
                isMoving={movingTaskId === task.id}
                key={task.id}
                onMove={onMove}
                projectArchived={archivedProjectIds.has(task.projectId)}
                task={task}
              />
            ))}
            {tasks.data?.hasNext && (
              <Typography tone="muted" variant="caption">
                {`Showing ${tasks.data.items.length} of ${tasks.data.total}. Open the task list to see all.`}
              </Typography>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function BoardCard({
  isMoving,
  onMove,
  projectArchived,
  task,
}: {
  isMoving: boolean
  onMove: (task: TaskDto, status: TaskStatus) => void
  projectArchived: boolean
  task: TaskDto
}) {
  const { organization } = useOrganization()
  const viewer = useAuth().user
  const permissions = viewer
    ? taskPermissions({
        projectArchived,
        task,
        viewerId: viewer.id,
        viewerRole: organization.role,
      })
    : null

  return (
    <article className="grid gap-3 rounded-lg border bg-card p-3" data-testid="board-card">
      <div className="grid gap-1">
        <Typography tone="muted" variant="caption">
          {task.key}
        </Typography>
        <Typography asChild variant="bodySmMedium" wrap="break">
          <Link
            data-testid="task-link"
            params={{ organizationId: organization.id, taskId: task.id }}
            to="/app/orgs/$organizationId/tasks/$taskId"
          >
            {task.title}
          </Link>
        </Typography>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TaskPriorityBadge priority={task.priority} />
        <TaskDueDateBadge task={task} />
        {task.assignee && <Badge variant="outline">{userLabel(task.assignee)}</Badge>}
      </div>
      {permissions?.canEdit && (
        <TaskStatusSelect
          disabled={isMoving}
          onChange={(status) => onMove(task, status)}
          task={task}
        />
      )}
    </article>
  )
}
