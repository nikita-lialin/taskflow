import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { taskSchema, taskStatusSchema, type TaskDto, type TaskStatus } from '@taskflow/contracts'
import { useCallback, useState } from 'react'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { LoadingRows, MutationErrorAlert, QueryErrorAlert } from '@/components/QueryStates'
import { Typography } from '@/components/typography'
import { Badge } from '@/components/ui/badge'
import { useOrganization } from '@/features/organizations'
import { BoardCard, BoardCardPreview } from './BoardCard'
import { useMemberOptions, useProjectIndex } from './hooks'
import {
  emptyTaskFilters,
  TASK_STATUSES,
  taskStatusLabels,
  tasksQueryFromFilters,
  type TaskFilters,
} from './model'
import { NewTaskAction } from './NewTaskAction'
import { useMoveTaskMutation, useTasksQuery } from './queries'
import { TaskFiltersBar } from './TaskParts'

/** Cards one column loads. Longer columns point to the task list. */
const COLUMN_SIZE = 50

const columnPaging = { order: 'desc', page: 1, pageSize: COLUMN_SIZE, sort: 'updatedAt' } as const

/** The task a drag carries. The drag data is untyped, so it is checked here. */
function draggedTask(active: Active): TaskDto | null {
  const parsed = taskSchema.safeParse(active.data.current?.task)
  return parsed.success ? parsed.data : null
}

function overStatus(over: { id: string | number } | null) {
  const parsed = taskStatusSchema.safeParse(over?.id)
  return parsed.success ? parsed.data : null
}

// Screen readers hear the task key and the column name instead of internal ids.
const announcements: Announcements = {
  onDragCancel: ({ active }) => `Moving ${draggedTask(active)?.key ?? 'the task'} was cancelled.`,
  onDragEnd: ({ active, over }) => {
    const status = overStatus(over)
    return status
      ? `${draggedTask(active)?.key ?? 'The task'} was dropped in ${taskStatusLabels[status]}.`
      : `${draggedTask(active)?.key ?? 'The task'} was dropped outside the columns.`
  },
  onDragMove: () => undefined,
  onDragOver: ({ active, over }) => {
    const status = overStatus(over)
    return status ? `${draggedTask(active)?.key ?? 'The task'} is over ${taskStatusLabels[status]}.` : undefined
  },
  onDragStart: ({ active }) => `Picked up ${draggedTask(active)?.key ?? 'the task'}.`,
}

export function TaskBoard() {
  const { organization } = useOrganization()
  const [filters, setFilters] = useState<TaskFilters>(emptyTaskFilters)
  const [dragging, setDragging] = useState<TaskDto | null>(null)
  const { archivedIds, projects } = useProjectIndex(organization.id)
  const { members } = useMemberOptions(organization.id)
  const columnQuery = useCallback(
    (status: TaskStatus) => tasksQueryFromFilters({ ...filters, status }, columnPaging),
    [filters],
  )
  const moveMutation = useMoveTaskMutation(organization.id, columnQuery)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragStart = ({ active }: DragStartEvent) => {
    moveMutation.reset()
    setDragging(draggedTask(active))
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const task = draggedTask(active)
    const status = overStatus(over)
    if (task && status && status !== task.status) moveMutation.mutate({ status, task })
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <NewTaskAction
            defaultProjectId={filters.projectId === 'any' ? undefined : filters.projectId}
            organizationId={organization.id}
          />
        }
        description="Follow the work from backlog to done. Drag a card to change its status."
        title="Board"
      />
      <TaskFiltersBar
        filters={filters}
        members={members}
        onChange={setFilters}
        projects={projects}
        showSearch
      />
      <MutationErrorAlert error={moveMutation.error} title="Task was not moved" />
      <DndContext
        accessibility={{ announcements }}
        onDragCancel={() => setDragging(null)}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div
          className="grid auto-cols-[minmax(16rem,1fr)] grid-flow-col items-start gap-4 overflow-x-auto pb-2"
          data-testid="task-board"
        >
          {TASK_STATUSES.map((status) => (
            <BoardColumn
              archivedProjectIds={archivedIds}
              key={status}
              organizationId={organization.id}
              query={columnQuery(status)}
              status={status}
            />
          ))}
        </div>
        <DragOverlay>{dragging && <BoardCardPreview task={dragging} />}</DragOverlay>
      </DndContext>
    </PageContainer>
  )
}

function BoardColumn({
  archivedProjectIds,
  organizationId,
  query,
  status,
}: {
  archivedProjectIds: ReadonlySet<string>
  organizationId: string
  query: ReturnType<typeof tasksQueryFromFilters>
  status: TaskStatus
}) {
  const tasks = useTasksQuery(organizationId, query)
  const { isOver, setNodeRef } = useDroppable({ id: status })

  return (
    <section
      aria-labelledby={`column-${status}`}
      className={`grid min-h-64 content-start gap-3 rounded-xl border p-3 transition-colors ${isOver ? 'bg-accent' : 'bg-muted/30'}`}
      data-status={status}
      data-testid="board-column"
      ref={setNodeRef}
    >
      <div className="flex items-center justify-between gap-2">
        <Typography as="h2" id={`column-${status}`} variant="h6">
          {taskStatusLabels[status]}
        </Typography>
        <Badge data-testid="board-column-count" variant="outline">
          {tasks.data?.total ?? '–'}
        </Badge>
      </div>
      {tasks.isPending && <LoadingRows label={`Loading ${taskStatusLabels[status]}`} rows={2} />}
      {tasks.isError && (
        <QueryErrorAlert
          error={tasks.error}
          onRetry={() => void tasks.refetch()}
          title="Column is unavailable"
        />
      )}
      {tasks.data && tasks.data.items.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <Typography data-testid="board-column-empty" tone="muted" variant="bodySm">
            No tasks here.
          </Typography>
        </div>
      )}
      {tasks.data?.items.map((task) => (
        <BoardCard key={task.id} projectArchived={archivedProjectIds.has(task.projectId)} task={task} />
      ))}
      {tasks.data?.hasNext && (
        <Typography tone="muted" variant="caption">
          {`Showing ${tasks.data.items.length} of ${tasks.data.total}. Open the task list to see all.`}
        </Typography>
      )}
    </section>
  )
}
