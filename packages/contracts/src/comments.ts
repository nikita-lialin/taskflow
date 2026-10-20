import { z } from 'zod'

import { paginationResponseShape, positiveIntegerQuerySchema, MAX_PAGE, MAX_PAGE_SIZE } from './pagination'
import { taskParamsSchema, taskUserSchema } from './tasks'

export const commentParamsSchema = taskParamsSchema.extend({ commentId: z.uuid() }).strict()

const commentBodySchema = z.string().trim().min(1).max(5000)

export const createCommentRequestSchema = z.object({ body: commentBodySchema }).strict()
export const updateCommentRequestSchema = createCommentRequestSchema

/** Comments read oldest first, so the query has no sort or search parameters. */
export const commentsQuerySchema = z
  .object({
    page: positiveIntegerQuerySchema(1, MAX_PAGE),
    pageSize: positiveIntegerQuerySchema(20, MAX_PAGE_SIZE),
  })
  .strict()

/** A client treats `updatedAt` later than `createdAt` as "edited". */
export const commentSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    author: taskUserSchema,
    body: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const commentResponseSchema = z.object({ comment: commentSchema }).strict()

export const commentsResponseSchema = z
  .object({
    items: z.array(commentSchema),
    ...paginationResponseShape,
  })
  .strict()

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>
export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>
export type CommentsQuery = z.infer<typeof commentsQuerySchema>
export type CommentDto = z.infer<typeof commentSchema>
