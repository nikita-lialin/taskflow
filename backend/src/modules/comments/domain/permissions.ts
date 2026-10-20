import type { OrganizationMembership } from '../../organizations'

/** Only the author edits a comment, whatever the role. */
export function canEditComment(callerId: string, comment: { authorId: string }) {
  return comment.authorId === callerId
}

/** Administrators delete every comment. Members delete only their own. */
export function canDeleteComment(
  membership: OrganizationMembership,
  callerId: string,
  comment: { authorId: string },
) {
  return membership.role === 'admin' || comment.authorId === callerId
}
