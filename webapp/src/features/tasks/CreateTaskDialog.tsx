import {
  createTaskRequestSchema,
  taskPrioritySchema,
  taskStatusSchema,
  type OrganizationMemberDto,
  type ProjectDto,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/contracts'
import { useId, useState, type FormEvent } from 'react'

import { MutationErrorAlert } from '@/components/QueryStates'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { memberLabel } from '@/features/organizations'
import { validateWithSchema } from '@/platform/forms'
import {
  dueDateToIso,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabels,
  taskStatusLabels,
} from './model'
import { useCreateTaskMutation } from './queries'

export function CreateTaskDialog({
  defaultProjectId,
  members,
  onOpenChange,
  open,
  organizationId,
  projects,
}: {
  defaultProjectId?: string
  members: ReadonlyArray<OrganizationMemberDto>
  onOpenChange: (open: boolean) => void
  open: boolean
  organizationId: string
  /** Active projects only: tasks cannot be created in an archived project. */
  projects: ReadonlyArray<ProjectDto>
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        {/* Mounted only while open, so every opening starts with an empty form. */}
        {open && (
          <CreateTaskForm
            defaultProjectId={defaultProjectId}
            members={members}
            onDone={() => onOpenChange(false)}
            organizationId={organizationId}
            projects={projects}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateTaskForm({
  defaultProjectId,
  members,
  onDone,
  organizationId,
  projects,
}: {
  defaultProjectId?: string
  members: ReadonlyArray<OrganizationMemberDto>
  onDone: () => void
  organizationId: string
  projects: ReadonlyArray<ProjectDto>
}) {
  const ids = {
    assignee: useId(),
    description: useId(),
    dueDate: useId(),
    priority: useId(),
    project: useId(),
    status: useId(),
    title: useId(),
  }
  const [projectId, setProjectId] = useState(
    projects.find((project) => project.id === defaultProjectId)?.id ?? projects[0]?.id ?? '',
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('backlog')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const mutation = useCreateTaskMutation(organizationId)
  const validation = validateWithSchema(
    createTaskRequestSchema,
    {
      assigneeId: assigneeId === '' ? null : assigneeId,
      description: description.trim() === '' ? null : description,
      dueDate: dueDateToIso(dueDate),
      priority,
      status,
      title,
    },
    ['title', 'description', 'dueDate', 'assigneeId'],
  )
  const errors = showErrors ? validation.errors?.fields : undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.request || projectId === '') {
      setShowErrors(true)
      return
    }
    mutation.mutate({ input: validation.request, projectId }, { onSuccess: onDone })
  }

  return (
    <form className="grid gap-6" noValidate onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
        <DialogDescription>Add a task to one of the active projects.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={showErrors && projectId === ''}>
          <FieldLabel htmlFor={ids.project}>Project</FieldLabel>
          <NativeSelect
            className="w-full"
            data-testid="task-project"
            disabled={mutation.isPending}
            id={ids.project}
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            {projects.map((project) => (
              <NativeSelectOption key={project.id} value={project.id}>
                {project.key} · {project.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field data-invalid={Boolean(errors?.title)}>
          <FieldLabel htmlFor={ids.title}>Title</FieldLabel>
          <Input
            aria-invalid={Boolean(errors?.title)}
            data-testid="task-title"
            disabled={mutation.isPending}
            id={ids.title}
            onChange={(event) => {
              setTitle(event.target.value)
              mutation.reset()
            }}
            value={title}
          />
          <FieldError errors={errors?.title} />
        </Field>
        <Field data-invalid={Boolean(errors?.description)}>
          <FieldLabel htmlFor={ids.description}>Description (optional)</FieldLabel>
          <Textarea
            aria-invalid={Boolean(errors?.description)}
            data-testid="task-description"
            disabled={mutation.isPending}
            id={ids.description}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
          <FieldError errors={errors?.description} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.status}>Status</FieldLabel>
            <NativeSelect
              className="w-full"
              data-testid="task-status"
              disabled={mutation.isPending}
              id={ids.status}
              onChange={(event) => {
                const parsed = taskStatusSchema.safeParse(event.target.value)
                if (parsed.success) setStatus(parsed.data)
              }}
              value={status}
            >
              {TASK_STATUSES.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {taskStatusLabels[option]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.priority}>Priority</FieldLabel>
            <NativeSelect
              className="w-full"
              data-testid="task-priority"
              disabled={mutation.isPending}
              id={ids.priority}
              onChange={(event) => {
                const parsed = taskPrioritySchema.safeParse(event.target.value)
                if (parsed.success) setPriority(parsed.data)
              }}
              value={priority}
            >
              {TASK_PRIORITIES.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {taskPriorityLabels[option]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.assignee}>Assignee</FieldLabel>
            <NativeSelect
              className="w-full"
              data-testid="task-assignee"
              disabled={mutation.isPending}
              id={ids.assignee}
              onChange={(event) => setAssigneeId(event.target.value)}
              value={assigneeId}
            >
              <NativeSelectOption value="">Unassigned</NativeSelectOption>
              {members.map((member) => (
                <NativeSelectOption key={member.userId} value={member.userId}>
                  {memberLabel(member)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={Boolean(errors?.dueDate)}>
            <FieldLabel htmlFor={ids.dueDate}>Due date (optional)</FieldLabel>
            <Input
              data-testid="task-due-date"
              disabled={mutation.isPending}
              id={ids.dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
            <FieldError errors={errors?.dueDate} />
          </Field>
        </div>
      </FieldGroup>
      <MutationErrorAlert error={mutation.error} title="Task was not created" />
      <DialogFooter>
        <Button disabled={mutation.isPending} onClick={onDone} type="button" variant="outline">
          Cancel
        </Button>
        <Button data-testid="task-create-submit" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Creating…' : 'Create task'}
        </Button>
      </DialogFooter>
    </form>
  )
}
