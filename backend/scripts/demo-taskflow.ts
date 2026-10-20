import type { DbClient } from '../src/db'
import { demoFixtureUsers } from './demo-fixtures'

/**
 * Local demo workspace (`DEV_SEED_DEMO=1 bun run dev:seed`): two organizations with members,
 * projects, tasks, and comments, so every screen has something to show and the organization
 * switcher has two entries. The two seeded accounts belong to both organizations with opposite
 * roles; the passwordless fixture users fill the rest of the member lists.
 *
 * A repeat run deletes both organizations (the database cascades to their projects, tasks, and
 * comments) and builds them again, so the data never duplicates or drifts. Dates are relative to
 * the run, like the fixture users.
 */
type Person = 'admin' | 'user' | number // number: index into demoFixtureUsers
type Priority = 'low' | 'medium' | 'high'
type Status = 'backlog' | 'todo' | 'in_progress' | 'done'

type DemoTask = {
  title: string
  description?: string
  status: Status
  priority: Priority
  creator: Person
  assignee?: Person
  dueInDays?: number
  comments?: Array<{ author: Person; body: string }>
}

type DemoOrganization = {
  name: string
  slug: string
  members: Array<{ person: Person; role: 'admin' | 'member' }>
  projects: Array<{ key: string; name: string; description: string; archived?: boolean; tasks: DemoTask[] }>
}

const millisecondsPerDay = 24 * 60 * 60 * 1000
const millisecondsPerHour = 60 * 60 * 1000

const demoOrganizations: DemoOrganization[] = [
  {
    name: 'Acme Studio',
    slug: 'acme-studio',
    members: [
      { person: 'admin', role: 'admin' },
      { person: 'user', role: 'member' },
      { person: 1, role: 'member' },
      { person: 3, role: 'member' },
    ],
    projects: [
      {
        key: 'WEB',
        name: 'Website redesign',
        description: 'New marketing site and pricing page.',
        tasks: [
          {
            title: 'Collect brand references',
            status: 'done',
            priority: 'low',
            creator: 'admin',
            assignee: 1,
          },
          {
            title: 'Design the home page hero',
            description: 'Three layout options for the first screen. Share them in the team channel.',
            status: 'in_progress',
            priority: 'high',
            creator: 'admin',
            assignee: 'user',
            dueInDays: 3,
            comments: [
              { author: 'admin', body: 'Please include a mobile variant for each option.' },
              { author: 'user', body: 'Desktop drafts are ready. Mobile comes tomorrow.' },
            ],
          },
          {
            title: 'Write pricing page copy',
            status: 'todo',
            priority: 'medium',
            creator: 'user',
            assignee: 3,
            dueInDays: 10,
          },
          {
            title: 'Fix the broken contact form',
            description: 'The form does not send on Safari.',
            status: 'todo',
            priority: 'high',
            creator: 'user',
            assignee: 'user',
            dueInDays: -2,
            comments: [{ author: 1, body: 'I can reproduce this on iOS 17.' }],
          },
          { title: 'Plan the blog launch', status: 'backlog', priority: 'low', creator: 'admin' },
        ],
      },
      {
        key: 'MOB',
        name: 'Mobile app',
        description: 'First release for iOS and Android.',
        tasks: [
          {
            title: 'Set up the release pipeline',
            status: 'in_progress',
            priority: 'medium',
            creator: 'admin',
            assignee: 1,
            dueInDays: 7,
          },
          {
            title: 'Review onboarding screens',
            status: 'backlog',
            priority: 'medium',
            creator: 'user',
            assignee: 'admin',
            comments: [{ author: 'admin', body: 'I will go through them this week.' }],
          },
        ],
      },
      {
        key: 'OLD',
        name: 'Legacy portal',
        description: 'Archived. Kept for reference.',
        archived: true,
        tasks: [{ title: 'Export customer data', status: 'done', priority: 'high', creator: 'admin', assignee: 3 }],
      },
    ],
  },
  {
    name: 'Globex Labs',
    slug: 'globex-labs',
    members: [
      { person: 'user', role: 'admin' },
      { person: 'admin', role: 'member' },
      { person: 5, role: 'member' },
      { person: 7, role: 'member' },
    ],
    projects: [
      {
        key: 'API',
        name: 'Partner API',
        description: 'Public API for integration partners.',
        tasks: [
          {
            title: 'Publish the API reference',
            status: 'in_progress',
            priority: 'high',
            creator: 'user',
            assignee: 5,
            dueInDays: 5,
            comments: [{ author: 'user', body: 'Partners wait for this. Please share a draft by Friday.' }],
          },
          {
            title: 'Agree on rate limits with partners',
            status: 'todo',
            priority: 'medium',
            creator: 'user',
            assignee: 'user',
            dueInDays: 14,
          },
          { title: 'Add sandbox keys', status: 'backlog', priority: 'low', creator: 'admin', assignee: 7 },
          {
            title: 'Fix a typo in the welcome email',
            status: 'done',
            priority: 'low',
            creator: 'admin',
            assignee: 'admin',
          },
        ],
      },
      {
        key: 'OPS',
        name: 'Operations',
        description: 'Monitoring, backups, and on-call.',
        tasks: [
          {
            title: 'Test database restore',
            status: 'todo',
            priority: 'high',
            creator: 'user',
            assignee: 7,
            dueInDays: -1,
            comments: [
              { author: 7, body: 'Restore from last night works. Timing is 12 minutes.' },
              { author: 'user', body: 'Good. Please write the steps in the wiki.' },
            ],
          },
          { title: 'Set up uptime alerts', status: 'in_progress', priority: 'medium', creator: 'user', assignee: 5 },
        ],
      },
    ],
  },
]

