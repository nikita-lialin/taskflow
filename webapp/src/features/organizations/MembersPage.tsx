import { useNavigate } from '@tanstack/react-router'
import {
  addOrganizationMemberRequestSchema,
  organizationRoleSchema,
  type OrganizationMemberDto,
  type OrganizationRole,
} from '@taskflow/contracts'
import { useId, useState, type FormEvent } from 'react'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { EmptyState, LoadingRows, MutationErrorAlert, QueryErrorAlert } from '@/components/QueryStates'
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useAuth } from '@/features/auth'
import { validateWithSchema } from '@/platform/forms'
import { useOrganization } from './context'
import { memberActions, memberLabel, organizationRoleLabels } from './model'
import {
  useAddMemberMutation,
  useMembersQuery,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from './queries'

export function MembersPage() {
  const { organization, permissions } = useOrganization()
  const members = useMembersQuery(organization.id)

  return (
    <PageContainer>
      <PageHeader
        description={
          permissions.canManageMembers
            ? 'Add people who already have an account and manage their roles.'
            : 'People who can see this organization. Admins manage roles.'
        }
        title="Members"
      />
      {permissions.canManageMembers && <AddMemberCard organizationId={organization.id} />}
      {members.isPending && <LoadingRows label="Loading members" />}
      {members.isError && (
        <QueryErrorAlert
          error={members.error}
          onRetry={() => void members.refetch()}
          title="Members are unavailable"
        />
      )}
      {members.data && members.data.items.length === 0 && (
        <EmptyState description="Add the first member above." title="No members yet" />
      )}
      {members.data && members.data.items.length > 0 && (
        <MemberList members={members.data.items} organizationId={organization.id} />
      )}
    </PageContainer>
  )
}

function AddMemberCard({ organizationId }: { organizationId: string }) {
  const emailId = useId()
  const emailErrorId = useId()
  const roleId = useId()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrganizationRole>('member')
  const [showErrors, setShowErrors] = useState(false)
  const [addedEmail, setAddedEmail] = useState<string | null>(null)
  const mutation = useAddMemberMutation(organizationId)
  const validation = validateWithSchema(addOrganizationMemberRequestSchema, { email, role }, [
    'email',
    'role',
  ])
  const emailErrors = showErrors ? validation.errors?.fields.email : undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAddedEmail(null)
    if (!validation.request) {
      setShowErrors(true)
      return
    }
    mutation.mutate(validation.request, {
      onSuccess: (response) => {
        setAddedEmail(response.member.email)
        setEmail('')
        setShowErrors(false)
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <Typography as="h2" variant="h6">
          Add a member
        </Typography>
        <CardDescription>
          The person must already have a TaskFlow account with this email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <Field data-invalid={Boolean(emailErrors)}>
              <FieldLabel htmlFor={emailId}>Email</FieldLabel>
              <Input
                aria-describedby={emailErrors ? emailErrorId : undefined}
                aria-invalid={Boolean(emailErrors)}
                autoComplete="off"
                data-testid="member-email"
                disabled={mutation.isPending}
                id={emailId}
                inputMode="email"
                onChange={(event) => {
                  setEmail(event.target.value)
                  setAddedEmail(null)
                  mutation.reset()
                }}
                placeholder="teammate@example.com"
                type="email"
                value={email}
              />
              <FieldError errors={emailErrors} id={emailErrorId} />
            </Field>
            <Field>
              <FieldLabel htmlFor={roleId}>Role</FieldLabel>
              <NativeSelect
                className="w-full"
                data-testid="member-role"
                disabled={mutation.isPending}
                id={roleId}
                onChange={(event) => {
                  const parsed = organizationRoleSchema.safeParse(event.target.value)
                  if (parsed.success) setRole(parsed.data)
                }}
                value={role}
              >
                <NativeSelectOption value="member">Member</NativeSelectOption>
                <NativeSelectOption value="admin">Admin</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Button data-testid="member-add" disabled={mutation.isPending} type="submit">
              {mutation.isPending ? 'Adding…' : 'Add member'}
            </Button>
          </div>
          <MutationErrorAlert error={mutation.error} title="Member was not added" />
          {addedEmail && (
            <Alert data-testid="member-added">
              <AlertTitle>Member added</AlertTitle>
              <AlertDescription>{addedEmail} can now open this organization.</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function MemberList({
  members,
  organizationId,
}: {
  members: ReadonlyArray<OrganizationMemberDto>
  organizationId: string
}) {
  const { organization } = useOrganization()
  const viewer = useAuth().user
  const navigate = useNavigate()
  const roleMutation = useUpdateMemberRoleMutation(organizationId)
  const removeMutation = useRemoveMemberMutation(organizationId)
  const [pendingRemoval, setPendingRemoval] = useState<OrganizationMemberDto | null>(null)

  if (!viewer) return null
  const isLeaving = pendingRemoval?.userId === viewer.id

  const confirmRemoval = () => {
    if (!pendingRemoval) return
    removeMutation.mutate(pendingRemoval.userId, {
      onSuccess: () => {
        setPendingRemoval(null)
        if (isLeaving) void navigate({ to: '/app' })
      },
    })
  }

  return (
    <>
      <MutationErrorAlert error={roleMutation.error} title="Role was not changed" />
      <ul aria-label="Members" className="grid gap-3" role="list">
        {members.map((member) => {
          const actions = memberActions({
            member,
            members,
            viewerId: viewer.id,
            viewerRole: organization.role,
          })
          return (
            <li key={member.userId}>
              <Item data-testid="member-row" variant="outline">
                <ItemContent>
                  <ItemTitle>
                    {memberLabel(member)}
                    {member.userId === viewer.id && <Badge variant="secondary">You</Badge>}
                  </ItemTitle>
                  <ItemDescription>{member.email}</ItemDescription>
                  {actions.blockedReason && (
                    <Typography tone="muted" variant="caption">
                      {actions.blockedReason}
                    </Typography>
                  )}
                </ItemContent>
                <ItemActions>
                  {actions.canChangeRole ? (
                    <NativeSelect
                      aria-label={`Role for ${member.email}`}
                      data-testid="member-role-select"
                      disabled={roleMutation.isPending}
                      onChange={(event) => {
                        const parsed = organizationRoleSchema.safeParse(event.target.value)
                        if (parsed.success && parsed.data !== member.role) {
                          roleMutation.mutate({ role: parsed.data, userId: member.userId })
                        }
                      }}
                      value={member.role}
                    >
                      <NativeSelectOption value="member">Member</NativeSelectOption>
                      <NativeSelectOption value="admin">Admin</NativeSelectOption>
                    </NativeSelect>
                  ) : (
                    <Badge data-testid="member-role-badge" variant="outline">
                      {organizationRoleLabels[member.role]}
                    </Badge>
                  )}
                  {actions.canRemove && (
                    <Button
                      data-testid="member-remove"
                      onClick={() => {
                        removeMutation.reset()
                        setPendingRemoval(member)
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {actions.removeLabel}
                      <Typography as="span" variant="srOnly">
                        {` ${memberLabel(member)}`}
                      </Typography>
                    </Button>
                  )}
                </ItemActions>
              </Item>
            </li>
          )
        })}
      </ul>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !removeMutation.isPending) setPendingRemoval(null)
        }}
        open={pendingRemoval !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isLeaving ? 'Leave this organization?' : 'Remove this member?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval
                ? isLeaving
                  ? 'You lose access to its projects and tasks. Tasks assigned to you become unassigned.'
                  : `${memberLabel(pendingRemoval)} loses access. Their assigned tasks become unassigned.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <MutationErrorAlert error={removeMutation.error} title="Member was not removed" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              data-testid="member-remove-confirm"
              disabled={removeMutation.isPending}
              onClick={confirmRemoval}
              variant="destructive"
            >
              {removeMutation.isPending ? 'Working…' : isLeaving ? 'Leave' : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
