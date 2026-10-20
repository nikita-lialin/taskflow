import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CommentsQuery } from '@taskflow/contracts'

import { useAuth } from '@/features/auth'
import { organizationScopeKey } from '@/features/organizations'
import type { AuthenticatedTransport } from '@/platform/api'
import { addComment, deleteComment, editComment, listComments } from './api'

export const commentKeys = {
  all: (organizationId: string, taskId: string) =>
    [...organizationScopeKey(organizationId), 'comments', taskId] as const,
  list: (organizationId: string, taskId: string, query: Partial<CommentsQuery>) =>
    [...commentKeys.all(organizationId, taskId), 'list', query] as const,
}

export function commentsQueryOptions(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  query: Partial<CommentsQuery>,
) {
  return queryOptions({
    queryKey: commentKeys.list(organizationId, taskId, query),
    queryFn: ({ signal }) => listComments(transport, organizationId, taskId, query, { signal }),
  })
}

export function useCommentsQuery(
  organizationId: string,
  taskId: string,
  query: Partial<CommentsQuery>,
) {
  const auth = useAuth()
  return useQuery(commentsQueryOptions(auth.transport, organizationId, taskId, query))
}

export function useAddCommentMutation(organizationId: string, taskId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addComment(auth.transport, organizationId, taskId, { body }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: commentKeys.all(organizationId, taskId) }),
  })
}

export function useEditCommentMutation(organizationId: string, taskId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ body, commentId }: { body: string; commentId: string }) =>
      editComment(auth.transport, organizationId, taskId, commentId, { body }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: commentKeys.all(organizationId, taskId) }),
  })
}

export function useDeleteCommentMutation(organizationId: string, taskId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(auth.transport, organizationId, taskId, commentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: commentKeys.all(organizationId, taskId) }),
  })
}
