import { z } from 'zod'

import { organizationParamsSchema } from './organizations'
import { paginationQueryShape, paginationResponseShape } from './pagination'
import { taskStatusSchema } from './tasks'

export const projectParamsSchema = organizationParamsSchema
  .extend({
    projectId: z.uuid(),
  })
  .strict()

const projectNameSchema = z.string().trim().min(2).max(80)
const projectDescriptionSchema = z.string().trim().max(2000)

/** Uppercase letters and digits, starting with a letter. Lowercase input is uppercased. */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,5}$/, 'Use 2 to 6 letters or digits, starting with a letter')

export const createProjectRequestSchema = z
  .object({
    name: projectNameSchema,
    key: projectKeySchema,
    description: projectDescriptionSchema.nullish(),
  })
  .strict()

/** The key is not editable, so `.strict()` rejects it. At least one field is required. */
export const updateProjectRequestSchema = z
  .object({
    name: projectNameSchema,
    description: projectDescriptionSchema.nullable(),
    archived: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change')

/** `false` (default) lists active projects, `true` lists archived ones, `all` lists both. */
export const projectArchivedFilterSchema = z.enum(['true', 'false', 'all'])

export const projectsQuerySchema = z
  .object({
    ...paginationQueryShape,
    archived: projectArchivedFilterSchema.default('false'),
  })
  .strict()

export const projectSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    archivedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const projectTaskCountsSchema = z.record(taskStatusSchema, z.number().int().nonnegative())

export const projectDetailSchema = projectSchema.extend({ taskCounts: projectTaskCountsSchema }).strict()

export const projectResponseSchema = z.object({ project: projectSchema }).strict()

export const projectDetailResponseSchema = z.object({ project: projectDetailSchema }).strict()

export const projectsResponseSchema = z
  .object({
    items: z.array(projectSchema),
    ...paginationResponseShape,
  })
  .strict()

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>
export type ProjectsQuery = z.infer<typeof projectsQuerySchema>
export type ProjectDto = z.infer<typeof projectSchema>
export type ProjectDetailDto = z.infer<typeof projectDetailSchema>
export type ProjectTaskCounts = z.infer<typeof projectTaskCountsSchema>
