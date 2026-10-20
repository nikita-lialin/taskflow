import { z } from 'zod'

export const taskStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'done'])

export type TaskStatus = z.infer<typeof taskStatusSchema>
