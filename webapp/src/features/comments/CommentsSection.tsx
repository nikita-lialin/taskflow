import {
  createCommentRequestSchema,
  type CommentDto,
  type OrganizationRole,
} from '@taskflow/contracts'
import { useId, useState, type FormEvent } from 'react'

import {
  EmptyState,
  LoadingRows,
  MutationErrorAlert,
  QueryErrorAlert,
} from '@/components/QueryStates'
import { Typography } from '@/components/typography'
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
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { pageWindow } from '@/platform/pagination'
import { validateWithSchema } from '@/platform/forms'
import {
  COMMENTS_PAGE_SIZE,
  commentPermissions,
  isEdited,
  lastCommentPage,
} from './model'
import {
  useAddCommentMutation,
  useCommentsQuery,
  useDeleteCommentMutation,
  useEditCommentMutation,
} from './queries'

const dateTimeFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

export function CommentsSection({
  organizationId,
  readOnly,
  taskId,
  viewerId,
  viewerRole,
}: {
  organizationId: string
  /** True when the task's project is archived: comments can be read but not changed. */
  readOnly: boolean
  taskId: string
  viewerId: string
  viewerRole: OrganizationRole
}) {
  const [page, setPage] = useState(1)
  const comments = useCommentsQuery(organizationId, taskId, { page, pageSize: COMMENTS_PAGE_SIZE })
  const pages = comments.data ? pageWindow(comments.data) : null

  return (
    <Card data-testid="comments">
      <CardHeader>
        <Typography as="h2" variant="h6">
          Comments
        </Typography>
        <CardDescription>
          {comments.data ? `${comments.data.total} in total, oldest first.` : 'Discussion about this task.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5">
          {comments.isPending && <LoadingRows label="Loading comments" rows={2} />}
          {comments.isError && (
            <QueryErrorAlert
              error={comments.error}
              onRetry={() => void comments.refetch()}
              title="Comments are unavailable"
            />
          )}
          {comments.data && comments.data.items.length === 0 && (
            <EmptyState
              description={readOnly ? 'This project is archived.' : 'Start the discussion below.'}
              testId="comments-empty"
              title="No comments yet"
            />
          )}
          {comments.data && comments.data.items.length > 0 && (
            <ul aria-label="Comments" className="grid gap-4" role="list">
              {comments.data.items.map((comment) => (
                <CommentRow
                  comment={comment}
                  key={comment.id}
                  organizationId={organizationId}
                  readOnly={readOnly}
                  taskId={taskId}
                  viewerId={viewerId}
                  viewerRole={viewerRole}
                />
              ))}
            </ul>
          )}
          {comments.data && pages && pages.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                size="sm"
                type="button"
                variant="outline"
              >
                Older
              </Button>
              <Typography tone="muted" variant="bodySm">
                {`Page ${comments.data.page} of ${pages.totalPages}`}
              </Typography>
              <Button
                disabled={!pages.canGoNext}
                onClick={() => setPage((current) => current + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                Newer
              </Button>
            </div>
          )}
          {!readOnly && (
            <AddCommentForm
              onAdded={(total) => setPage(lastCommentPage(total))}
              organizationId={organizationId}
              taskId={taskId}
              total={comments.data?.total ?? 0}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AddCommentForm({
  onAdded,
  organizationId,
  taskId,
  total,
}: {
  onAdded: (total: number) => void
  organizationId: string
  taskId: string
  total: number
}) {
  const bodyId = useId()
  const [body, setBody] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const mutation = useAddCommentMutation(organizationId, taskId)
  const validation = validateWithSchema(createCommentRequestSchema, { body }, ['body'])
  const errors = showErrors ? validation.errors?.fields.body : undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.request) {
      setShowErrors(true)
      return
    }
    mutation.mutate(validation.request.body, {
      onSuccess: () => {
        setBody('')
        setShowErrors(false)
        onAdded(total + 1)
      },
    })
  }

  return (
    <form className="grid gap-3" noValidate onSubmit={submit}>
      <Field data-invalid={Boolean(errors)}>
        <FieldLabel htmlFor={bodyId}>Add a comment</FieldLabel>
        <Textarea
          aria-invalid={Boolean(errors)}
          data-testid="comment-input"
          disabled={mutation.isPending}
          id={bodyId}
          onChange={(event) => {
            setBody(event.target.value)
            mutation.reset()
          }}
          value={body}
        />
        <FieldError errors={errors} />
      </Field>
      <MutationErrorAlert error={mutation.error} title="Comment was not added" />
      <div>
        <Button data-testid="comment-submit" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  )
}

function CommentRow({
  comment,
  organizationId,
  readOnly,
  taskId,
  viewerId,
  viewerRole,
}: {
  comment: CommentDto
  organizationId: string
  readOnly: boolean
  taskId: string
  viewerId: string
  viewerRole: OrganizationRole
}) {
  const permissions = commentPermissions({ comment, readOnly, viewerId, viewerRole })
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const deleteMutation = useDeleteCommentMutation(organizationId, taskId)

  return (
    <li className="grid gap-2 rounded-lg border p-4" data-testid="comment">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Typography variant="bodySmMedium">{comment.author.displayName ?? comment.author.email}</Typography>
        <Typography tone="muted" variant="caption">
          {dateTimeFormatter.format(new Date(comment.createdAt))}
          {isEdited(comment) ? ' · edited' : ''}
        </Typography>
      </div>
      {editing ? (
        <EditCommentForm
          comment={comment}
          onDone={() => setEditing(false)}
          organizationId={organizationId}
          taskId={taskId}
        />
      ) : (
        <>
          <Typography className="break-words whitespace-pre-wrap" data-testid="comment-body" variant="bodySm">
            {comment.body}
          </Typography>
          {(permissions.canEdit || permissions.canDelete) && (
            <div className="flex gap-2">
              {permissions.canEdit && (
                <Button
                  data-testid="comment-edit"
                  onClick={() => setEditing(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Edit
                </Button>
              )}
              {permissions.canDelete && (
                <Button
                  data-testid="comment-delete"
                  onClick={() => {
                    deleteMutation.reset()
                    setConfirmingDelete(true)
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Delete
                </Button>
              )}
            </div>
          )}
        </>
      )}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setConfirmingDelete(false)
        }}
        open={confirmingDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <MutationErrorAlert error={deleteMutation.error} title="Comment was not deleted" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              data-testid="comment-delete-confirm"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteMutation.mutate(comment.id, { onSuccess: () => setConfirmingDelete(false) })
              }
              variant="destructive"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

function EditCommentForm({
  comment,
  onDone,
  organizationId,
  taskId,
}: {
  comment: CommentDto
  onDone: () => void
  organizationId: string
  taskId: string
}) {
  const bodyId = useId()
  const [body, setBody] = useState(comment.body)
  const [showErrors, setShowErrors] = useState(false)
  const mutation = useEditCommentMutation(organizationId, taskId)
  const validation = validateWithSchema(createCommentRequestSchema, { body }, ['body'])
  const errors = showErrors ? validation.errors?.fields.body : undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validation.request) {
      setShowErrors(true)
      return
    }
    mutation.mutate({ body: validation.request.body, commentId: comment.id }, { onSuccess: onDone })
  }

  return (
    <form className="grid gap-3" noValidate onSubmit={submit}>
      <Field data-invalid={Boolean(errors)}>
        <FieldLabel htmlFor={bodyId}>Edit comment</FieldLabel>
        <Textarea
          aria-invalid={Boolean(errors)}
          autoFocus
          data-testid="comment-edit-input"
          disabled={mutation.isPending}
          id={bodyId}
          onChange={(event) => setBody(event.target.value)}
          value={body}
        />
        <FieldError errors={errors} />
      </Field>
      <MutationErrorAlert error={mutation.error} title="Comment was not saved" />
      <div className="flex gap-2">
        <Button data-testid="comment-edit-save" disabled={mutation.isPending} size="sm" type="submit">
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          disabled={mutation.isPending}
          onClick={onDone}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
