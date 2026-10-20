import { createProjectRequestSchema } from '@taskflow/contracts'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { validateWithSchema } from '@/platform/forms'
import { useCreateProjectMutation } from './queries'

export function CreateProjectDialog({
  onOpenChange,
  open,
  organizationId,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  organizationId: string
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        {/* Mounted only while open, so every opening starts with an empty form. */}
        {open && (
          <CreateProjectForm onDone={() => onOpenChange(false)} organizationId={organizationId} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateProjectForm({
  onDone,
  organizationId,
}: {
  onDone: () => void
  organizationId: string
}) {
  const nameId = useId()
  const keyId = useId()
  const descriptionId = useId()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const mutation = useCreateProjectMutation(organizationId)
  const validation = validateWithSchema(
    createProjectRequestSchema,
    { name, key, description: description.trim() === '' ? null : description },
    ['name', 'key', 'description'],
  )
  const errors = showErrors ? validation.errors?.fields : undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.request) {
      setShowErrors(true)
      return
    }
    mutation.mutate(validation.request, { onSuccess: onDone })
  }

  return (
    <form className="grid gap-6" noValidate onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>
          Projects group tasks. The key prefixes task numbers, like WEB-12.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={Boolean(errors?.name)}>
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            aria-invalid={Boolean(errors?.name)}
            data-testid="project-name"
            disabled={mutation.isPending}
            id={nameId}
            onChange={(event) => {
              setName(event.target.value)
              mutation.reset()
            }}
            value={name}
          />
          <FieldError errors={errors?.name} />
        </Field>
        <Field data-invalid={Boolean(errors?.key)}>
          <FieldLabel htmlFor={keyId}>Key</FieldLabel>
          <Input
            aria-invalid={Boolean(errors?.key)}
            autoCapitalize="characters"
            data-testid="project-key"
            disabled={mutation.isPending}
            id={keyId}
            maxLength={6}
            onChange={(event) => {
              setKey(event.target.value.toUpperCase())
              mutation.reset()
            }}
            value={key}
          />
          <FieldDescription>2 to 6 letters or digits. It cannot change later.</FieldDescription>
          <FieldError errors={errors?.key} />
        </Field>
        <Field data-invalid={Boolean(errors?.description)}>
          <FieldLabel htmlFor={descriptionId}>Description (optional)</FieldLabel>
          <Textarea
            aria-invalid={Boolean(errors?.description)}
            data-testid="project-description"
            disabled={mutation.isPending}
            id={descriptionId}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
          <FieldError errors={errors?.description} />
        </Field>
      </FieldGroup>
      <MutationErrorAlert error={mutation.error} title="Project was not created" />
      <DialogFooter>
        <Button disabled={mutation.isPending} onClick={onDone} type="button" variant="outline">
          Cancel
        </Button>
        <Button data-testid="project-create-submit" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Creating…' : 'Create project'}
        </Button>
      </DialogFooter>
    </form>
  )
}
