import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

type Session = { accessToken: string; user: { id: string; email: string } }
type CommentJson = {
  id: string
  taskId: string
  author: { id: string; email: string; displayName: string | null }
  body: string
  createdAt: string
  updatedAt: string
}
type CommentsJson = { items: CommentJson[]; page: number; pageSize: number; total: number; hasNext: boolean }

const unknownId = '018f0000-0000-7000-8000-000000000000'

describe('comments', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '1000',
  })
  const prisma = createPrisma(databaseUrl)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.organization.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    // Comments and tasks block the deletion of their authors, which other test files do in their setup.
    await prisma.organization.deleteMany()
    await prisma.$disconnect()
  })

  test('requires authentication on every comment route', async () => {
    const { alice, acme, task } = await setup()
    const comment = await addComment(alice, acme.id, task.id, 'Note')

    for (const [method, path] of [
      ['GET', commentsPath(acme.id, task.id)],
      ['POST', commentsPath(acme.id, task.id)],
      ['PATCH', commentPath(acme.id, task.id, comment.id)],
      ['DELETE', commentPath(acme.id, task.id, comment.id)],
    ] as const) {
      const response = await app.request(path, { method })
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  test('lets every member comment and returns the author and equal timestamps', async () => {
    const { alice, bob, acme, task } = await setup()

    const response = await call(bob, 'POST', commentsPath(acme.id, task.id), { body: '  First note  ' })

    expect(response.status).toBe(201)
    const { comment } = await response.json()
    expect(comment).toMatchObject({
      taskId: task.id,
      body: 'First note',
      author: { id: bob.user.id, email: bob.user.email, displayName: null },
    })
    expect(comment.updatedAt).toBe(comment.createdAt)
    expect(await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({
      organizationId: acme.id,
      taskId: task.id,
      authorId: bob.user.id,
    })
    expect((await addComment(alice, acme.id, task.id, 'Admin note')).author.id).toBe(alice.user.id)
  })

  test('lists comments oldest first and only those of the task', async () => {
    const { alice, bob, acme, website, task } = await setup()
    const otherTask = await createTask(alice, acme.id, website.id, 'Other')
    await addComment(alice, acme.id, task.id, 'one')
    await addComment(bob, acme.id, task.id, 'two')
    await addComment(alice, acme.id, otherTask.id, 'elsewhere')
    await addComment(bob, acme.id, task.id, 'three')

    const list = await listComments(bob, commentsPath(acme.id, task.id))

    expect(list.items.map((comment) => comment.body)).toEqual(['one', 'two', 'three'])
    expect(list).toMatchObject({ page: 1, pageSize: 20, total: 3, hasNext: false })
  })

  test('paginates without overlap and reports the next page', async () => {
    const { alice, acme, task } = await setup()
    for (const body of ['a', 'b', 'c', 'd', 'e']) await addComment(alice, acme.id, task.id, body)
    const path = commentsPath(acme.id, task.id)

    const first = await listComments(alice, `${path}?pageSize=2`)
    const last = await listComments(alice, `${path}?pageSize=2&page=3`)
    const beyond = await listComments(alice, `${path}?pageSize=2&page=4`)

    expect(first.items.map((comment) => comment.body)).toEqual(['a', 'b'])
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 5, hasNext: true })
    expect(last.items.map((comment) => comment.body)).toEqual(['e'])
    expect(last.hasNext).toBe(false)
    expect(beyond.items).toEqual([])
    for (const query of ['page=0', 'pageSize=101', 'sort=createdAt', 'q=a']) {
      expect((await call(alice, 'GET', `${path}?${query}`)).status, query).toBe(400)
    }
  })

  test('rejects invalid bodies with 400 and stores nothing', async () => {
    const { alice, acme, task } = await setup()
    const invalid = [
      {},
      { body: '' },
      { body: '   ' },
      { body: null },
      { body: 'x'.repeat(5001) },
      { body: 'ok', organizationId: unknownId },
      { body: 'ok', authorId: alice.user.id },
      { body: 'ok', taskId: unknownId },
    ]

    for (const body of invalid) {
      const response = await call(alice, 'POST', commentsPath(acme.id, task.id), body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
    }
    expect((await call(alice, 'POST', commentsPath(acme.id, 'not-a-uuid'), { body: 'ok' })).status).toBe(400)
    expect(await prisma.comment.count()).toBe(0)
  })

  test('lets only the author edit and marks the comment as edited', async () => {
    const { alice, bob, acme, task } = await setup()
    const comment = await addComment(bob, acme.id, task.id, 'Draft')
    await new Promise((resolve) => setTimeout(resolve, 10))

    const response = await call(bob, 'PATCH', commentPath(acme.id, task.id, comment.id), { body: ' Final ' })

    expect(response.status).toBe(200)
    const { comment: edited } = await response.json()
    expect(edited).toMatchObject({ id: comment.id, body: 'Final', createdAt: comment.createdAt })
    expect(new Date(edited.updatedAt).getTime()).toBeGreaterThan(new Date(edited.createdAt).getTime())

    // Not even an administrator edits the words of someone else.
    const denied = await call(alice, 'PATCH', commentPath(acme.id, task.id, comment.id), { body: 'Hijacked' })
    expect(denied.status).toBe(403)
    expect((await denied.json()).error.code).toBe('FORBIDDEN')
    expect(await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({ body: 'Final' })
  })

  test('rejects invalid edits with 400', async () => {
    const { bob, acme, task } = await setup()
    const comment = await addComment(bob, acme.id, task.id, 'Keep')

    for (const body of [{}, { body: '' }, { body: 'x'.repeat(5001) }, { body: 'ok', authorId: bob.user.id }]) {
      const response = await call(bob, 'PATCH', commentPath(acme.id, task.id, comment.id), body)
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
    expect(await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({ body: 'Keep' })
  })

  test('lets authors and administrators delete, and denies other members', async () => {
    const { alice, bob, acme, task } = await setup()
    const carol = await register('carol@example.com')
    await addMember(alice, acme.id, carol.user.email)
    const own = await addComment(bob, acme.id, task.id, 'Bob own')
    const byAdmin = await addComment(bob, acme.id, task.id, 'Bob, removed by admin')
    const protectedComment = await addComment(alice, acme.id, task.id, 'Alice own')

    const denied = await call(carol, 'DELETE', commentPath(acme.id, task.id, own.id))
    expect(denied.status).toBe(403)
    expect((await denied.json()).error.code).toBe('FORBIDDEN')
    expect((await call(bob, 'DELETE', commentPath(acme.id, task.id, protectedComment.id))).status).toBe(403)
    expect(await prisma.comment.count()).toBe(3)

    expect((await call(bob, 'DELETE', commentPath(acme.id, task.id, own.id))).status).toBe(204)
    expect((await call(alice, 'DELETE', commentPath(acme.id, task.id, byAdmin.id))).status).toBe(204)
    expect((await listComments(alice, commentsPath(acme.id, task.id))).items.map((comment) => comment.body)).toEqual([
      'Alice own',
    ])
  })

  test('answers 404 for an unknown comment and for a comment under another task', async () => {
    const { alice, acme, website, task } = await setup()
    const otherTask = await createTask(alice, acme.id, website.id, 'Other')
    const comment = await addComment(alice, acme.id, otherTask.id, 'Elsewhere')

    for (const [method, path, body] of [
      ['PATCH', commentPath(acme.id, task.id, unknownId), { body: 'x' }],
      ['DELETE', commentPath(acme.id, task.id, unknownId), undefined],
      ['PATCH', commentPath(acme.id, task.id, comment.id), { body: 'x' }],
      ['DELETE', commentPath(acme.id, task.id, comment.id), undefined],
      ['GET', commentsPath(acme.id, unknownId), undefined],
      ['POST', commentsPath(acme.id, unknownId), { body: 'x' }],
    ] as const) {
      const response = await call(alice, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(404)
      expect((await response.json()).error.code).toBe('NOT_FOUND')
    }
    expect(await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({ body: 'Elsewhere' })
  })

  test('keeps comments readable but rejects writes in an archived project, then allows them again', async () => {
    const { alice, bob, acme, website, task } = await setup()
    const comment = await addComment(bob, acme.id, task.id, 'Before')
    const projectPath = `/api/organizations/${acme.id}/projects/${website.id}`
    await call(alice, 'PATCH', projectPath, { archived: true })

    expect((await listComments(bob, commentsPath(acme.id, task.id))).total).toBe(1)
    for (const [session, method, path, body] of [
      [bob, 'POST', commentsPath(acme.id, task.id), { body: 'After' }],
      [bob, 'PATCH', commentPath(acme.id, task.id, comment.id), { body: 'Changed' }],
      [bob, 'DELETE', commentPath(acme.id, task.id, comment.id), undefined],
      [alice, 'DELETE', commentPath(acme.id, task.id, comment.id), undefined],
    ] as const) {
      const response = await call(session, method, path, body)
      expect(response.status, method).toBe(409)
      expect((await response.json()).error.code).toBe('CONFLICT')
    }
    expect(await prisma.comment.findMany()).toMatchObject([{ id: comment.id, body: 'Before' }])

    await call(alice, 'PATCH', projectPath, { archived: false })
    expect((await call(bob, 'PATCH', commentPath(acme.id, task.id, comment.id), { body: 'Changed' })).status).toBe(200)
  })

  test('removes the comments of a task when the task is deleted', async () => {
    const { alice, bob, acme, website, task } = await setup()
    const kept = await createTask(alice, acme.id, website.id, 'Kept')
    await addComment(bob, acme.id, task.id, 'Doomed')
    await addComment(bob, acme.id, kept.id, 'Safe')

    expect((await call(alice, 'DELETE', `/api/organizations/${acme.id}/tasks/${task.id}`)).status).toBe(204)

    expect(await prisma.comment.count({ where: { taskId: task.id } })).toBe(0)
    expect(await prisma.comment.count({ where: { taskId: kept.id } })).toBe(1)
    expect((await call(alice, 'GET', commentsPath(acme.id, task.id))).status).toBe(404)
  })

  test('hides every comment route from users who are not members and changes nothing', async () => {
    const { alice, acme, task } = await setup()
    const mallory = await register('mallory@example.com')
    const malloryOrganization = await createOrganization(mallory, 'Evil Corp')
    const comment = await addComment(alice, acme.id, task.id, 'Secret')
    const before = await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })

    const attempts: Array<[string, string, unknown?]> = [
      ['GET', commentsPath(acme.id, task.id)],
      ['POST', commentsPath(acme.id, task.id), { body: 'Intruder' }],
      ['PATCH', commentPath(acme.id, task.id, comment.id), { body: 'Stolen' }],
      ['DELETE', commentPath(acme.id, task.id, comment.id)],
      ['GET', commentsPath(unknownId, task.id)],
      ['GET', commentsPath('not-a-uuid', task.id)],
      // Mallory administers her own organization, but the task and comment are not in it.
      ['GET', commentsPath(malloryOrganization.id, task.id)],
      ['POST', commentsPath(malloryOrganization.id, task.id), { body: 'Smuggled' }],
      ['PATCH', commentPath(malloryOrganization.id, task.id, comment.id), { body: 'Smuggled' }],
      ['DELETE', commentPath(malloryOrganization.id, task.id, comment.id)],
    ]
    for (const [method, path, body] of attempts) {
      const response = await call(mallory, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(404)
      expect((await response.json()).error.code).toBe('NOT_FOUND')
    }

    expect(await prisma.comment.findMany()).toEqual([before])
  })

  async function setup() {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await addMember(alice, acme.id, bob.user.email)
    const website = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    const task = await createTask(alice, acme.id, website.id, 'Task')
    return { alice, bob, acme, website, task }
  }

  function commentsPath(organizationId: string, taskId: string) {
    return `/api/organizations/${organizationId}/tasks/${taskId}/comments`
  }

  function commentPath(organizationId: string, taskId: string, commentId: string) {
    return `${commentsPath(organizationId, taskId)}/${commentId}`
  }

  async function listComments(session: Session, path: string) {
    const response = await call(session, 'GET', path)
    expect(response.status, path).toBe(200)
    return (await response.json()) as CommentsJson
  }

  async function addComment(session: Session, organizationId: string, taskId: string, body: string) {
    const response = await call(session, 'POST', commentsPath(organizationId, taskId), { body })
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)
    return (await response.json()).comment as CommentJson
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

  async function createOrganization(session: Session, name: string) {
    const response = await call(session, 'POST', '/api/organizations', { name })
    expect(response.status).toBe(201)
    return (await response.json()).organization
  }

  async function createProject(session: Session, organizationId: string, body: { name: string; key: string }) {
    const response = await call(session, 'POST', `/api/organizations/${organizationId}/projects`, body)
    expect(response.status).toBe(201)
    return (await response.json()).project
  }

  async function createTask(session: Session, organizationId: string, projectId: string, title: string) {
    const response = await call(session, 'POST', `/api/organizations/${organizationId}/projects/${projectId}/tasks`, {
      title,
    })
    expect(response.status).toBe(201)
    return (await response.json()).task as { id: string }
  }

  async function addMember(session: Session, organizationId: string, email: string) {
    const response = await call(session, 'POST', `/api/organizations/${organizationId}/members`, {
      email,
      role: 'member',
    })
    expect(response.status).toBe(201)
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
