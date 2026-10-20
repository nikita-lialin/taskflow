import {
  createOrganizationRequestSchema,
  type OrganizationDto,
} from '@taskflow/contracts'
import { useId, useState, type FormEvent } from 'react'

import { MutationErrorAlert } from '@/components/QueryStates'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Typography } from '@/components/typography'
import { validateWithSchema } from '@/platform/forms'
import { useCreateOrganizationMutation } from './queries'

export function CreateOrganizationCard({
  description,
  onCreated,
  title,
}: {
  description: string
  onCreated: (organization: OrganizationDto) => void
  title: string
}) {
  const nameId = useId()
  const errorId = useId()
  const [name, setName] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const mutation = useCreateOrganizationMutation()
  const validation = validateWithSchema(createOrganizationRequestSchema, { name }, ['name'])
  const nameErrors = showErrors ? validation.errors?.fields.name : undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.request) {
      setShowErrors(true)
      return
    }
    mutation.mutate(validation.request, {
      onSuccess: (response) => onCreated(response.organization),
    })
  }

  return (
    <Card>
      <CardHeader>
        <Typography as="h2" variant="h5">
          {title}
        </Typography>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" noValidate onSubmit={submit}>
          <Field data-invalid={Boolean(nameErrors)}>
            <FieldLabel htmlFor={nameId}>Organization name</FieldLabel>
            <Input
              aria-describedby={nameErrors ? errorId : undefined}
              aria-invalid={Boolean(nameErrors)}
              autoComplete="organization"
              data-testid="organization-name"
              disabled={mutation.isPending}
              id={nameId}
              onChange={(event) => {
                setName(event.target.value)
                mutation.reset()
              }}
              placeholder="Acme Inc."
              value={name}
            />
            <FieldDescription>Your team will see this name. You become its admin.</FieldDescription>
            <FieldError errors={nameErrors} id={errorId} />
          </Field>
          <MutationErrorAlert error={mutation.error} title="Organization was not created" />
          <div>
            <Button data-testid="organization-create" disabled={mutation.isPending} type="submit">
              {mutation.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
