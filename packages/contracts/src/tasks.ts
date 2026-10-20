import { z } from 'zod'

import { organizationParamsSchema } from './organizations'
import { paginationQueryShape, paginationResponseShape } from './pagination'

export const taskStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'done'])
export const taskPrioritySchema = z.enum(['low', 'medium', 'high'])

export const taskParamsSchema = organizationParamsSchema.extend({ taskId: z.uuid() }).strict()

/** Path of the create route: the project that receives the task. */
export const projectTasksParamsSchema = organizationParamsSchema
  .extend({ projectId: z.uuid() })
  .strict()

const taskTitleSchema = z.string().trim().min(1).max(200)
const taskDescriptionSchema = z.string().trim().max(10000)
const dueDateSchema = z.string().datetime()

export const createTaskRequestSchema = z
  .object({
    title: taskTitleSchema,
    description: taskDescriptionSchema.nullish(),
    status: taskStatusSchema.default('backlog'),
    priority: taskPrioritySchema.default('medium'),
    assigneeId: z.uuid().nullish(),
    dueDate: dueDateSchema.nullish(),
  })
  .strict()

/**
 * Any subset of the fields, at least one. `null` clears the nullable fields. The project is not
 * editable, so `.strict()` rejects `projectId`.
 */
export const updateTaskRequestSchema = z
  .object({
    title: taskTitleSchema,
    description: taskDescriptionSchema.nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assigneeId: z.uuid().nullable(),
    dueDate: dueDateSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change')

export const taskSortSchema =z.enum(['createdAt', 'updatedAt', 'dueDate', 'priority', 'status'])
export const sortOrderSchema = z.enum(['asc', 'desc'])

/** Accepts `?status=todo&status=done` and `?status=todo,done`. */
const listOf = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (value) =>
      value === undefined ? undefined : [value].flat().flatMap((entry) => String(entry).split(',')),
    z.array(item).min(1).optional(),
  )

export const tasksQuerySchema = z
  .object({
    ...paginationQueryShape,
    projectId: z.uuid().optional(),
    status: listOf(taskStatusSchema),
    priority: listOf(taskPrioritySchema),
    /** A user id, `me` for the caller, or `none` for unassigned tasks. */
    assigneeId: z.union([z.uuid(), z.literal('me'), z.literal('none')]).optional(),
    creatorId: z.union([z.uuid(), z.literal('me')]).optional(),
    dueBefore: dueDateSchema.optional(),
    dueAfter: dueDateSchema.optional(),
    /** `true` keeps tasks that are not done and past their due date. `false` adds no filter. */
    overdue: z.enum(['true', 'false']).optional(),
    sort: taskSortSchema.default('createdAt'),
    order: sortOrderSchema.default('desc'),
  })
  .strict()

export const taskUserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
  })
  .strict()

export const taskSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    /** Identifier such as `WEB-12`: the project key and the task number. */
    key: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    description: z.string().nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assignee: taskUserSchema.nullable(),
    creator: taskUserSchema,
    dueDate: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const taskResponseSchema = z.object({ task: taskSchema }).strict()

export const tasksResponseSchema = z
  .object({
    items: z.array(taskSchema),
    ...paginationResponseShape,
  })
  .strict()

export type TaskStatus = z.infer<typeof taskStatusSchema>
export type TaskPriority = z.infer<typeof taskPrioritySchema>
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>
export type TasksQuery =z.infer<typeof tasksQuerySchema>
export type TaskDto = z.infer<typeof taskSchema>
export type TasksResponse = z.infer<typeof tasksResponseSchema>
export type TaskUserDto = z.infer<typeof taskUserSchema>
