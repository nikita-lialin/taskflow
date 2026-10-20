import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTaskRequest, TasksQuery, UpdateTaskRequest } from '@taskflow/contracts'

import { useAuth } from '@/features/auth'
import { organizationScopeKey } from '@/features/organizations'
import type { AuthenticatedTransport } from '@/platform/api'
import { createTask, deleteTask, getTask, listTasks, updateTask } from './api'

export const taskKeys = {
  all: (organizationId: string) => [...organizationScopeKey(organizationId), 'tasks'] as const,
  list: (organizationId: string, query: Partial<TasksQuery>) =>
    [...taskKeys.all(organizationId), 'list', query] as const,
  detail: (organizationId: string, taskId: string) =>
    [...taskKeys.all(organizationId), 'detail', taskId] as const,
}

export function tasksQueryOptions(
  transport: AuthenticatedTransport,
  organizationId: string,
  query: Partial<TasksQuery>,
) {
  return queryOptions({
    queryKey: taskKeys.list(organizationId, query),
    // A new page or filter is a new key. Forwarding the signal cancels the superseded request.
    queryFn: ({ signal }) => listTasks(transport, organizationId, query, { signal }),
  })
}

export function taskQueryOptions(
  transport: AuthenticatedTransport,
  organizationId: string,
  taskId: string,
) {
  return queryOptions({
    queryKey: taskKeys.detail(organizationId, taskId),
    queryFn: ({ signal }) => getTask(transport, organizationId, taskId, { signal }),
  })
}

export function useTasksQuery(organizationId: string, query: Partial<TasksQuery>) {
  const auth = useAuth()
  return useQuery(tasksQueryOptions(auth.transport, organizationId, query))
}

export function useTaskQuery(organizationId: string, taskId: string) {
  const auth = useAuth()
  return useQuery(taskQueryOptions(auth.transport, organizationId, taskId))
}

export function useCreateTaskMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, projectId }: { input: CreateTaskRequest; projectId: string }) =>
      createTask(auth.transport, organizationId, projectId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all(organizationId) }),
  })
}

export function useUpdateTaskMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, taskId }: { input: UpdateTaskRequest; taskId: string }) =>
      updateTask(auth.transport, organizationId, taskId, input),
    onSuccess: (response) => {
      queryClient.setQueryData(taskKeys.detail(organizationId, response.task.id), response)
      return queryClient.invalidateQueries({ queryKey: taskKeys.all(organizationId) })
    },
  })
}

export function useDeleteTaskMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(auth.transport, organizationId, taskId),
    onSuccess: (_result, taskId) => {
      queryClient.removeQueries({ queryKey: taskKeys.detail(organizationId, taskId) })
      return queryClient.invalidateQueries({ queryKey: taskKeys.all(organizationId) })
    },
  })
}
