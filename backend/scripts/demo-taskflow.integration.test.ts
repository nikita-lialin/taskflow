import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createPrisma } from '../src/db'
import { seedDemoFixtures } from './demo-fixtures'
import { seedDemoWorkspace } from './demo-taskflow'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

describe('seeded demo workspace', () => {
  const prisma = createPrisma(databaseUrl)
  const accounts = { adminEmail: 'admin@example.com', userEmail: 'user@example.com' }

  beforeEach(async () => {
    await prisma.organization.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
    await prisma.user.createMany({
      data: [
        { email: accounts.adminEmail, role: 'admin' },
        { email: accounts.userEmail, role: 'user' },
      ],
    })
    await seedDemoFixtures(prisma)
  })

  afterAll(async () => {
    await prisma.organization.deleteMany()
    await prisma.$disconnect()
  })

  test('creates two organizations with members, projects, tasks, and comments', async () => {
    await seedDemoWorkspace(prisma, accounts)

    expect(await prisma.organization.count()).toBe(2)
    expect(await prisma.organizationMember.count()).toBeGreaterThan(4)
    expect(await prisma.project.count()).toBeGreaterThan(2)
    expect(await prisma.task.count()).toBeGreaterThan(5)
    expect(await prisma.comment.count()).toBeGreaterThan(3)
  })

  test('keeps every task and comment inside its own organization', async () => {
    await seedDemoWorkspace(prisma, accounts)

    const organizations = await prisma.organization.findMany({
      include: { members: true, tasks: { include: { project: true, comments: true } } },
    })
    for (const organization of organizations) {
      const memberIds = new Set(organization.members.map((member) => member.userId))
      for (const task of organization.tasks) {
        expect(task.project.organizationId).toBe(organization.id)
        if (task.assigneeId) expect(memberIds.has(task.assigneeId)).toBe(true)
        for (const comment of task.comments) {
          expect(comment.organizationId).toBe(organization.id)
          expect(memberIds.has(comment.authorId)).toBe(true)
        }
      }
    }
  })

  test('is idempotent', async () => {
    await seedDemoWorkspace(prisma, accounts)
    const counts = async () => ({
      organizations: await prisma.organization.count(),
      members: await prisma.organizationMember.count(),
      projects: await prisma.project.count(),
      tasks: await prisma.task.count(),
      comments: await prisma.comment.count(),
    })
    const first = await counts()

    await seedDemoWorkspace(prisma, accounts)

    expect(await counts()).toEqual(first)
  })
})
