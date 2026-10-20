import {
  createTaskRequestSchema,
  taskActivityQuerySchema,
  taskActivityResponseSchema,
  taskResponseSchema,
  tasksQuerySchema,
  tasksResponseSchema,
  updateTaskRequestSchema,
  type CreateTaskRequest,
  type TaskActivityQuery,
  type TasksQuery,
  type UpdateTaskRequest,
} from '@taskflow/contracts'
import { z } from 'zod'

import { buildQueryString, type AuthenticatedTransport } from '@/platform/api'

type ReadOptions = { signal?: AbortSignal }

function organizationPath(organizationId: string) {
  return `/api/organizations/${encodeURIComponent(organizationId)}`
}

export function listTasks(
  transport: AuthenticatedTransport,
  organizationId: string,
  input: Partial<TasksQuery>,
  options: ReadOptions = {},
) {
  const query = tasksQuerySchema.parse(input)
  return transport.request(
    `${organizationPath(organizationId)}/tasks${buildQueryString(query)}`,
    tasksResponseSchema,
    options,
  )
}

export function listTaskActivity(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  input: Partial<TaskActivityQuery>,
  options: ReadOptions = {},
) {
  const query = taskActivityQuerySchema.parse(input)
  return transport.request(
    `${organizationPath(organizationId)}/tasks/${encodeURIComponent(taskId)}/activity${buildQueryString(query)}`,
    taskActivityResponseSchema,
    options,
  )
}

export function getTask(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  options: ReadOptions = {},
) {
  return transport.request(
    `${organizationPath(organizationId)}/tasks/${encodeURIComponent(taskId)}`,
    taskResponseSchema,
    options,
  )
}

export function createTask(
  transport: AuthenticatedTransport,
  organizationId: string,
  projectId: string,
  input: CreateTaskRequest,
) {
  return transport.request(
    `${organizationPath(organizationId)}/projects/${encodeURIComponent(projectId)}/tasks`,
    taskResponseSchema,
    { method: 'POST', body: createTaskRequestSchema.parse(input) },
  )
}

export function updateTask(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
  input: UpdateTaskRequest,
) {
  return transport.request(
    `${organizationPath(organizationId)}/tasks/${encodeURIComponent(taskId)}`,
    taskResponseSchema,
    { method: 'PATCH', body: updateTaskRequestSchema.parse(input) },
  )
}

export function deleteTask(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
) {
  return transport.request(
    `${organizationPath(organizationId)}/tasks/${encodeURIComponent(taskId)}`,
    z.undefined(),
    { method: 'DELETE' },
  )
}
