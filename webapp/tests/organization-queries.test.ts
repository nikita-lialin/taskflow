import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'bun:test'

import { clearAuthenticatedSession, sessionQueryKeys } from '../src/features/auth/queries'
import { commentsQueryOptions } from '../src/features/comments/queries'
import {
  membersQueryOptions,
  organizationKeys,
  organizationsQueryOptions,
} from '../src/features/organizations/queries'
import { projectsQueryOptions } from '../src/features/projects/queries'
import { taskKeys, taskQueryOptions, tasksQueryOptions } from '../src/features/tasks/queries'
import type { HttpRequestOptions } from '../src/platform/api'
import { buildQueryString } from '../src/platform/api/query-string'
import { pageWindow } from '../src/platform/pagination'

function recordingTransport() {
  const calls: { path: string; signal: AbortSignal | undefined }[] = []
  return {
    calls,
    transport: {
      request: async (path: string, _schema: unknown, options?: HttpRequestOptions) => {
        calls.push({ path, signal: options?.signal })
        return {} as never
      },
    },
  }
}

test('every organization query is session scoped, forwards its abort signal, and dies with the session', async () => {
  const queryClient = new QueryClient()
  const { calls, transport } = recordingTransport()
  const queries = [
    organizationsQueryOptions(transport),
    membersQueryOptions(transport, 'org-1'),
    projectsQueryOptions(transport, 'org-1', { page: 1 }),
    tasksQueryOptions(transport, 'org-1', { page: 1 }),
    taskQueryOptions(transport, 'org-1', 'task-1'),
    commentsQueryOptions(transport, 'org-1', 'task-1', { page: 1 }),
  ] as const

  for (const query of queries) {
    expect(query.queryKey.slice(0, sessionQueryKeys.all.length)).toEqual([...sessionQueryKeys.all])
    await queryClient.fetchQuery(query)
  }

  expect(calls).toHaveLength(queries.length)
  expect(calls.every((call) => call.signal instanceof AbortSignal)).toBe(true)

  await clearAuthenticatedSession(queryClient, () => undefined)

  for (const { queryKey } of queries) {
    expect(queryClient.getQueryData(queryKey)).toBeUndefined()
  }
})

test('the data of two organizations never shares a cache entry', () => {
  expect(taskKeys.list('org-1', { page: 1 })).not.toEqual(taskKeys.list('org-2', { page: 1 }))
  expect(taskKeys.detail('org-1', 'task-1')).not.toEqual(taskKeys.detail('org-2', 'task-1'))
})

test('one organization scope key covers all of its data and nothing of another', () => {
  const scope = organizationKeys.scope('org-1')
  const startsWithScope = (key: readonly unknown[]) =>
    scope.every((part, index) => key[index] === part)

  expect(startsWithScope(taskKeys.list('org-1', { page: 1 }))).toBe(true)
  expect(startsWithScope(organizationKeys.members('org-1'))).toBe(true)
  expect(startsWithScope(taskKeys.list('org-2', { page: 1 }))).toBe(false)
})

test('a different page or filter is a different query', () => {
  expect(taskKeys.list('org-1', { page: 1 })).not.toEqual(taskKeys.list('org-1', { page: 2 }))
  expect(taskKeys.list('org-1', { status: ['done'] })).not.toEqual(
    taskKeys.list('org-1', { status: ['todo'] }),
  )
})

test('task list requests carry filters as query parameters', async () => {
  const { calls, transport } = recordingTransport()
  await tasksQueryOptions(transport, 'org-1', {
    assigneeId: 'me',
    page: 2,
    priority: ['high', 'low'],
    q: 'login bug',
    status: ['todo'],
  }).queryFn!({ signal: new AbortController().signal } as never)

  const url = new URL(calls[0]!.path, 'https://api.invalid')
  expect(url.pathname).toBe('/api/organizations/org-1/tasks')
  expect(url.searchParams.get('assigneeId')).toBe('me')
  expect(url.searchParams.get('page')).toBe('2')
  expect(url.searchParams.get('priority')).toBe('high,low')
  expect(url.searchParams.get('q')).toBe('login bug')
  expect(url.searchParams.get('status')).toBe('todo')
})

test('query strings drop empty values', () => {
  expect(buildQueryString({ a: undefined, b: '', c: [], d: 0, e: false })).toBe('?d=0&e=false')
  expect(buildQueryString({})).toBe('')
})

test('pagination stops at the last page the server serves', () => {
  expect(pageWindow({ hasNext: true, page: 1, pageSize: 20, total: 45 })).toEqual({
    canGoNext: true,
    totalPages: 3,
    wasBounded: false,
  })
  expect(pageWindow({ hasNext: true, page: 100, pageSize: 20, total: 5_000 })).toEqual({
    canGoNext: false,
    totalPages: 100,
    wasBounded: true,
  })
  expect(pageWindow({ hasNext: false, page: 1, pageSize: 20, total: 0 }).totalPages).toBe(1)
})
