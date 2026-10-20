import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

type Session = { accessToken: string; user: { id: string; email: string } }
type ProjectBody = { name: string; key: string; description?: string | null }

describe('projects', () => {
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
    await prisma.$disconnect()
  })

  test('requires authentication on every project route', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const project = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    const base = `/api/organizations/${acme.id}/projects`

    for (const [method, path] of [
      ['POST', base],
      ['GET', base],
      ['GET', `${base}/${project.id}`],
      ['PATCH', `${base}/${project.id}`],
    ] as const) {
      const response = await app.request(path, { method })
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  test('lets an admin create a project and read it back', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')

    const response = await call(alice, 'POST', projectsPath(acme.id), {
      name: '  Website  ',
      key: ' web ',
      description: ' Public site ',
    })
    expect(response.status).toBe(201)
    const { project } = await response.json()
    expect(project).toMatchObject({
      key: 'WEB',
      name: 'Website',
      description: 'Public site',
      archivedAt: null,
    })

    const bare = await createProject(alice, acme.id, { name: 'Mobile', key: 'MOB' })
    expect(bare.description).toBeNull()

    const read = await call(alice, 'GET', `${projectsPath(acme.id)}/${project.id}`)
    expect(read.status).toBe(200)
    expect((await read.json()).project).toMatchObject({
      id: project.id,
      key: 'WEB',
      taskCounts: { backlog: 0, todo: 0, in_progress: 0, done: 0 },
    })
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(stored).toMatchObject({ organizationId: acme.id, nextTaskNumber: 1 })
  })

  test('lets members read projects but not write them', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await addMember(alice, acme.id, bob.user.email)
    const project = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    const base = projectsPath(acme.id)

    expect((await call(bob, 'GET', base)).status).toBe(200)
    expect((await call(bob, 'GET', `${base}/${project.id}`)).status).toBe(200)

    const denied: Array<[string, string, unknown]> = [
      ['POST', base, { name: 'Mobile', key: 'MOB' }],
      ['PATCH', `${base}/${project.id}`, { name: 'Renamed' }],
      ['PATCH', `${base}/${project.id}`, { archived: true }],
    ]
    for (const [method, path, body] of denied) {
      const response = await call(bob, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(403)
      expect((await response.json()).error.code).toBe('FORBIDDEN')
    }
    expect(await prisma.project.findMany({ select: { name: true, archivedAt: true } })).toEqual([
      { name: 'Website', archivedAt: null },
    ])
  })

  test('rejects invalid input with 400', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const project = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    const base = projectsPath(acme.id)

    const invalidCreates: unknown[] = [
      { name: 'Site' },
      { key: 'SITE' },
      { name: 'Site', key: 'A' },
      { name: 'Site', key: 'TOOLONG' },
      { name: 'Site', key: '1AB' },
      { name: 'Site', key: 'A-B' },
      { name: 'x', key: 'SITE' },
      { name: 'Site', key: 'SITE', description: 'x'.repeat(2001) },
      { name: 'Site', key: 'SITE', nextTaskNumber: 99 },
      { name: 'Site', key: 'SITE', organizationId: acme.id },
    ]
    for (const body of invalidCreates) {
      const response = await call(alice, 'POST', base, body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
    }

    const invalidUpdates: unknown[] = [
      {},
      { key: 'NEW' },
      { name: 'x' },
      { archived: 'yes' },
      { description: 'x'.repeat(2001) },
    ]
    for (const body of invalidUpdates) {
      const response = await call(alice, 'PATCH', `${base}/${project.id}`, body)
      expect(response.status, JSON.stringify(body)).toBe(400)
    }

    expect((await call(alice, 'GET', `${base}/not-a-uuid`)).status).toBe(400)
    expect((await call(alice, 'PATCH', `${base}/not-a-uuid`, { name: 'Valid' })).status).toBe(400)
    for (const query of ['archived=maybe', 'page=0', 'page=101', 'pageSize=101', 'sort=name']) {
      expect((await call(alice, 'GET', `${base}?${query}`)).status, query).toBe(400)
    }

    expect(await prisma.project.count()).toBe(1)
    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({
      key: 'WEB',
      name: 'Website',
    })
  })

  test('rejects a duplicate name or key inside one organization', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    const mobile = await createProject(alice, acme.id, { name: 'Mobile', key: 'MOB' })
    const base = projectsPath(acme.id)

    for (const body of [
      { name: 'Website', key: 'OTHER' },
      { name: ' website ', key: 'OTHER' },
      { name: 'WEBSITE', key: 'OTHER' },
      { name: 'Other', key: 'WEB' },
      { name: 'Other', key: 'web' },
    ]) {
      const response = await call(alice, 'POST', base, body)
      expect(response.status, JSON.stringify(body)).toBe(409)
      expect((await response.json()).error.code).toBe('CONFLICT')
    }

    const rename = await call(alice, 'PATCH', `${base}/${mobile.id}`, { name: 'WEBSITE' })
    expect(rename.status).toBe(409)
    expect(await prisma.project.count()).toBe(2)

    // The same name and key are free in another organization.
    const bob = await register('bob@example.com')
    const beta = await createOrganization(bob, 'Beta')
    await createProject(bob, beta.id, { name: 'Website', key: 'WEB' })
  })

  test('creates only one of two concurrent projects with the same name or key', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const base = projectsPath(acme.id)

    const sameName = await Promise.all([
      call(alice, 'POST', base, { name: 'Website', key: 'ONE' }),
      call(alice, 'POST', base, { name: 'website', key: 'TWO' }),
    ])
    expect(sameName.map((response) => response.status).sort()).toEqual([201, 409])

    const sameKey = await Promise.all([
      call(alice, 'POST', base, { name: 'Alpha', key: 'KEY' }),
      call(alice, 'POST', base, { name: 'Beta', key: 'KEY' }),
    ])
    expect(sameKey.map((response) => response.status).sort()).toEqual([201, 409])
    expect(await prisma.project.count()).toBe(2)
  })

  test('renames, edits the description, archives and unarchives', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const project = await createProject(alice, acme.id, {
      name: 'Website',
      key: 'WEB',
      description: 'Old',
    })
    const path = `${projectsPath(acme.id)}/${project.id}`

    const renamed = await call(alice, 'PATCH', path, { name: '  Marketing site ', description: null })
    expect(renamed.status).toBe(200)
    expect((await renamed.json()).project).toMatchObject({
      key: 'WEB',
      name: 'Marketing site',
      description: null,
    })

    // A name that differs only in case from the project's own name is allowed.
    expect((await call(alice, 'PATCH', path, { name: 'MARKETING SITE' })).status).toBe(200)

    const archived = await (await call(alice, 'PATCH', path, { archived: true })).json()
    expect(archived.project.archivedAt).toBeString()
    const again = await (await call(alice, 'PATCH', path, { archived: true })).json()
    expect(again.project.archivedAt).toBe(archived.project.archivedAt)

    // An archived project stays readable and editable.
    expect((await call(alice, 'GET', path)).status).toBe(200)
    expect((await call(alice, 'PATCH', path, { description: 'Kept' })).status).toBe(200)

    const restored = await (await call(alice, 'PATCH', path, { archived: false })).json()
    expect(restored.project).toMatchObject({ archivedAt: null, description: 'Kept' })
  })

  test('lists active projects by default and filters by archive state and name', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const base = projectsPath(acme.id)
    const website = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    await createProject(alice, acme.id, { name: 'Mobile app', key: 'MOB' })
    const legacy = await createProject(alice, acme.id, { name: 'Legacy site', key: 'OLD' })
    await call(alice, 'PATCH', `${base}/${legacy.id}`, { archived: true })

    expect(await listNames(alice, base)).toEqual(['Mobile app', 'Website'])
    expect(await listNames(alice, `${base}?archived=false`)).toEqual(['Mobile app', 'Website'])
    expect(await listNames(alice, `${base}?archived=true`)).toEqual(['Legacy site'])
    expect(await listNames(alice, `${base}?archived=all`)).toEqual(['Legacy site', 'Mobile app', 'Website'])
    expect(await listNames(alice, `${base}?q=SITE`)).toEqual(['Website'])
    expect(await listNames(alice, `${base}?q=site&archived=all`)).toEqual(['Legacy site', 'Website'])
    expect(await listNames(alice, `${base}?q=%20%20`)).toEqual(['Mobile app', 'Website'])
    expect(await listNames(alice, `${base}?q=nothing`)).toEqual([])
    expect(await listNames(alice, `${base}?q=${encodeURIComponent('%')}`)).toEqual([])
    expect(website.archivedAt).toBeNull()
  })

  test('paginates the list with a stable order', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const base = projectsPath(acme.id)
    for (const key of ['AA', 'BB', 'CC', 'DD', 'EE']) {
      await createProject(alice, acme.id, { name: `Project ${key}`, key })
    }

    const first = await (await call(alice, 'GET', `${base}?pageSize=2`)).json()
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 5, hasNext: true })
    const second = await (await call(alice, 'GET', `${base}?pageSize=2&page=2`)).json()
    expect(second).toMatchObject({ page: 2, hasNext: true })
    const last = await (await call(alice, 'GET', `${base}?pageSize=2&page=3`)).json()
    expect(last).toMatchObject({ page: 3, total: 5, hasNext: false })
    const beyond = await (await call(alice, 'GET', `${base}?pageSize=2&page=4`)).json()
    expect(beyond).toMatchObject({ items: [], total: 5, hasNext: false })

    const keys = [first, second, last].flatMap((page) => page.items.map((item: { key: string }) => item.key))
    expect(keys).toEqual(['EE', 'DD', 'CC', 'BB', 'AA'])
  })

  test('counts the tasks of one project by status', async () => {
    const alice = await register('alice@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const website = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    const mobile = await createProject(alice, acme.id, { name: 'Mobile', key: 'MOB' })
    const bob = await register('bob@example.com')
    const beta = await createOrganization(bob, 'Beta')
    const foreign = await createProject(bob, beta.id, { name: 'Website', key: 'WEB' })
    for (const [project, organizationId, creatorId, statuses] of [
      [website, acme.id, alice.user.id, ['todo', 'todo', 'done']],
      [mobile, acme.id, alice.user.id, ['backlog']],
      [foreign, beta.id, bob.user.id, ['in_progress', 'in_progress']],
    ] as const) {
      for (const [index, status] of statuses.entries()) {
        await prisma.task.create({
          data: { organizationId, projectId: project.id, number: index + 1, title: 'Task', status, creatorId },
        })
      }
    }

    const read = await call(alice, 'GET', `${projectsPath(acme.id)}/${website.id}`)
    expect((await read.json()).project.taskCounts).toEqual({
      backlog: 0,
      todo: 2,
      in_progress: 0,
      done: 1,
    })
  })

  test('hides projects from users who are not members of the organization', async () => {
    const alice = await register('alice@example.com')
    const mallory = await register('mallory@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await createOrganization(mallory, 'Evil Corp')
    const project = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    const base = projectsPath(acme.id)

    const attempts: Array<[string, string, unknown?]> = [
      ['GET', base],
      ['POST', base, { name: 'Stolen', key: 'STL' }],
      ['GET', `${base}/${project.id}`],
      ['PATCH', `${base}/${project.id}`, { name: 'Hacked', archived: true }],
      ['GET', `/api/organizations/018f0000-0000-7000-8000-000000000000/projects`],
      ['GET', `/api/organizations/not-a-uuid/projects`],
    ]
    for (const [method, path, body] of attempts) {
      const response = await call(mallory, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(404)
      expect((await response.json()).error.code).toBe('NOT_FOUND')
    }

    expect(await prisma.project.findMany({ select: { name: true, archivedAt: true } })).toEqual([
      { name: 'Website', archivedAt: null },
    ])
  })

  test('answers 404 when a project id is used under another organization or does not exist', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const beta = await createOrganization(bob, 'Beta')
    const acmeProject = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    await createProject(bob, beta.id, { name: 'Betaweb', key: 'BWEB' })
    const unknownId = '018f0000-0000-7000-8000-000000000000'

    // Bob is an admin of Beta, so the guard passes. The project still is not in his organization.
    const betaBase = projectsPath(beta.id)
    for (const [method, id, body] of [
      ['GET', acmeProject.id],
      ['PATCH', acmeProject.id, { name: 'Hacked', archived: true }],
      ['GET', unknownId],
      ['PATCH', unknownId, { name: 'Ghost' }],
    ] as const) {
      const response = await call(bob, method, `${betaBase}/${id}`, body)
      expect(response.status, `${method} ${id}`).toBe(404)
      expect((await response.json()).error.code).toBe('NOT_FOUND')
    }
    expect(await listNames(bob, betaBase)).toEqual(['Betaweb'])
    expect(await prisma.project.findUniqueOrThrow({ where: { id: acmeProject.id } })).toMatchObject({
      name: 'Website',
      archivedAt: null,
    })
  })

  function projectsPath(organizationId: string) {
    return `/api/organizations/${organizationId}/projects`
  }

  async function listNames(session: Session, path: string): Promise<string[]> {
    const response = await call(session, 'GET', path)
    expect(response.status, path).toBe(200)
    const { items } = await response.json()
    return items.map((item: { name: string }) => item.name).sort()
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

  async function createProject(session: Session, organizationId: string, body: ProjectBody) {
    const response = await call(session, 'POST', projectsPath(organizationId), body)
    expect(response.status).toBe(201)
    return (await response.json()).project
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
