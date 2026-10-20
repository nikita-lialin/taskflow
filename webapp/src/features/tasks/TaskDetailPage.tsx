import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  taskPrioritySchema,
  taskStatusSchema,
  updateTaskRequestSchema,
  type OrganizationMemberDto,
  type TaskDto,
} from '@taskflow/contracts'
import { useId, useState, type FormEvent } from 'react'

import { PageContainer, PageHeader } from '@/components/PageLayout'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth'
import { CommentsSection } from '@/features/comments'
import { memberLabel, useOrganization } from '@/features/organizations'
import { isArchived, useProjectQuery } from '@/features/projects'
import { ApiRequestError } from '@/platform/api'
import { validateWithSchema } from '@/platform/forms'
import { formatDate } from '@/platform/intl'
import { useMemberOptions } from './hooks'
import {
  buildTaskUpdate,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPermissions,
  taskPriorityLabels,
  taskStatusLabels,
  taskToFormValues,
  userLabel,
  type TaskFormValues,
  type TaskPermissions,
} from './model'
import { useDeleteTaskMutation, useTaskQuery, useUpdateTaskMutation } from './queries'

export function TaskDetailPage({ taskId }: { taskId: string }) {
  const { organization } = useOrganization()
  const task = useTaskQuery(organization.id, taskId)

  return (
    <PageContainer>
      <Button asChild size="sm" variant="ghost">
        <Link params={{ organizationId: organization.id }} to="/app/orgs/$organizationId/tasks">
          <HugeiconsIcon aria-hidden icon={ArrowLeft01Icon} strokeWidth={2} />
          All tasks
        </Link>
      </Button>
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
      {task.data && <TaskDetail task={task.data.task} />}
    </PageContainer>
  )
}

function TaskDetail({ task }: { task: TaskDto }) {
  const { organization } = useOrganization()
  const viewer = useAuth().user
  const project = useProjectQuery(organization.id, task.projectId)
  const { members } = useMemberOptions(organization.id)
  // Kept here because the edit card remounts when a save changes the task.
  const [saved, setSaved] = useState(false)

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

  return (
    <>
      <PageHeader
        actions={
          permissions.canDelete && (
            <DeleteTaskButton organizationId={organization.id} taskId={task.id} />
          )
        }
        description={
          <>
            {task.key} · created by {userLabel(task.creator)} on {formatDate(task.createdAt)}
          </>
        }
        title={task.title}
      />
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
      {/* The saved version is the key: a successful save re-seeds the form from the new task. */}
      <TaskEditCard
        key={task.updatedAt}
        members={members}
        onSavedChange={setSaved}
        organizationId={organization.id}
        permissions={permissions}
        saved={saved}
        task={task}
      />
      <CommentsSection
        organizationId={organization.id}
        readOnly={projectArchived}
        taskId={task.id}
        viewerId={viewer.id}
        viewerRole={organization.role}
      />
    </>
  )
}

