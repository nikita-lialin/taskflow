import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import { createPrisma } from '../db'
import { loadEnv } from '../env'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

type Session = { accessToken: string; user: { id: string; email: string } }

const writeRateLimitMax = 10

describe('write limits', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '1000',
    WRITE_RATE_LIMIT_MAX: String(writeRateLimitMax),
  })
  const prisma = createPrisma(databaseUrl)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.organization.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.organization.deleteMany()
    await prisma.$disconnect()
  })

  test('counts each write once per user, answers 429 past the budget, and spares reads and other users', async () => {
    const { alice, organizationId, taskPath } = await setup()
    // Setup spent three writes: organization, project, task.
    let accepted = 0
    let limited: Response | undefined
    for (let attempt = 0; attempt < writeRateLimitMax; attempt += 1) {
      const response = await call(alice, 'PATCH', taskPath, { title: `Title ${attempt}` })
      if (response.status === 429) {
        limited = response
        break
      }
      expect(response.status).toBe(200)
      accepted += 1
    }

    expect(accepted).toBe(writeRateLimitMax - 3)
    expect(limited?.status).toBe(429)
    expect((await limited?.json())?.error.code).toBe('RATE_LIMITED')
    expect(limited?.headers.get('retry-after')).toBeTruthy()

    expect((await call(alice, 'GET', taskPath)).status).toBe(200)
    expect((await call(alice, 'GET', `/api/organizations/${organizationId}/tasks`)).status).toBe(200)

    const bob = await register('bob@example.com')
    expect((await call(bob, 'POST', '/api/organizations', { name: 'Bobs' })).status).toBe(201)
  })

  test('rejects oversized task and comment bodies with the standard error shape', async () => {
    const { alice, organizationId, projectId, taskPath } = await setup()
    const oversized = 'x'.repeat(env.AUTH_BODY_LIMIT_BYTES + 1)

    for (const [method, path, body] of [
      ['POST', `/api/organizations/${organizationId}/projects/${projectId}/tasks`, { title: 'T', description: oversized }],
      ['PATCH', taskPath, { description: oversized }],
      ['POST', `${taskPath}/comments`, { body: oversized }],
    ] as const) {
      const response = await call(alice, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(413)
      expect((await response.json()).error.code).toBe('PAYLOAD_TOO_LARGE')
    }
  })

  test('accepts the largest valid task description and comment', async () => {
    const { alice, organizationId, projectId, taskPath } = await setup()

    const task = await call(alice, 'POST', `/api/organizations/${organizationId}/projects/${projectId}/tasks`, {
      title: 'Large',
      description: 'я'.repeat(10_000),
    })
    expect(task.status).toBe(201)
    const comment = await call(alice, 'POST', `${taskPath}/comments`, { body: 'я'.repeat(5_000) })
    expect(comment.status).toBe(201)
  })

  async function setup() {
    const alice = await register('alice@example.com')
    const organizationId = (await (await call(alice, 'POST', '/api/organizations', { name: 'Acme' })).json())
      .organization.id
    const projectId = (
      await (await call(alice, 'POST', `/api/organizations/${organizationId}/projects`, { name: 'Website', key: 'WEB' })).json()
    ).project.id
    const taskId = (
      await (
        await call(alice, 'POST', `/api/organizations/${organizationId}/projects/${projectId}/tasks`, { title: 'First' })
      ).json()
    ).task.id
    return { alice, organizationId, projectId, taskPath: `/api/organizations/${organizationId}/tasks/${taskId}` }
  }

  function call(session: Session, method: string, path: string, body?: unknown) {
    return app.request(path, {
      method,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async function register(email: string): Promise<Session> {
    const response = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    })
    expect(response.status).toBe(201)
    return response.json()
  }
})
