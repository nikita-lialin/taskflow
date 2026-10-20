import type { CommentDto, OrganizationRole } from '@taskflow/contracts'

export const COMMENTS_PAGE_SIZE = 20

/**
 * Who may change a comment (SPEC section 3). Only the author edits. The author and admins delete.
 * Comments of an archived project are read-only. The backend enforces the same rules.
 */
export function commentPermissions({
  comment,
  readOnly,
  viewerId,
  viewerRole,
}: {
  comment: Pick<CommentDto, 'author'>
  readOnly: boolean
  viewerId: string
  viewerRole: OrganizationRole
}) {
  const isAuthor = comment.author.id === viewerId
  return {
    canEdit: !readOnly && isAuthor,
    canDelete: !readOnly && (isAuthor || viewerRole === 'admin'),
  }
}

/** The server exposes no edit flag: a later `updatedAt` than `createdAt` means "edited". */
export function isEdited(comment: Pick<CommentDto, 'createdAt' | 'updatedAt'>) {
  return Date.parse(comment.updatedAt) > Date.parse(comment.createdAt)
}

/** The page that holds the newest comment once `total` comments exist. Comments read oldest first. */
export function lastCommentPage(total: number, pageSize = COMMENTS_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize))
}