function TaskEditCard({
  members,
  onSavedChange,
  organizationId,
  permissions,
  saved,
  task,
}: {
  members: ReadonlyArray<OrganizationMemberDto>
  onSavedChange: (saved: boolean) => void
  organizationId: string
  permissions: Pick<TaskPermissions, 'canEdit'>
  saved: boolean
  task: TaskDto
}) {
  const ids = {
    assignee: useId(),
    description: useId(),
    dueDate: useId(),
    priority: useId(),
    status: useId(),
    title: useId(),
  }
  const [values, setValues] = useState<TaskFormValues>(() => taskToFormValues(task))
  const [showErrors, setShowErrors] = useState(false)
  const mutation = useUpdateTaskMutation(organizationId)
  const update = buildTaskUpdate(task, values)
  const isDirty = Object.keys(update).length > 0
  const validation = validateWithSchema(updateTaskRequestSchema, update, [
    'title',
    'description',
    'dueDate',
    'assigneeId',
  ])
  const errors = showErrors ? validation.errors?.fields : undefined
  const readOnly = !permissions.canEdit || mutation.isPending
  // An assignee who left the organization is not in the member list: keep showing the saved one.
  const assigneeMissing =
    task.assignee !== null && !members.some((member) => member.userId === task.assignee?.id)

  const change = (next: Partial<TaskFormValues>) => {
    setValues((current) => ({ ...current, ...next }))
    onSavedChange(false)
    mutation.reset()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.request) {
      setShowErrors(true)
      return
    }
    // The promise outlives this card, which remounts once the saved task arrives.
    mutation
      .mutateAsync({ input: validation.request, taskId: task.id })
      .then(() => onSavedChange(true), () => undefined)
  }

  return (
    <Card>
      <CardHeader>
        <Typography as="h2" variant="h6">
          Details
        </Typography>
        <CardDescription>
          {permissions.canEdit
            ? 'Change the fields you need and save.'
            : 'You can read this task. Admins, its creator, and its assignee can edit it.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" data-testid="task-form" noValidate onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={Boolean(errors?.title)}>
              <FieldLabel htmlFor={ids.title}>Title</FieldLabel>
              <Input
                aria-invalid={Boolean(errors?.title)}
                data-testid="task-title"
                disabled={readOnly}
                id={ids.title}
                onChange={(event) => change({ title: event.target.value })}
                value={values.title}
              />
              <FieldError errors={errors?.title} />
            </Field>
            <Field data-invalid={Boolean(errors?.description)}>
              <FieldLabel htmlFor={ids.description}>Description</FieldLabel>
              <Textarea
                aria-invalid={Boolean(errors?.description)}
                data-testid="task-description"
                disabled={readOnly}
                id={ids.description}
                onChange={(event) => change({ description: event.target.value })}
                value={values.description}
              />
              <FieldError errors={errors?.description} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={ids.status}>Status</FieldLabel>
                <NativeSelect
                  className="w-full"
                  data-testid="task-status"
                  disabled={readOnly}
                  id={ids.status}
                  onChange={(event) => {
                    const parsed = taskStatusSchema.safeParse(event.target.value)
                    if (parsed.success) change({ status: parsed.data })
                  }}
                  value={values.status}
                >
                  {TASK_STATUSES.map((status) => (
                    <NativeSelectOption key={status} value={status}>
                      {taskStatusLabels[status]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.priority}>Priority</FieldLabel>
                <NativeSelect
                  className="w-full"
                  data-testid="task-priority"
                  disabled={readOnly}
                  id={ids.priority}
                  onChange={(event) => {
                    const parsed = taskPrioritySchema.safeParse(event.target.value)
                    if (parsed.success) change({ priority: parsed.data })
                  }}
                  value={values.priority}
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <NativeSelectOption key={priority} value={priority}>
                      {taskPriorityLabels[priority]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field data-invalid={Boolean(errors?.assigneeId)}>
                <FieldLabel htmlFor={ids.assignee}>Assignee</FieldLabel>
                <NativeSelect
                  className="w-full"
                  data-testid="task-assignee"
                  disabled={readOnly}
                  id={ids.assignee}
                  onChange={(event) => change({ assigneeId: event.target.value })}
                  value={values.assigneeId}
                >
                  <NativeSelectOption value="">Unassigned</NativeSelectOption>
                  {assigneeMissing && task.assignee && (
                    <NativeSelectOption value={task.assignee.id}>
                      {userLabel(task.assignee)}
                    </NativeSelectOption>
                  )}
                  {members.map((member) => (
                    <NativeSelectOption key={member.userId} value={member.userId}>
                      {memberLabel(member)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError errors={errors?.assigneeId} />
              </Field>
              <Field data-invalid={Boolean(errors?.dueDate)}>
                <FieldLabel htmlFor={ids.dueDate}>Due date</FieldLabel>
                <Input
                  data-testid="task-due-date"
                  disabled={readOnly}
                  id={ids.dueDate}
                  onChange={(event) => change({ dueDate: event.target.value })}
                  type="date"
                  value={values.dueDate}
                />
                <FieldDescription>Leave empty for no due date.</FieldDescription>
                <FieldError errors={errors?.dueDate} />
              </Field>
            </div>
          </FieldGroup>
          <MutationErrorAlert error={mutation.error} title="Task was not saved" />
          {saved && (
            <Alert data-testid="task-saved">
              <AlertTitle>Task saved</AlertTitle>
              <AlertDescription>Your changes are in.</AlertDescription>
            </Alert>
          )}
          {permissions.canEdit && (
            <div className="flex items-center gap-3">
              <Button
                data-testid="task-save"
                disabled={!isDirty || mutation.isPending}
                type="submit"
              >
                {mutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              {isDirty && <Badge variant="secondary">Unsaved changes</Badge>}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function DeleteTaskButton({ organizationId, taskId }: { organizationId: string; taskId: string }) {
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()
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
              onClick={() =>
                mutation.mutate(taskId, {
                  onSuccess: () =>
                    void navigate({ params: { organizationId }, to: '/app/orgs/$organizationId/tasks' }),
                })
              }
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
