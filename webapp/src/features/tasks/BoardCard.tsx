import { DragDropVerticalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useDraggable } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import type { TaskDto } from '@taskflow/contracts'
import type { ReactNode } from 'react'

import { Typography } from '@/components/typography'
import { useAuth } from '@/features/auth'
import { useOrganization } from '@/features/organizations'
import { taskPermissions } from './model'
import { TaskAssigneeAvatar, TaskDueDateBadge, TaskPriorityBadge } from './TaskParts'

/** What the card shows. The draggable card and the card that follows the pointer share it. */
function CardContent({ handle, task }: { handle?: ReactNode; task: TaskDto }) {
  const { organization } = useOrganization()

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Typography tone="muted" variant="caption">
          {task.key}
        </Typography>
        <div className="flex items-center gap-1.5">
          <TaskPriorityBadge priority={task.priority} />
          {handle}
        </div>
      </div>
      <Typography asChild variant="bodySmMedium" wrap="break">
        <Link
          data-testid="task-link"
          params={{ organizationId: organization.id, taskId: task.id }}
          to="/app/orgs/$organizationId/tasks/$taskId"
        >
          {task.title}
        </Link>
      </Typography>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <TaskDueDateBadge task={task} />
        {task.assignee && (
          <div className="ml-auto">
            <TaskAssigneeAvatar assignee={task.assignee} />
          </div>
        )}
      </div>
    </>
  )
}

const cardFrame = 'grid gap-3 rounded-lg border bg-card p-3 shadow-xs'

/**
 * A card of the board. A mouse drags it from anywhere. A finger drags it after a short press. The
 * keyboard drags it from the grip button, so Enter and Space on the link still open the task.
 */
export function BoardCard({
  projectArchived,
  task,
}: {
  projectArchived: boolean
  task: TaskDto
}) {
  const { organization } = useOrganization()
  const viewer = useAuth().user
  const canEdit = viewer
    ? taskPermissions({
        projectArchived,
        task,
        viewerId: viewer.id,
        viewerRole: organization.role,
      }).canEdit
    : false
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    data: { task },
    disabled: !canEdit,
    id: task.id,
  })

  return (
    <article
      className={`${cardFrame} ${canEdit ? 'cursor-grab' : ''} ${isDragging ? 'opacity-40' : ''}`}
      data-testid="board-card"
      ref={setNodeRef}
      {...listeners}
    >
      <CardContent
        handle={
          canEdit && (
            <button
              {...attributes}
              aria-label={`Move ${task.key}`}
              className="rounded-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="board-card-handle"
              ref={setActivatorNodeRef}
              type="button"
            >
              <HugeiconsIcon aria-hidden icon={DragDropVerticalIcon} size={16} strokeWidth={2} />
            </button>
          )
        }
        task={task}
      />
    </article>
  )
}

/** The copy of a card that follows the pointer while it is dragged. */
export function BoardCardPreview({ task }: { task: TaskDto }) {
  return (
    <article className={`${cardFrame} rotate-2 cursor-grabbing shadow-lg`}>
      <CardContent task={task} />
    </article>
  )
}
