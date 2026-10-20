import { expect, test } from 'bun:test'

import { createApp } from '../app'
import type { DbClient } from '../db'
import { loadEnv } from '../env'

const env = loadEnv({
  DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/taskflow',
  JWT_SECRET: '12345678901234567890123456789012',
})

type Operation = {
  security?: unknown[]
  parameters?: Array<{ in: string; name: string }>
  requestBody?: unknown
  responses: Record<string, unknown>
}

const methods = ['get', 'post', 'put', 'patch', 'delete'] as const

async function operations() {
  const app = createApp({ env, prisma: {} as DbClient })
  const document = (await (await app.request('/openapi.json')).json()) as {
    paths: Record<string, Partial<Record<(typeof methods)[number], Operation>>>
  }
  return Object.entries(document.paths).flatMap(([path, item]) =>
    methods.flatMap((method) => (item[method] ? [{ label: `${method.toUpperCase()} ${path}`, method, path, operation: item[method] }] : [])),
  )
}

// Organization writes check the caller's role. Creating a task or a comment is open to every
// member (SPEC section 3), so those two do not return 403.
function isRoleRestrictedWrite(method: string, path: string) {
  return (
    method !== 'get' &&
    path.startsWith('/api/organizations/{organizationId}/') &&
    !(method === 'post' && /\/tasks$|\/comments$/.test(path))
  )
}

test('every operation documents the error statuses it can return', async () => {
  const missing: string[] = []

  for (const { label, method, path, operation } of await operations()) {
    const statuses = new Set(Object.keys(operation.responses))
    const expected: Array<[number, boolean]> = [
      [401, Boolean(operation.security?.length)],
      [400, Boolean(operation.requestBody) || (operation.parameters ?? []).some((parameter) => parameter.in === 'query')],
      [404, path.startsWith('/api/organizations/{organizationId}')],
      [403, isRoleRestrictedWrite(method, path)],
      [413, Boolean(operation.requestBody)],
      [429, method !== 'get'],
    ]
    for (const [status, required] of expected) {
      if (required && !statuses.has(String(status))) missing.push(`${label} lacks ${status}`)
    }
  }

  expect(missing).toEqual([])
})
