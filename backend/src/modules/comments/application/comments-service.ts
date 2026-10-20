import {
  type CommentDto,
  type CommentsQuery,
  type CreateCommentRequest,
  MAX_PAGE,
  type UpdateCommentRequest,
} from '@taskflow/contracts'

import type { OrganizationMembership } from '../../organizations'
import {
  CommentsFailure,
  commentForbidden,
  commentNotFound,
  projectArchived,
  taskNotFound,
} from '../domain/errors'
import { canDeleteComment, canEditComment } from '../domain/permissions'
import type { CommentRecord, CommentsRepository, CommentWrite } from './ports'

type CommentsServiceDependencies = {
  repository: CommentsRepository
  now: () => Date
}

export class CommentsService {
  constructor(private readonly dependencies: CommentsServiceDependencies) {}

  async list(membership: OrganizationMembership, taskId: string, query: CommentsQuery) {
    const result = await this.dependencies.repository.list(membership.organizationId, taskId, query)
    if (!result) throw taskNotFound()
    return {
      items: result.items.map(toCommentDto),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      hasNext: query.page < MAX_PAGE && query.page * query.pageSize < result.total,
    }
  }

  async create(
    membership: OrganizationMembership,
    callerId: string,
    taskId: string,
    input: CreateCommentRequest,
  ) {
    const comment = await this.write(membership, async (write) => {
      const project = await write.findTaskProject(taskId)
      if (!project) throw taskNotFound()
      if (project.archived) throw projectArchived()
      return write.create({ taskId, authorId: callerId, body: input.body, createdAt: this.dependencies.now() })
    })
    return { comment: toCommentDto(comment) }
  }

  async update(
    membership: OrganizationMembership,
    callerId: string,
    taskId: string,
    commentId: string,
    input: UpdateCommentRequest,
  ) {
    const comment = await this.write(membership, async (write) => {
      const current = await write.findComment(taskId, commentId)
      if (!current) throw commentNotFound()
      if (!canEditComment(callerId, current)) throw commentForbidden()
      if (current.projectArchived) throw projectArchived()
      return write.update(commentId, input.body)
    })
    return { comment: toCommentDto(comment) }
  }

  async delete(membership: OrganizationMembership, callerId: string, taskId: string, commentId: string) {
    await this.write(membership, async (write) => {
      const current = await write.findComment(taskId, commentId)
      if (!current) throw commentNotFound()
      if (!canDeleteComment(membership, callerId, current)) throw commentForbidden()
      if (current.projectArchived) throw projectArchived()
      await write.delete(commentId)
    })
  }

  private async write<T>(
    membership: OrganizationMembership,
    run: (write: CommentWrite) => Promise<T>,
  ): Promise<T> {
    const result = await this.dependencies.repository.withWriteLock(membership.organizationId, run)
    if (result === null) throw new CommentsFailure('not_found', 'Organization not found')
    return result
  }
}

function toCommentDto(record: CommentRecord): CommentDto {
  return {
    id: record.id,
    taskId: record.taskId,
    author: { id: record.author.id, email: record.author.email, displayName: record.author.displayName },
    body: record.body,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}
