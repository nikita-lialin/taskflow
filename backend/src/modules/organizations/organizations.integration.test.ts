import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma } from '../../db'
import { loadEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

type Session = { accessToken: string; user: { id: string; email: string } }

describe('organizations and access isolation', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
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

  test('requires authentication on every organization route', async () => {
    const owner = await register('owner@example.com')
    const organization = await createOrganization(owner, 'Acme')
    const id = organization.id

    for (const [method, path] of [
      ['GET', '/api/organizations'],
      ['POST', '/api/organizations'],
      ['GET', `/api/organizations/${id}`],
      ['GET', `/api/organizations/${id}/members`],
      ['POST', `/api/organizations/${id}/members`],
      ['PATCH', `/api/organizations/${id}/members/${owner.user.id}`],
      ['DELETE', `/api/organizations/${id}/members/${owner.user.id}`],
    ] as const) {
      const response = await app.request(path, { method })
      expect(response.status, `${method} ${path}`).toBe(401)
    }
  })

  test('makes the creator an admin and lists only the caller\'s organizations', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')

    const acme = await createOrganization(alice, '  Acme  ')
    expect(acme).toMatchObject({ name: 'Acme', role: 'admin' })
    await createOrganization(bob, 'Acme')

    const aliceList = await call(alice, 'GET', '/api/organizations')
    const bobList = await call(bob, 'GET', '/api/organizations')
    expect((await aliceList.json()).items.map((item: { id: string }) => item.id)).toEqual([acme.id])
    expect((await bobList.json()).items).toHaveLength(1)

    const invalid = await call(alice, 'POST', '/api/organizations', { name: 'x' })
    expect(invalid.status).toBe(400)
  })

  test('hides one organization from users who are not its members', async () => {
    const alice = await register('alice@example.com')
    const mallory = await register('mallory@example.com')
    const victim = await register('victim@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await createOrganization(mallory, 'Evil Corp')
    await addMember(alice, acme.id, victim.user.email)

    const base = `/api/organizations/${acme.id}`
    const attempts: Array<[string, string, unknown?]> = [
      ['GET', base],
      ['GET', `${base}/members`],
      ['POST', `${base}/members`, { email: mallory.user.email }],
      ['PATCH', `${base}/members/${victim.user.id}`, { role: 'admin' }],
      ['DELETE', `${base}/members/${victim.user.id}`],
      ['DELETE', `${base}/members/${alice.user.id}`],
    ]
    for (const [method, path, body] of attempts) {
      const response = await call(mallory, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(404)
      expect((await response.json()).error.code).toBe('NOT_FOUND')
    }

    // Nothing changed, and an unknown organization looks exactly like a foreign one.
    const members = await prisma.organizationMember.findMany({ where: { organizationId: acme.id } })
    expect(members.map((member) => member.role).sort()).toEqual(['admin', 'member'])
    const unknown = await call(mallory, 'GET', '/api/organizations/018f0000-0000-7000-8000-000000000000')
    expect(unknown.status).toBe(404)
  })

  test('does not let an admin of one organization act in another', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const carol = await register('carol@example.com')
    await createOrganization(alice, 'Alpha')
    const beta = await createOrganization(bob, 'Beta')

    const response = await call(alice, 'POST', `/api/organizations/${beta.id}/members`, {
      email: carol.user.email,
      role: 'admin',
    })
    expect(response.status).toBe(404)
  })

  test('does not let a platform administrator bypass organization isolation', async () => {
    const alice = await register('alice@example.com')
    const root = await register('root@example.com')
    await prisma.user.update({ where: { id: root.user.id }, data: { role: 'admin' } })
    const rootLogin = await login('root@example.com')
    const acme = await createOrganization(alice, 'Acme')

    const response = await call(rootLogin, 'GET', `/api/organizations/${acme.id}/members`)
    expect(response.status).toBe(404)
  })

  test('lets members read but not manage the organization', async () => {
    const alice = await register('alice@example.com', 'Alice')
    const bob = await register('bob@example.com')
    const carol = await register('carol@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await addMember(alice, acme.id, bob.user.email)

    const base = `/api/organizations/${acme.id}`
    const read = await call(bob, 'GET', base)
    expect((await read.json()).organization).toMatchObject({ id: acme.id, role: 'member' })
    const members = await (await call(bob, 'GET', `${base}/members`)).json()
    expect(members.items.map((member: { email: string }) => member.email).sort()).toEqual([
      'alice@example.com',
      'bob@example.com',
    ])

    const denied: Array<[string, string, unknown?]> = [
      ['POST', `${base}/members`, { email: carol.user.email }],
      ['PATCH', `${base}/members/${bob.user.id}`, { role: 'admin' }],
      ['DELETE', `${base}/members/${alice.user.id}`],
    ]
    for (const [method, path, body] of denied) {
      const response = await call(bob, method, path, body)
      expect(response.status, `${method} ${path}`).toBe(403)
      expect((await response.json()).error.code).toBe('FORBIDDEN')
    }
    expect(await prisma.organizationMember.count({ where: { organizationId: acme.id } })).toBe(2)
  })

  test('adds registered users by email as members unless told otherwise', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const acme = await createOrganization(alice, 'Acme')
    const base = `/api/organizations/${acme.id}/members`

    const added = await call(alice, 'POST', base, { email: ' Bob@Example.com ' })
    expect(added.status).toBe(201)
    expect((await added.json()).member).toMatchObject({ userId: bob.user.id, role: 'member' })

    const duplicate = await call(alice, 'POST', base, { email: bob.user.email })
    expect(duplicate.status).toBe(409)
    const unknown = await call(alice, 'POST', base, { email: 'nobody@example.com' })
    expect(unknown.status).toBe(404)
    const badRole = await call(alice, 'POST', base, { email: bob.user.email, role: 'owner' })
    expect(badRole.status).toBe(400)

    // The new member now sees the organization.
    const list = await (await call(bob, 'GET', '/api/organizations')).json()
    expect(list.items).toMatchObject([{ id: acme.id, role: 'member' }])
  })

  test('changes roles and always keeps at least one admin', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await addMember(alice, acme.id, bob.user.email)
    const alicePath = `/api/organizations/${acme.id}/members/${alice.user.id}`
    const bobPath = `/api/organizations/${acme.id}/members/${bob.user.id}`

    const demoteLast = await call(alice, 'PATCH', alicePath, { role: 'member' })
    expect(demoteLast.status).toBe(409)
    const removeLast = await call(alice, 'DELETE', alicePath)
    expect(removeLast.status).toBe(409)

    const promote = await call(alice, 'PATCH', bobPath, { role: 'admin' })
    expect(promote.status).toBe(200)
    expect((await promote.json()).member.role).toBe('admin')

    // With two admins, one can step down; the remaining one is then protected.
    expect((await call(alice, 'PATCH', alicePath, { role: 'member' })).status).toBe(200)
    expect((await call(alice, 'GET', `/api/organizations/${acme.id}`)).status).toBe(200)
    expect((await call(bob, 'PATCH', bobPath, { role: 'member' })).status).toBe(409)
  })

  test('lets a member leave and an admin remove a member', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const carol = await register('carol@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await addMember(alice, acme.id, bob.user.email)
    await addMember(alice, acme.id, carol.user.email)
    const base = `/api/organizations/${acme.id}/members`

    expect((await call(bob, 'DELETE', `${base}/${bob.user.id}`)).status).toBe(204)
    expect((await call(bob, 'GET', `/api/organizations/${acme.id}`)).status).toBe(404)

    expect((await call(alice, 'DELETE', `${base}/${carol.user.id}`)).status).toBe(204)
    expect((await call(alice, 'DELETE', `${base}/${carol.user.id}`)).status).toBe(404)
    expect(await prisma.organizationMember.count({ where: { organizationId: acme.id } })).toBe(1)
  })

  test('never leaves an organization without an admin under concurrent requests', async () => {
    const alice = await register('alice@example.com')
    const bob = await register('bob@example.com')
    const acme = await createOrganization(alice, 'Acme')
    await addMember(alice, acme.id, bob.user.email, 'admin')

    const results = await Promise.all([
      call(alice, 'PATCH', `/api/organizations/${acme.id}/members/${alice.user.id}`, { role: 'member' }),
      call(bob, 'PATCH', `/api/organizations/${acme.id}/members/${bob.user.id}`, { role: 'member' }),
    ])
    expect(results.map((response) => response.status).sort()).toEqual([200, 409])
    expect(
      await prisma.organizationMember.count({ where: { organizationId: acme.id, role: 'admin' } }),
    ).toBe(1)
  })

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

  async function addMember(
    session: Session,
    organizationId: string,
    email: string,
    role: 'admin' | 'member' = 'member',
  ) {
    const response = await call(session, 'POST', `/api/organizations/${organizationId}/members`, {
      email,
      role,
    })
    expect(response.status).toBe(201)
  }

  async function register(email: string, displayName?: string): Promise<Session> {
    const response = await app.request('/api/auth/token/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', displayName }),
    })
    expect(response.status).toBe(201)
    return response.json()
  }

  async function login(email: string): Promise<Session> {
    const response = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    })
    expect(response.status).toBe(200)
    return response.json()
  }
})
