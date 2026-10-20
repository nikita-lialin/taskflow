import { z } from 'zod'

import { paginationResponseShape, positiveIntegerQuerySchema, MAX_PAGE, MAX_PAGE_SIZE } from './pagination'
import { taskUserSchema } from './tasks'

export const taskActivityTypeSchema = z.enum([
  'created',
  'title_changed',
  'description_changed',
  'status_changed',
  'priority_changed',
  'assignee_changed',
  'due_date_changed',
])

/** The journal reads newest first, so the query has no sort or search parameters. */
export const taskActivityQuerySchema = z
  .object({
    page: positiveIntegerQuerySchema(1, MAX_PAGE),
    pageSize: positiveIntegerQuerySchema(20, MAX_PAGE_SIZE),
  })
  .strict()

/**
 * One change of one field. `from` and `to` are what the field held before and after: a status or
 * priority value, a person's name, a title, or an ISO due date. `null` means "empty", and both are
 * `null` for `created` and `description_changed`, which keep no text.
 */
export const taskActivitySchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    type: taskActivityTypeSchema,
    actor: taskUserSchema,
    from: z.string().nullable(),
    to: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()

export const taskActivityResponseSchema = z
  .object({
    items: z.array(taskActivitySchema),
    ...paginationResponseShape,
  })
  .strict()

export type TaskActivityType = z.infer<typeof taskActivityTypeSchema>
export type TaskActivityQuery = z.infer<typeof taskActivityQuerySchema>
export type TaskActivityDto = z.infer<typeof taskActivitySchema>