export async function seedDemoWorkspace(
  db: DbClient,
  accounts: { adminEmail: string; userEmail: string },
) {
  const now = Date.now()
  const emails = [
    accounts.adminEmail,
    accounts.userEmail,
    ...demoFixtureUsers.map((fixture) => fixture.email),
  ]
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } })
  const idByEmail = new Map(users.map((user) => [user.email, user.id]))
  const userId = (person: Person) => {
    const email =
      person === 'admin'
        ? accounts.adminEmail
        : person === 'user'
          ? accounts.userEmail
          : demoFixtureUsers[person].email
    const id = idByEmail.get(email)
    if (!id) throw new Error(`Demo workspace needs the seeded user ${email}`)
    return id
  }

  for (const demo of demoOrganizations) {
    await db.$transaction(async (tx) => {
      await tx.organization.deleteMany({ where: { slug: demo.slug } })
      const organization = await tx.organization.create({
        data: {
          name: demo.name,
          slug: demo.slug,
          members: { create: demo.members.map((member) => ({ userId: userId(member.person), role: member.role })) },
        },
        select: { id: true },
      })

      for (const demoProject of demo.projects) {
        const project = await tx.project.create({
          data: {
            organizationId: organization.id,
            key: demoProject.key,
            name: demoProject.name,
            description: demoProject.description,
            archivedAt: demoProject.archived ? new Date(now) : null,
            nextTaskNumber: demoProject.tasks.length + 1,
          },
          select: { id: true },
        })

        for (const [index, demoTask] of demoProject.tasks.entries()) {
          await tx.task.create({
            data: {
              organizationId: organization.id,
              projectId: project.id,
              number: index + 1,
              title: demoTask.title,
              description: demoTask.description ?? null,
              status: demoTask.status,
              priority: demoTask.priority,
              creatorId: userId(demoTask.creator),
              assigneeId: demoTask.assignee === undefined ? null : userId(demoTask.assignee),
              dueDate:
                demoTask.dueInDays === undefined ? null : new Date(now + demoTask.dueInDays * millisecondsPerDay),
              comments: {
                create: (demoTask.comments ?? []).map((comment, order) => ({
                  authorId: userId(comment.author),
                  body: comment.body,
                  createdAt: new Date(now - (10 - order) * millisecondsPerHour),
                })),
              },
            },
          })
        }
      }
    })
  }

  return { organizations: demoOrganizations.length }
}
