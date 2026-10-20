import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

type Session = { accessToken: string; user: { id: string; email: string } }
type TaskBody = Record<string, unknown> & { title: string }
type TaskJson = {
  id: string
  key: string
  number: number
  title: string
  projectId: string
  status: string
  priority: string
  assignee: { id: string; email: string; displayName: string | null } | null
  creator: { id: string; email: string; displayName: string | null }
  dueDate: string | null
}

const unknownId = '018f0000-0000-7000-8000-000000000000'
const day = 24 * 60 * 60 * 1000

describe('tasks', () => {
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
    // Tasks block the deletion of their creators, which other test files do in their setup.
    await prisma.organization.deleteMany()
    await prisma.$disconnect()
  })

  test('requires authentication on every task route', async () => {
    const { alice, acme, website } = await setup()
    const task = await createTask(alice, acme.id, website.id, { title: 'Task' })

    for (const [method, path] of [
      ['POST', projectTasksPath(acme.id, website.id)],
      ['GET', tasksPath(acme.id)],
      ['GET', `${tasksPath(acme.id)}/${task.id}`],
    ] as const) {
      const response = await app.request(path, { method })
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  test('creates a task with defaults and reads it back with its key and people', async () => {
    const { alice, acme, website } = await setup()

    const response = await call(alice, 'POST', projectTasksPath(acme.id, website.id), {
      title: '  Fix the header  ',
    })
    expect(response.status).toBe(201)
    const { task } = await response.json()
    expect(task).toMatchObject({
      key: 'WEB-1',
      number: 1,
      projectId: website.id,
      title: 'Fix the header',
      description: null,
      status: 'backlog',
      priority: 'medium',
      assignee: null,
      creator: { id: alice.user.id, email: alice.user.email },
      dueDate: null,
    })

    const read = await call(alice, 'GET', `${tasksPath(acme.id)}/${task.id}`)
    expect(read.status).toBe(200)
    expect((await read.json()).task).toEqual(task)
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      organizationId: acme.id,
      creatorId: alice.user.id,
      number: 1,
    })
  })

  test('creates a task with every field set', async () => {
    const { alice, bob, acme, website } = await setup()
    const dueDate = '2030-01-15T10:00:00.000Z'

    const task = await createTask(alice, acme.id, website.id, {
      title: 'Plan release',
      description: '  Steps and owners  ',
      status: 'in_progress',
      priority: 'high',
      assigneeId: bob.user.id,
      dueDate,
    })

    expect(task).toMatchObject({
      description: 'Steps and owners',
      status: 'in_progress',
      priority: 'high',
      assignee: { id: bob.user.id, email: bob.user.email },
      creator: { id: alice.user.id },
      dueDate,
    })
  })

  test('lets a member create tasks and assign them to an admin', async () => {
    const { alice, bob, acme, website } = await setup()

    const task = await createTask(bob, acme.id, website.id, { title: 'Member task', assigneeId: alice.user.id })

    expect(task).toMatchObject({ creator: { id: bob.user.id }, assignee: { id: alice.user.id } })
  })

  test('numbers tasks in order inside each project and independently between projects', async () => {
    const { alice, acme, website } = await setup()
    const mobile = await createProject(alice, acme.id, { name: 'Mobile', key: 'MOB' })

    const keys = [
      (await createTask(alice, acme.id, website.id, { title: 'A' })).key,
      (await createTask(alice, acme.id, mobile.id, { title: 'B' })).key,
      (await createTask(alice, acme.id, website.id, { title: 'C' })).key,
      (await createTask(alice, acme.id, mobile.id, { title: 'D' })).key,
      (await createTask(alice, acme.id, website.id, { title: 'E' })).key,
    ]

    expect(keys).toEqual(['WEB-1', 'MOB-1', 'WEB-2', 'MOB-2', 'WEB-3'])
    expect(await prisma.project.findUniqueOrThrow({ where: { id: website.id } })).toMatchObject({
      nextTaskNumber: 4,
    })
  })

  test('never reuses a number after a task disappears', async () => {
    const { alice, acme, website } = await setup()
    const first = await createTask(alice, acme.id, website.id, { title: 'First' })
    await prisma.task.delete({ where: { id: first.id } })

    expect((await createTask(alice, acme.id, website.id, { title: 'Second' })).key).toBe('WEB-2')
  })

  test('gives concurrent creates distinct consecutive numbers', async () => {
    const { alice, bob, acme, website } = await setup()
    const sessions = [alice, bob]

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        call(sessions[index % 2]!, 'POST', projectTasksPath(acme.id, website.id), { title: `Task ${index}` }),
      ),
    )

    expect(responses.map((response) => response.status)).toEqual(Array(12).fill(201))
    const numbers = (await prisma.task.findMany({ select: { number: true } })).map((task) => task.number)
    expect(numbers.sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
    expect(await prisma.project.findUniqueOrThrow({ where: { id: website.id } })).toMatchObject({
      nextTaskNumber: 13,
    })
  })

  test('rejects invalid create requests with 400', async () => {
    const { alice, acme, website } = await setup()
    const path = projectTasksPath(acme.id, website.id)

    const invalid: unknown[] = [
      {},
      { title: '' },
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { title: 'Task', description: 'x'.repeat(10001) },
      { title: 'Task', status: 'finished' },
      { title: 'Task', priority: 'urgent' },
      { title: 'Task', dueDate: 'tomorrow' },
      { title: 'Task', assigneeId: 'not-a-uuid' },
      { title: 'Task', number: 99 },
      { title: 'Task', creatorId: alice.user.id },
      { title: 'Task', organizationId: acme.id },
    ]
    for (const body of invalid) {
      const response = await call(alice, 'POST', path, body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
    }

    expect((await call(alice, 'POST', projectTasksPath(acme.id, 'not-a-uuid'), { title: 'Task' })).status).toBe(400)
    expect(await prisma.task.count()).toBe(0)
    expect(await prisma.project.findUniqueOrThrow({ where: { id: website.id } })).toMatchObject({
      nextTaskNumber: 1,
    })
  })

  test('accepts a past due date and clears optional fields sent as null', async () => {
    const { alice, acme, website } = await setup()

    const task = await createTask(alice, acme.id, website.id, {
      title: 'Late',
      description: null,
      assigneeId: null,
      dueDate: '2001-01-01T00:00:00.000Z',
    })

    expect(task).toMatchObject({ description: null, assignee: null, dueDate: '2001-01-01T00:00:00.000Z' })
  })

  test('rejects an assignee who is not a member of the organization', async () => {
    const { alice, acme, website } = await setup()
    const mallory = await register('mallory@example.com')
    await createOrganization(mallory, 'Evil Corp')
    const path = projectTasksPath(acme.id, website.id)

    for (const assigneeId of [mallory.user.id, unknownId]) {
      const response = await call(alice, 'POST', path, { title: 'Task', assigneeId })
      expect(response.status, assigneeId).toBe(400)
      const { error } = await response.json()
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(JSON.stringify(error.details)).toContain('assigneeId')
    }

    expect(await prisma.task.count()).toBe(0)
    expect(await prisma.project.findUniqueOrThrow({ where: { id: website.id } })).toMatchObject({
      nextTaskNumber: 1,
    })
  })

  test('refuses to create a task in an archived project until it is restored', async () => {
    const { alice, acme, website } = await setup()
    const path = projectTasksPath(acme.id, website.id)
    const projectPath = `/api/organizations/${acme.id}/projects/${website.id}`
    await call(alice, 'PATCH', projectPath, { archived: true })

    const refused = await call(alice, 'POST', path, { title: 'Task' })
    expect(refused.status).toBe(409)
    expect((await refused.json()).error.code).toBe('CONFLICT')
    expect(await prisma.task.count()).toBe(0)

    await call(alice, 'PATCH', projectPath, { archived: false })
    expect((await createTask(alice, acme.id, website.id, { title: 'Task' })).key).toBe('WEB-1')
  })

  test('keeps archived project tasks readable', async () => {
    const { alice, acme, website } = await setup()
    const task = await createTask(alice, acme.id, website.id, { title: 'Old work' })
    await call(alice, 'PATCH', `/api/organizations/${acme.id}/projects/${website.id}`, { archived: true })

    expect((await call(alice, 'GET', `${tasksPath(acme.id)}/${task.id}`)).status).toBe(200)
    expect(await listTitles(alice, tasksPath(acme.id))).toEqual(['Old work'])
  })

  test('answers 404 for a project that is unknown or belongs to another organization', async () => {
    const { alice, bob, acme, website } = await setup()
    const beta = await createOrganization(bob, 'Beta')
    const betaProject = await createProject(bob, beta.id, { name: 'Beta site', key: 'BET' })

    for (const projectId of [unknownId, betaProject.id]) {
      const response = await call(alice, 'POST', projectTasksPath(acme.id, projectId), { title: 'Task' })
      expect(response.status, projectId).toBe(404)
      expect((await response.json()).error.code).toBe('NOT_FOUND')
    }
    // The project exists in Beta only, so an admin of Beta cannot use it under Acme either.
    expect((await call(bob, 'POST', projectTasksPath(beta.id, website.id), { title: 'Task' })).status).toBe(404)

    expect(await prisma.task.count()).toBe(0)
    expect(await prisma.project.findUniqueOrThrow({ where: { id: betaProject.id } })).toMatchObject({
      nextTaskNumber: 1,
    })
  })

  test('lists every task of the organization newest first', async () => {
    const { alice, acme, website } = await setup()
    const mobile = await createProject(alice, acme.id, { name: 'Mobile', key: 'MOB' })
    await createTask(alice, acme.id, website.id, { title: 'First' })
    await createTask(alice, acme.id, mobile.id, { title: 'Second' })
    await createTask(alice, acme.id, website.id, { title: 'Third' })

    const response = await call(alice, 'GET', tasksPath(acme.id))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: 3, hasNext: false })
    expect(body.items.map((task: TaskJson) => task.key)).toEqual(['WEB-2', 'MOB-1', 'WEB-1'])
  })

  test('filters by project, status, priority and people', async () => {
    const { alice, bob, acme, website } = await setup()
    const mobile = await createProject(alice, acme.id, { name: 'Mobile', key: 'MOB' })
    await createTask(alice, acme.id, website.id, { title: 'w1', status: 'todo', priority: 'low' })
    await createTask(alice, acme.id, website.id, { title: 'w2', status: 'done', priority: 'high', assigneeId: bob.user.id })
    await createTask(bob, acme.id, mobile.id, { title: 'm1', status: 'todo', priority: 'high', assigneeId: alice.user.id })
    await createTask(bob, acme.id, mobile.id, { title: 'm2', status: 'in_progress', priority: 'medium' })
    const base = tasksPath(acme.id)

    expect(await listTitles(alice, `${base}?projectId=${website.id}`)).toEqual(['w1', 'w2'])
    expect(await listTitles(alice, `${base}?status=todo`)).toEqual(['m1', 'w1'])
    expect(await listTitles(alice, `${base}?status=todo&status=done`)).toEqual(['m1', 'w1', 'w2'])
    expect(await listTitles(alice, `${base}?status=todo,in_progress`)).toEqual(['m1', 'm2', 'w1'])
    expect(await listTitles(alice, `${base}?priority=high`)).toEqual(['m1', 'w2'])
    expect(await listTitles(alice, `${base}?priority=low,medium`)).toEqual(['m2', 'w1'])
    expect(await listTitles(alice, `${base}?assigneeId=${bob.user.id}`)).toEqual(['w2'])
    expect(await listTitles(alice, `${base}?assigneeId=me`)).toEqual(['m1'])
    expect(await listTitles(bob, `${base}?assigneeId=me`)).toEqual(['w2'])
    expect(await listTitles(alice, `${base}?assigneeId=none`)).toEqual(['m2', 'w1'])
    expect(await listTitles(alice, `${base}?creatorId=${bob.user.id}`)).toEqual(['m1', 'm2'])
    expect(await listTitles(alice, `${base}?creatorId=me`)).toEqual(['w1', 'w2'])
    expect(
      await listTitles(alice, `${base}?projectId=${mobile.id}&status=todo&priority=high&assigneeId=me&creatorId=${bob.user.id}`),
    ).toEqual(['m1'])
    expect(await listTitles(alice, `${base}?projectId=${website.id}&status=in_progress`)).toEqual([])
  })

  test('filters by due date and overdue state', async () => {
    const { alice, acme, website } = await setup()
    const now = Date.now()
    const at = (offset: number) => new Date(now + offset * day).toISOString()
    await createTask(alice, acme.id, website.id, { title: 'late', status: 'todo', dueDate: at(-5) })
    await createTask(alice, acme.id, website.id, { title: 'late done', status: 'done', dueDate: at(-5) })
    await createTask(alice, acme.id, website.id, { title: 'soon', dueDate: at(2) })
    await createTask(alice, acme.id, website.id, { title: 'far', dueDate: at(30) })
    await createTask(alice, acme.id, website.id, { title: 'open ended' })
    const base = tasksPath(acme.id)

    expect(await listTitles(alice, `${base}?overdue=true`)).toEqual(['late'])
    expect(await listTitles(alice, `${base}?overdue=false`)).toHaveLength(5)
    expect(await listTitles(alice, `${base}?dueBefore=${encodeURIComponent(at(10))}`)).toEqual(['late', 'late done', 'soon'])
    expect(await listTitles(alice, `${base}?dueAfter=${encodeURIComponent(at(10))}`)).toEqual(['far'])
    expect(
      await listTitles(alice, `${base}?dueAfter=${encodeURIComponent(at(-10))}&dueBefore=${encodeURIComponent(at(10))}`),
    ).toEqual(['late', 'late done', 'soon'])
    expect(await listTitles(alice, `${base}?overdue=true&status=done`)).toEqual([])
  })

  test('searches titles without case or edge-space sensitivity', async () => {
    const { alice, acme, website } = await setup()
    for (const title of ['Fix Login bug', 'Write docs', 'login page', '100% done_ok']) {
      await createTask(alice, acme.id, website.id, { title })
    }
    const base = tasksPath(acme.id)

    expect(await listTitles(alice, `${base}?q=LOGIN`)).toEqual(['Fix Login bug', 'login page'])
    expect(await listTitles(alice, `${base}?q=%20docs%20`)).toEqual(['Write docs'])
    expect(await listTitles(alice, `${base}?q=%20%20`)).toHaveLength(4)
    expect(await listTitles(alice, `${base}?q=nothing`)).toEqual([])
    // Search text is literal: wildcard characters match only themselves.
    expect(await listTitles(alice, `${base}?q=${encodeURIComponent('%')}`)).toEqual(['100% done_ok'])
    expect(await listTitles(alice, `${base}?q=${encodeURIComponent('_')}`)).toEqual(['100% done_ok'])
  })

  test('sorts by every sort field in both directions', async () => {
    const { alice, acme, website } = await setup()
    const now = Date.now()
    const a = await createTask(alice, acme.id, website.id, { title: 'a', status: 'done', priority: 'low', dueDate: new Date(now + 3 * day).toISOString() })
    const b = await createTask(alice, acme.id, website.id, { title: 'b', status: 'backlog', priority: 'high' })
    const c = await createTask(alice, acme.id, website.id, { title: 'c', status: 'in_progress', priority: 'medium', dueDate: new Date(now + day).toISOString() })
    await prisma.task.update({ where: { id: a.id }, data: { updatedAt: new Date(now + 3000) } })
    await prisma.task.update({ where: { id: b.id }, data: { updatedAt: new Date(now + 1000) } })
    await prisma.task.update({ where: { id: c.id }, data: { updatedAt: new Date(now + 2000) } })
    const base = tasksPath(acme.id)
    const order = async (query: string) => (await listTasks(alice, `${base}?${query}`)).items.map((task) => task.title)

    expect(await order('')).toEqual(['c', 'b', 'a'])
    expect(await order('sort=createdAt&order=asc')).toEqual(['a', 'b', 'c'])
    expect(await order('sort=updatedAt')).toEqual(['a', 'c', 'b'])
    expect(await order('sort=updatedAt&order=asc')).toEqual(['b', 'c', 'a'])
    expect(await order('sort=priority')).toEqual(['b', 'c', 'a'])
    expect(await order('sort=priority&order=asc')).toEqual(['a', 'c', 'b'])
    expect(await order('sort=status')).toEqual(['a', 'c', 'b'])
    expect(await order('sort=status&order=asc')).toEqual(['b', 'c', 'a'])
    // Tasks without a due date come last in both directions.
    expect(await order('sort=dueDate&order=asc')).toEqual(['c', 'a', 'b'])
    expect(await order('sort=dueDate&order=desc')).toEqual(['a', 'c', 'b'])
  })

  test('paginates with a stable order and clear boundaries', async () => {
    const { alice, acme, website } = await setup()
    for (let index = 1; index <= 5; index += 1) {
      // The same priority for every task forces the id tie-breaker to decide the order.
      await createTask(alice, acme.id, website.id, { title: `t${index}`, priority: 'high' })
    }
    const base = `${tasksPath(acme.id)}?sort=priority`

    const first = await listTasks(alice, `${base}&pageSize=2`)
    const second = await listTasks(alice, `${base}&pageSize=2&page=2`)
    const last = await listTasks(alice, `${base}&pageSize=2&page=3`)
    const beyond = await listTasks(alice, `${base}&pageSize=2&page=4`)

    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 5, hasNext: true })
    expect(second).toMatchObject({ page: 2, hasNext: true })
    expect(last).toMatchObject({ page: 3, total: 5, hasNext: false })
    expect(last.items).toHaveLength(1)
    expect(beyond).toMatchObject({ items: [], total: 5, hasNext: false })
    const titles = [first, second, last].flatMap((page) => page.items.map((task) => task.title))
    expect(titles).toEqual(['t5', 't4', 't3', 't2', 't1'])
    expect(await listTasks(alice, `${tasksPath(acme.id)}?pageSize=5`)).toMatchObject({ total: 5, hasNext: false })
    expect(await listTasks(alice, `${tasksPath(acme.id)}?pageSize=100`)).toMatchObject({ pageSize: 100 })
  })

  test('rejects invalid list queries with 400', async () => {
    const { alice, acme } = await setup()
    const invalid = [
      'page=0',
      'page=101',
      'pageSize=0',
      'pageSize=101',
      'sort=title',
      'order=up',
      'status=finished',
      'status=',
      'priority=urgent',
      'projectId=not-a-uuid',
      'assigneeId=someone',
      'creatorId=none',
      'dueBefore=yesterday',
      'dueAfter=2030-01-01',
      'overdue=maybe',
      `q=${'x'.repeat(101)}`,
      'unknown=1',
    ]

    for (const query of invalid) {
      const response = await call(alice, 'GET', `${tasksPath(acme.id)}?${query}`)
      expect(response.status, query).toBe(400)
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
    }
    expect((await call(alice, 'GET', `${tasksPath(acme.id)}/not-a-uuid`)).status).toBe(400)
  })

  test('answers 404 for a task that does not exist', async () => {
    const { alice, acme } = await setup()

    const response = await call(alice, 'GET', `${tasksPath(acme.id)}/${unknownId}`)

    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
  })

  test('unassigns the tasks of a removed member and leaves everything else alone', async () => {
    const { alice, bob, acme, website } = await setup()
    const beta = await createOrganization(alice, 'Beta')
    await addMember(alice, beta.id, bob.user.email)
    const betaProject = await createProject(alice, beta.id, { name: 'Beta site', key: 'BET' })
    const bobsTask = await createTask(alice, acme.id, website.id, { title: 'Bob works', assigneeId: bob.user.id })
    const alicesTask = await createTask(alice, acme.id, website.id, { title: 'Alice works', assigneeId: alice.user.id })
    const bobsOtherOrganizationTask = await createTask(alice, beta.id, betaProject.id, { title: 'Elsewhere', assigneeId: bob.user.id })

    const removed = await call(alice, 'DELETE', `/api/organizations/${acme.id}/members/${bob.user.id}`)
    expect(removed.status).toBe(204)

    const stored = await prisma.task.findMany({ select: { id: true, assigneeId: true, creatorId: true } })
    const assignee = (id: string) => stored.find((task) => task.id === id)?.assigneeId
    expect(assignee(bobsTask.id)).toBeNull()
    expect(assignee(alicesTask.id)).toBe(alice.user.id)
    expect(assignee(bobsOtherOrganizationTask.id)).toBe(bob.user.id)
    expect(await listTitles(alice, `${tasksPath(acme.id)}?assigneeId=none`)).toEqual(['Bob works'])
  })

  test('unassigns the tasks of a member who leaves', async () => {
    const { alice, bob, acme, website } = await setup()
    const task = await createTask(alice, acme.id, website.id, { title: 'Bob works', assigneeId: bob.user.id })

    expect((await call(bob, 'DELETE', `/api/organizations/${acme.id}/members/${bob.user.id}`)).status).toBe(204)

    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ assigneeId: null })
  })

  test('keeps the tasks when removing the last administrator fails', async () => {
    const { alice, acme, website } = await setup()
    const task = await createTask(alice, acme.id, website.id, { title: 'Mine', assigneeId: alice.user.id })

    expect((await call(alice, 'DELETE', `/api/organizations/${acme.id}/members/${alice.user.id}`)).status).toBe(409)

    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      assigneeId: alice.user.id,
    })
  })

  test('hides tasks from users who are not members of the organization', async () => {
    const { alice, acme, website } = await setup()
    const mallory = await register('mallory@example.com')
    await createOrganization(mallory, 'Evil Corp')
    const task = await createTask(alice, acme.id, website.id, { title: 'Secret' })

    const attempts: Array<[string, string, unknown?]> = [
      ['POST', projectTasksPath(acme.id, website.id), { title: 'Stolen' }],
      ['GET', tasksPath(acme.id)],
      ['GET', `${tasksPath(acme.id)}/${task.id}`],
      ['GET', tasksPath(unknownId)],
      ['GET', tasksPath('not-a-uuid')],
      ['POST', projectTasksPath(unknownId, website.id), { title: 'Ghost' }],
    ]
    for (const [method, path, body] of attempts) {
      const response = await call(mallory, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(404)
      expect((await response.json()).error.code).toBe('NOT_FOUND')
    }

    expect(await prisma.task.count()).toBe(1)
    expect(await prisma.project.findUniqueOrThrow({ where: { id: website.id } })).toMatchObject({
      nextTaskNumber: 2,
    })
  })

  test('never returns tasks of another organization or reads one through a foreign path', async () => {
    const { alice, bob, acme, website } = await setup()
    const beta = await createOrganization(bob, 'Beta')
    const betaProject = await createProject(bob, beta.id, { name: 'Beta site', key: 'BET' })
    const acmeTask = await createTask(alice, acme.id, website.id, { title: 'Acme task' })
    await createTask(bob, beta.id, betaProject.id, { title: 'Beta task' })

    expect(await listTitles(bob, tasksPath(beta.id))).toEqual(['Beta task'])
    expect(await listTitles(alice, tasksPath(acme.id))).toEqual(['Acme task'])
    // A foreign project, assignee or creator filter finds nothing and does not fail.
    expect(await listTitles(bob, `${tasksPath(beta.id)}?projectId=${website.id}`)).toEqual([])
    expect(await listTitles(bob, `${tasksPath(beta.id)}?creatorId=${alice.user.id}`)).toEqual([])
    expect(await listTitles(bob, `${tasksPath(beta.id)}?assigneeId=${alice.user.id}`)).toEqual([])
    // Bob is an admin of Beta, so the guard passes, but the task is not in Beta.
    const response = await call(bob, 'GET', `${tasksPath(beta.id)}/${acmeTask.id}`)
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
  })

  async function setup() {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await addMember(alice, acme.id, bob.user.email)
    const website = await createProject(alice, acme.id, { name: 'Website', key: 'WEB' })
    return { alice, bob, acme, website }
  }

  function tasksPath(organizationId: string) {
    return `/api/organizations/${organizationId}/tasks`
  }

  function projectTasksPath(organizationId: string, projectId: string) {
    return `/api/organizations/${organizationId}/projects/${projectId}/tasks`
  }

  async function listTasks(session: Session, path: string) {
    const response = await call(session, 'GET', path)
    expect(response.status, path).toBe(200)
    return (await response.json()) as { items: TaskJson[]; page: number; pageSize: number; total: number; hasNext: boolean }
  }

  async function listTitles(session: Session, path: string): Promise<string[]> {
    const { items } = await listTasks(session, path)
    return items.map((task) => task.title).sort()
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

  async function createProject(
    session: Session,
    organizationId: string,
    body: { name: string; key: string },
  ) {
    const response = await call(session, 'POST', `/api/organizations/${organizationId}/projects`, body)
    expect(response.status).toBe(201)
    return (await response.json()).project
  }

  async function createTask(
    session: Session,
    organizationId: string,
    projectId: string,
    body: TaskBody,
  ): Promise<TaskJson> {
    const response = await call(session, 'POST', projectTasksPath(organizationId, projectId), body)
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201)
    return (await response.json()).task
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
