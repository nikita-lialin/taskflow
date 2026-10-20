import {
  commentResponseSchema,
  commentsQuerySchema,
  commentsResponseSchema,
  createCommentRequestSchema,
  updateCommentRequestSchema,
  type CommentsQuery,
  type CreateCommentRequest,
} from '@taskflow/contracts'
import { z } from 'zod'

import { buildQueryString, type AuthenticatedTransport } from '@/platform/api'

function commentsPath(organizationId: string, taskId: string) {
  return `/api/organizations/${encodeURIComponent(organizationId)}/tasks/${encodeURIComponent(taskId)}/comments`
}

export function listComments(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  input: Partial<CommentsQuery>,
  options: { signal?: AbortSignal } = {},
) {
  const query = commentsQuerySchema.parse(input)
  return transport.request(
    `${commentsPath(organizationId, taskId)}${buildQueryString(query)}`,
    commentsResponseSchema,
    options,
  )
}

export function addComment(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  input: CreateCommentRequest,
) {
  return transport.request(commentsPath(organizationId, taskId), commentResponseSchema, {
    method: 'POST',
    body: createCommentRequestSchema.parse(input),
  })
}

export function editComment(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  commentId: string,
  input: CreateCommentRequest,
) {
  return transport.request(
    `${commentsPath(organizationId, taskId)}/${encodeURIComponent(commentId)}`,
    commentResponseSchema,
    { method: 'PATCH', body: updateCommentRequestSchema.parse(input) },
  )
}

export function deleteComment(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  commentId: string,
) {
  return transport.request(
    `${commentsPath(organizationId, taskId)}/${encodeURIComponent(commentId)}`,
    z.undefined(),
    { method: 'DELETE' },
  )
}
