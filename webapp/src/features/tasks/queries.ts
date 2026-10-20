import {
  queryOptions,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  updateTaskRequestSchema,
  type CreateTaskRequest,
  type TaskActivityQuery,
  type TaskDto,
  type TasksQuery,
  type TasksResponse,
  type TaskStatus,
  type UpdateTaskRequest,
} from '@taskflow/contracts'
import { z } from 'zod'

import { useAuth } from '@/features/auth'
import { organizationScopeKey } from '@/features/organizations'
import type { AuthenticatedTransport } from '@/platform/api'
import { createTask, deleteTask, getTask, listTaskActivity, listTasks, updateTask } from './api'
import { addTaskToPage, removeTaskFromPage } from './model'

export const taskKeys = {
  all: (organizationId: string) => [...organizationScopeKey(organizationId), 'tasks'] as const,
  list: (organizationId: string, query: Partial<TasksQuery>) =>
    [...taskKeys.all(organizationId), 'list', query] as const,
  detail: (organizationId: string, taskId: string) =>
    [...taskKeys.all(organizationId), 'detail', taskId] as const,
  // Under `all`, so every task change that refreshes the task lists refreshes the journal too.
  activity: (organizationId: string, taskId: string, query: Partial<TaskActivityQuery>) =>
    [...taskKeys.all(organizationId), 'activity', taskId, query] as const,
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

export function useTaskActivityQuery(
  organizationId: string,
  taskId: string,
  query: Partial<TaskActivityQuery>,
) {
  const auth = useAuth()
  return useQuery(
    queryOptions({
      queryKey: taskKeys.activity(organizationId, taskId, query),
      queryFn: ({ signal }) => listTaskActivity(auth.transport, organizationId, taskId, query, { signal }),
    }),
  )
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

const updateMutationKey = (organizationId: string) =>
  [...taskKeys.all(organizationId), 'update'] as const

const updateVariablesSchema = z.object({ input: updateTaskRequestSchema, taskId: z.string() })

export function useUpdateTaskMutation(organizationId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: updateMutationKey(organizationId),
    mutationFn: ({ input, taskId }: { input: UpdateTaskRequest; taskId: string }) =>
      updateTask(auth.transport, organizationId, taskId, input),
    onSuccess: (response) => {
      queryClient.setQueryData(taskKeys.detail(organizationId, response.task.id), response)
      return queryClient.invalidateQueries({ queryKey: taskKeys.all(organizationId) })
    },
  })
}

/** The updates of one task that are still in flight, oldest first. Several saves can overlap. */
export function usePendingTaskUpdates(organizationId: string, taskId: string) {
  const pending = useMutationState({
    filters: { mutationKey: updateMutationKey(organizationId), status: 'pending' },
    select: (mutation) => updateVariablesSchema.safeParse(mutation.state.variables).data,
  })
  return pending.flatMap((variables) => (variables?.taskId === taskId ? [variables.input] : []))
}

/**
 * Moves a task to another board column. The card changes column at once and goes back when the
 * server refuses. `columnQuery` gives the list query of one column, so the cache entries of the
 * two columns involved are known without scanning the cache.
 */
export function useMoveTaskMutation(
  organizationId: string,
  columnQuery: (status: TaskStatus) => Partial<TasksQuery>,
) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ status, task }: { status: TaskStatus; task: TaskDto }) =>
      updateTask(auth.transport, organizationId, task.id, { status }),
    onMutate: async ({ status, task }) => {
      const fromKey = taskKeys.list(organizationId, columnQuery(task.status))
      const toKey = taskKeys.list(organizationId, columnQuery(status))
      // A refetch that lands after the optimistic update would put the old column back.
      await queryClient.cancelQueries({ queryKey: taskKeys.all(organizationId) })
      const previous = [
        [fromKey, queryClient.getQueryData<TasksResponse>(fromKey)],
        [toKey, queryClient.getQueryData<TasksResponse>(toKey)],
      ] as const
      queryClient.setQueryData<TasksResponse>(fromKey, (page) => page && removeTaskFromPage(page, task.id))
      queryClient.setQueryData<TasksResponse>(toKey, (page) => page && addTaskToPage(page, task, status))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      for (const [key, page] of context?.previous ?? []) queryClient.setQueryData(key, page)
    },
    onSuccess: (response) =>
      queryClient.setQueryData(taskKeys.detail(organizationId, response.task.id), response),
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskKeys.all(organizationId) }),
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
