import { useNavigate, useRouter } from '@tanstack/react-router'
import {
  taskPrioritySchema,
  taskStatusSchema,
  type OrganizationMemberDto,
  type TaskDto,
  type UpdateTaskRequest,
} from '@taskflow/contracts'
import { useId, useState, type ReactNode } from 'react'

import {
  EmptyState,
  LoadingRows,
  MutationErrorAlert,
  QueryErrorAlert,
} from '@/components/QueryStates'
import { Typography } from '@/components/typography'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth'
import { CommentsSection } from '@/features/comments'
import { memberLabel, useOrganization } from '@/features/organizations'
import { isArchived, useProjectQuery } from '@/features/projects'
import { ApiRequestError } from '@/platform/api'
import { formatDate } from '@/platform/intl'
import { useMemberOptions } from './hooks'
import {
  applyPendingUpdates,
  dueDateToIso,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPermissions,
  taskPriorityLabels,
  taskStatusLabels,
  taskToFormValues,
  userLabel,
} from './model'
import {
  useDeleteTaskMutation,
  usePendingTaskUpdates,
  useTaskQuery,
  useUpdateTaskMutation,
} from './queries'
import { TaskActivitySection } from './TaskActivitySection'
import { useAutosaveDraft } from './use-autosave-draft'

/** Typing pauses this long before the text is saved. */
const TEXT_SAVE_DELAY_MS = 800
const DATE_SAVE_DELAY_MS = 1000

/**
 * Closing goes back when the task was opened from the board or a list, so the browser's Back
 * button and the close button agree. A task opened from a link has no earlier page in the app.
 */
function useCloseTask(organizationId: string) {
  const router = useRouter()
  const navigate = useNavigate()
  return () => {
    const index: unknown = window.history.state?.__TSR_index
    if (typeof index === 'number' && index > 0) {
      router.history.back()
      return
    }
    void navigate({ params: { organizationId }, replace: true, to: '/app/orgs/$organizationId/board' })
  }
}

/** The task window. It opens over the board, and the address of the task stays in the URL. */
export function TaskDetailDialog({ taskId }: { taskId: string }) {
  const { organization } = useOrganization()
  const task = useTaskQuery(organization.id, taskId)
  const close = useCloseTask(organization.id)

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) close()
      }}
      open
    >
      <DialogContent
        className="top-0 left-0 h-dvh max-w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none p-0 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        data-testid="task-dialog"
      >
        {task.data ? (
          <TaskDetail onDeleted={close} task={task.data.task} />
        ) : (
          <div className="grid gap-4 p-6">
            <DialogTitle className="sr-only">Task</DialogTitle>
            <DialogDescription className="sr-only">Details of the task.</DialogDescription>
            {task.isPending && <LoadingRows label="Loading task" />}
            {task.isError &&
              (task.error instanceof ApiRequestError && task.error.status === 404 ? (
                <EmptyState
                  description="It was deleted, or it does not belong to this organization."
                  testId="task-not-found"
                  title="Task not found"
                />
              ) : (
                <QueryErrorAlert
                  error={task.error}
                  onRetry={() => void task.refetch()}
                  title="Task is unavailable"
                />
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TaskDetail({ onDeleted, task }: { onDeleted: () => void; task: TaskDto }) {
  const { organization } = useOrganization()
  const viewer = useAuth().user
  const project = useProjectQuery(organization.id, task.projectId)
  const { members } = useMemberOptions(organization.id)
  const mutation = useUpdateTaskMutation(organization.id)
  const pending = usePendingTaskUpdates(organization.id, task.id)

  if (!viewer) return null
  const projectArchived = project.data ? isArchived(project.data.project) : false
  // Until the project loads, treat the task as read-only: a wrong "edit" would only end in a 409.
  const permissions = project.data
    ? taskPermissions({
        projectArchived,
        task,
        viewerId: viewer.id,
        viewerRole: organization.role,
      })
    : { canDelete: false, canEdit: false }
  const { canDelete, canEdit } = permissions
  const values = applyPendingUpdates(taskToFormValues(task), pending)

  const save = (input: UpdateTaskRequest) => {
    mutation.reset()
    mutation.mutate({ input, taskId: task.id })
  }

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid content-start gap-6 p-6">
        <div className="grid gap-1 pr-10">
          <DialogDescription asChild>
            <Typography tone="muted" variant="caption">
              {task.key} · created by {userLabel(task.creator)} on {formatDate(task.createdAt)}
            </Typography>
          </DialogDescription>
          <TitleField canEdit={canEdit} onSave={(title) => save({ title })} saved={values.title} />
        </div>
        {projectArchived && (
          <Alert data-testid="task-archived-notice">
            <AlertTitle>This project is archived</AlertTitle>
            <AlertDescription>
              Its tasks and comments are read-only until an admin unarchives it.
            </AlertDescription>
          </Alert>
        )}
        {project.isError && (
          <QueryErrorAlert
            error={project.error}
            onRetry={() => void project.refetch()}
            title="Project details are unavailable"
          />
        )}
        <DescriptionField
          canEdit={canEdit}
          onSave={(description) =>
            save({ description: description.trim() === '' ? null : description })
          }
          saved={values.description}
        />
        <Tabs defaultValue="comments">
          <TabsList variant="line">
            <TabsTrigger data-testid="task-tab-comments" value="comments">
              Comments
            </TabsTrigger>
            <TabsTrigger data-testid="task-tab-activity" value="activity">
              Activity
            </TabsTrigger>
          </TabsList>
          <TabsContent className="pt-4" value="comments">
            <CommentsSection
              organizationId={organization.id}
              readOnly={projectArchived}
              taskId={task.id}
              viewerId={viewer.id}
              viewerRole={organization.role}
            />
          </TabsContent>
          <TabsContent className="pt-4" value="activity">
            <TaskActivitySection organizationId={organization.id} taskId={task.id} />
          </TabsContent>
        </Tabs>
      </div>
      <aside className="grid content-start gap-5 border-t bg-muted/30 p-6 md:border-t-0 md:border-l">
        <SaveState isPending={pending.length > 0} isSaved={mutation.isSuccess} />
        <MutationErrorAlert error={mutation.error} title="Change was not saved" />
        <MetaField label="Status">
          {(id) => (
            <NativeSelect
              className="w-full"
              data-testid="task-status"
              disabled={!canEdit}
              id={id}
              onChange={(event) => {
                const parsed = taskStatusSchema.safeParse(event.target.value)
                if (parsed.success) save({ status: parsed.data })
              }}
              value={values.status}
            >
              {TASK_STATUSES.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {taskStatusLabels[status]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </MetaField>
        <MetaField label="Priority">
          {(id) => (
            <NativeSelect
              className="w-full"
              data-testid="task-priority"
              disabled={!canEdit}
              id={id}
              onChange={(event) => {
                const parsed = taskPrioritySchema.safeParse(event.target.value)
                if (parsed.success) save({ priority: parsed.data })
              }}
              value={values.priority}
            >
              {TASK_PRIORITIES.map((priority) => (
                <NativeSelectOption key={priority} value={priority}>
                  {taskPriorityLabels[priority]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </MetaField>
        <MetaField label="Assignee">
          {(id) => (
            <AssigneeSelect
              canEdit={canEdit}
              id={id}
              members={members}
              onChange={(assigneeId) =>
                save({ assigneeId: assigneeId === '' ? null : assigneeId })
              }
              task={task}
              value={values.assigneeId}
            />
          )}
        </MetaField>
        <DueDateField
          canEdit={canEdit}
          onSave={(day) => save({ dueDate: dueDateToIso(day) })}
          saved={values.dueDate}
        />
        <div className="grid gap-1">
          <Typography tone="muted" variant="caption">
            Project
          </Typography>
          <Typography variant="bodySm">
            {project.data ? `${project.data.project.key} · ${project.data.project.name}` : '–'}
          </Typography>
        </div>
        {canDelete && (
          <DeleteTaskButton
            onDeleted={onDeleted}
            organizationId={organization.id}
            taskId={task.id}
          />
        )}
      </aside>
    </div>
  )
}

function SaveState({ isPending, isSaved }: { isPending: boolean; isSaved: boolean }) {
  return (
    <Typography
      aria-live="polite"
      data-state={isPending ? 'saving' : isSaved ? 'saved' : 'idle'}
      data-testid="task-save-state"
      tone="muted"
      variant="caption"
    >
      {isPending ? 'Saving…' : isSaved ? 'All changes saved' : 'Changes save automatically'}
    </Typography>
  )
}

function MetaField({ children, label }: { children: (id: string) => ReactNode; label: string }) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children(id)}
    </Field>
  )
}

function TitleField({
  canEdit,
  onSave,
  saved,
}: {
  canEdit: boolean
  onSave: (title: string) => void
  saved: string
}) {
  const { draft, flush, setDraft } = useAutosaveDraft({
    // An empty title is refused here, so it never reaches the server.
    commit: (title) => {
      if (title.trim() !== '') onSave(title)
    },
    delayMs: TEXT_SAVE_DELAY_MS,
    saved,
  })
  const empty = draft.trim() === ''

  return (
    <Field data-invalid={empty}>
      <DialogTitle asChild>
        <Typography asChild variant="h4">
          <input
            aria-invalid={empty}
            aria-label="Title"
            className="w-full rounded-md bg-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"
            data-testid="task-title"
            disabled={!canEdit}
            maxLength={200}
            onBlur={flush}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
        </Typography>
      </DialogTitle>
      {empty && <FieldError>Title is required.</FieldError>}
    </Field>
  )
}

function DescriptionField({
  canEdit,
  onSave,
  saved,
}: {
  canEdit: boolean
  onSave: (description: string) => void
  saved: string
}) {
  const id = useId()
  const { draft, flush, setDraft } = useAutosaveDraft({
    commit: onSave,
    delayMs: TEXT_SAVE_DELAY_MS,
    saved,
  })

  return (
    <Field>
      <FieldLabel htmlFor={id}>Description</FieldLabel>
      <Textarea
        data-testid="task-description"
        disabled={!canEdit}
        id={id}
        maxLength={10000}
        onBlur={flush}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={canEdit ? 'Add a description' : 'No description'}
        value={draft}
      />
    </Field>
  )
}

function DueDateField({
  canEdit,
  onSave,
  saved,
}: {
  canEdit: boolean
  onSave: (day: string) => void
  saved: string
}) {
  const { draft, flush, setDraft } = useAutosaveDraft({
    commit: onSave,
    delayMs: DATE_SAVE_DELAY_MS,
    saved,
  })

  return (
    <MetaField label="Due date">
      {(id) => (
        <Input
          data-testid="task-due-date"
          disabled={!canEdit}
          id={id}
          onBlur={flush}
          onChange={(event) => setDraft(event.target.value)}
          type="date"
          value={draft}
        />
      )}
    </MetaField>
  )
}

function AssigneeSelect({
  canEdit,
  id,
  members,
  onChange,
  task,
  value,
}: {
  canEdit: boolean
  id: string
  members: ReadonlyArray<OrganizationMemberDto>
  onChange: (assigneeId: string) => void
  task: TaskDto
  value: string
}) {
  // An assignee who left the organization is not in the member list: keep showing the saved one.
  const assigneeMissing =
    task.assignee !== null && !members.some((member) => member.userId === task.assignee?.id)

  return (
    <NativeSelect
      className="w-full"
      data-testid="task-assignee"
      disabled={!canEdit}
      id={id}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <NativeSelectOption value="">Unassigned</NativeSelectOption>
      {assigneeMissing && task.assignee && (
        <NativeSelectOption value={task.assignee.id}>{userLabel(task.assignee)}</NativeSelectOption>
      )}
      {members.map((member) => (
        <NativeSelectOption key={member.userId} value={member.userId}>
          {memberLabel(member)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

function DeleteTaskButton({
  onDeleted,
  organizationId,
  taskId,
}: {
  onDeleted: () => void
  organizationId: string
  taskId: string
}) {
  const [confirming, setConfirming] = useState(false)
  const mutation = useDeleteTaskMutation(organizationId)

  return (
    <>
      <Button
        data-testid="task-delete"
        onClick={() => {
          mutation.reset()
          setConfirming(true)
        }}
        type="button"
        variant="outline"
      >
        Delete task
      </Button>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setConfirming(false)
        }}
        open={confirming}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              The task and its comments are removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <MutationErrorAlert error={mutation.error} title="Task was not deleted" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              data-testid="task-delete-confirm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(taskId, { onSuccess: onDeleted })}
              variant="destructive"
            >
              {mutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
