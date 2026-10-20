# TaskFlow: Technical Specification and Architecture Blueprint

This document is the single source of truth for TaskFlow v1. Code and configuration remain the source of truth for current behavior. This document defines intent, rules, and the remaining work. If code and this document disagree, fix the code or change this document in the same change. Do not leave both.

Status date: 2026-10-20. Slices 1 to 3 are done. Slices 4 to 9 are planned.

## Summary for the product owner (Russian)

- TaskFlow: веб-приложение для команд. Люди входят, создают организации, внутри них проекты, в проектах задачи, у задач комментарии.
- Данные одной организации никогда не видны другой. Чужая организация всегда отвечает «не найдено».
- Две роли внутри организации: Admin (полный доступ) и Member (читает всё, меняет только свои и назначенные ему задачи).
- В документе есть три продуктовых решения, помеченные **DECISION**. Они влияют на то, что видят пользователи. Рекомендации уже выбраны, если вы не возразите, реализуем их.
- Всё остальное (формат ответов, пагинация, структура кода) определено здесь и не требует вашего решения.

## 1. Purpose and concept

TaskFlow manages tasks and projects for several teams. Each team is an organization. One person can belong to several organizations with a different role in each.

Scope of v1: sign-in, organizations and members, projects, tasks, comments, REST API, PostgreSQL, and a React web application. Out of scope: AI features, microservices, cloud deployment, mobile, email invitations for unregistered people, file attachments on tasks, notifications, and organization deletion.

Stack: the template stack. Bun and Hono serve the API. Prisma and PostgreSQL store data. React and Tailwind build the web application. Zod schemas in `packages/contracts` define every API request and response. Local run: Docker Compose starts PostgreSQL.

### 1.1 Multi-tenancy

The tenant is the organization. These rules hold for every feature:

1. Every row of a tenant-owned table (`projects`, `tasks`, `comments`) stores `organization_id`.
2. Every route under `/api/organizations/:organizationId/...` passes through the membership guard (`createRequireMembership`). The guard loads the caller's membership. It returns 404 for a non-member and for a malformed or unknown id. Handlers read the organization from `c.var.membership`. They never read it from the request body.
3. Every query on tenant-owned tables filters by `organization_id`.
4. Composite foreign keys keep child rows in the parent's organization. A task cannot point to a project of another organization. A comment cannot point to a task of another organization.
5. The assignee of a task must be a member of the task's organization. The application checks it, because the database cannot express it with the current keys.
6. The platform role (`User.role = admin`) gives no access to organization data.
7. A response never confirms that a foreign organization, project, task, or comment exists. Unknown and foreign resources both return 404.

## 2. Domain model

| Entity | Meaning |
| --- | --- |
| User | A registered person. Owned by the template auth module. Has a platform role (`user` or `admin`). |
| Organization | A tenant. Has a name and a unique slug. |
| OrganizationMember (membership) | Links a user to an organization with a role (`admin` or `member`). Unique per pair. |
| Project | A named container of tasks inside one organization. Can be archived. |
| Task | A unit of work inside one project. |
| Comment | A text note on a task, written by one member. |

Other tables (`auth_sessions`, `password_reset_tokens`, `user_avatars`, `task_outbox`, `rate_limit_buckets`) belong to the template. This document does not change them.

### 2.1 Enumerations

| Enum | Values |
| --- | --- |
| `OrganizationRole` | `admin`, `member` |
| `TaskStatus` | `backlog`, `todo`, `in_progress`, `done` |
| `TaskPriority` | `low`, `medium`, `high` (declared in this order, so database sorting follows it) |
| `UserRole` (platform) | `user`, `admin` |

API values use the same lowercase names. The web application shows them as Backlog, To Do, In Progress, Done, Low, Medium, High.

### 2.2 Current schema

The schema lives in `backend/prisma/schema/tasks.prisma`. The relevant models today:

```prisma
model Organization {
  id        String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  name      String
  slug      String   @unique(map: "organizations_slug_key")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  members  OrganizationMember[]
  projects Project[]
  tasks    Task[]
  comments Comment[]
  @@map("organizations")
}

model OrganizationMember {
  id             String           @id @default(dbgenerated("uuidv7()")) @db.Uuid
  organizationId String           @map("organization_id") @db.Uuid
  userId         String           @map("user_id") @db.Uuid
  role           OrganizationRole @default(member)
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([userId])
  @@map("organization_members")
}

model Project {
  id             String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String
  description    String?
  archivedAt     DateTime? @map("archived_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  tasks        Task[]

  @@unique([id, organizationId])        // target of the composite key from Task
  @@unique([organizationId, name])
  @@map("projects")
}

model Task {
  id             String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  projectId      String       @map("project_id") @db.Uuid
  title          String
  description    String?
  status         TaskStatus   @default(backlog)
  priority       TaskPriority @default(medium)
  assigneeId     String?      @map("assignee_id") @db.Uuid
  creatorId      String       @map("creator_id") @db.Uuid
  dueDate        DateTime?    @map("due_date")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  project  Project @relation(fields: [projectId, organizationId], references: [id, organizationId], onDelete: Cascade)
  assignee User?   @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  creator  User    @relation("TaskCreator", fields: [creatorId], references: [id], onDelete: Restrict)
  comments Comment[]

  @@unique([id, organizationId])        // target of the composite key from Comment
  @@index([organizationId, projectId, status])
  @@index([projectId, status])
  @@index([organizationId, assigneeId, status])
  @@index([assigneeId])
  @@index([creatorId])
  @@index([organizationId, dueDate])
  @@map("tasks")
}

model Comment {
  id             String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  taskId         String   @map("task_id") @db.Uuid
  authorId       String   @map("author_id") @db.Uuid
  body           String
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  task   Task @relation(fields: [taskId, organizationId], references: [id, organizationId], onDelete: Cascade)
  author User @relation(fields: [authorId], references: [id], onDelete: Restrict)

  @@index([taskId, createdAt])
  @@index([authorId])
  @@map("comments")
}
```

The listing omits `map:` names and the direct `organization` relations for brevity. The schema file is exact.

Delete behavior:

| Parent deleted | Effect |
| --- | --- |
| Organization | Cascades to members, projects, tasks, comments. No API deletes organizations in v1. |
| Project | Cascades to tasks and comments. No API deletes projects in v1. Projects are archived. |
| Task | Cascades to comments. |
| User | Cascades to memberships. Sets task assignee to null. **Blocked** while the user created tasks or wrote comments (`Restrict`). Account deletion is out of scope for v1. |

### 2.3 Planned schema changes

**Slice 4: project key.** Task identifiers like `WEB-12` need a short project key.

```prisma
model Project {
  // ...
  key            String   // 2 to 6 uppercase letters or digits, starts with a letter, immutable
  nextTaskNumber Int      @default(1) @map("next_task_number")
  @@unique([organizationId, key])
}
```

**Slice 5: task number.**

```prisma
model Task {
  // ...
  number Int   // sequence inside the project, never reused
  @@unique([projectId, number])
}
```

The service allocates `number` in the task-creation transaction with one atomic statement: `UPDATE projects SET next_task_number = next_task_number + 1 WHERE id = $1 AND organization_id = $2 RETURNING next_task_number - 1`. Deleting a task never frees its number.

**Slice 5: search index.** Add a trigram index on `tasks.title` only if measured search latency requires it (see AGENTS.md on infrastructure). Start with `ILIKE`.

**DECISION 1 (user experience): task identifiers.** Recommendation: show `KEY-number` (for example `WEB-12`) next to every task title and in URLs. It costs about one extra day in slices 4 and 5. Alternative: show only titles, with no short identifier.

## 3. Roles and permissions (RBAC)

Two role layers exist:

- Platform role (`User.role`). Only template administration uses it (user directory, dashboard). It never grants organization access.
- Organization role (`OrganizationMember.role`). All TaskFlow rules use it.

Legend: Y = allowed, N = denied (403), own = only rows the caller created, assigned = only tasks assigned to the caller, Non-member = every request returns 404.

| Action | Admin | Member | Non-member |
| --- | --- | --- | --- |
| Create organization (any signed-in user) | Y | Y | Y |
| List own organizations | Y | Y | Y |
| Read organization and member list | Y | Y | 404 |
| Add member, change role, remove another member | Y | N | 404 |
| Leave organization (remove self) | Y (not as last admin) | Y | 404 |
| Demote or remove the last admin | N (409) | N | 404 |
| List and read projects | Y | Y | 404 |
| Create, rename, edit, archive, unarchive project | Y | N | 404 |
| List and read tasks | Y | Y | 404 |
| Create task in an active project | Y | Y | 404 |
| Edit task fields | all | own or assigned | 404 |
| Change task status | all | own or assigned | 404 |
| Reassign task | all | own or assigned | 404 |
| Delete task | all | own | 404 |
| Read comments | Y | Y | 404 |
| Add comment | Y | Y | 404 |
| Edit comment | own | own | 404 |
| Delete comment | all | own | 404 |

Rules:

1. "own" means `creatorId = caller`. "assigned" means `assigneeId = caller`.
2. A member who reassigns an assigned task to someone else keeps the right to edit it only if the member also created it.
3. Archived projects are read-only: no task creation, no task edits, no new comments. Admins can unarchive.
4. An assignee must be a current member. Removing a member sets their tasks to unassigned in the same transaction (slice 5 adds this to member removal).
5. Every member reads the whole organization. There are no private projects in v1.

**DECISION 2 (user experience): member reach.** Recommendation (already agreed): members edit only their own and assigned tasks. Members read everything in the organization. Alternative: members see only projects they were added to. That needs a project membership table and about two more slices.

**DECISION 3 (user experience): adding people.** Today an admin adds someone who already has an account, by email. Recommendation: keep this for v1. Alternative: invitation links by email for people without an account. It needs an email provider choice (cost) and about one slice.

## 4. API contracts and standards

### 4.1 Conventions

- Base path `/api`. JSON bodies. Bearer access token in `Authorization`. Refresh tokens stay in cookies (browser) or token endpoints (native), as the template defines.
- OpenAPI is generated at `GET /openapi.json` from the route definitions. Every route declares its success and error responses.
- Every schema lives in `packages/contracts/src`, one file per feature, exported from `index.ts`. Clients import types from there. Never copy API types.
- Identifiers are UUIDv7 strings. Timestamps are ISO 8601 UTC strings (`createdAt`, `updatedAt`, `dueDate`).
- Field names are camelCase in the API and snake_case in the database.

### 4.2 Response format

Success. The body is a JSON object that names the resource. There is no generic `data` envelope.

| Case | Status | Body |
| --- | --- | --- |
| Read or update one | 200 | `{ "task": { ... } }` |
| Create | 201 | `{ "task": { ... } }` |
| Delete or leave | 204 | empty |
| Plain list | 200 | `{ "items": [ ... ] }` |
| Paginated list | 200 | `{ "items": [ ... ], "page": 1, "pageSize": 20, "total": 134, "hasNext": true }` |

Error. One shape for every failure (`apiErrorSchema`):

```json
{ "error": { "code": "NOT_FOUND", "message": "Organization not found", "details": null } }
```

`details` is optional. For validation errors it holds the Zod issues.

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` or `BAD_REQUEST` | Invalid body, query, or path parameter |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired token |
| 403 | `FORBIDDEN` | Caller is a member but the role does not allow the action |
| 404 | `NOT_FOUND` | Missing resource, foreign organization, or non-member |
| 409 | `CONFLICT` | Duplicate, last-admin rule, archived project write, stale state |
| 413 | `PAYLOAD_TOO_LARGE` | Body above the limit |
| 429 | `RATE_LIMITED` | Rate limit hit |
| 500 | `INTERNAL_ERROR` | Unexpected failure. The body never contains internals. |

Order of checks, always: authentication (401), organization membership (404), request validation (400), role (403), resource existence inside the organization (404), business rules (409).

### 4.3 Pagination, filtering, sorting, search

Decision: use page-based pagination, the same style as the template's admin user list. It is simple, supports page jumps in the UI, and stays fast at the expected size (tens of thousands of tasks per organization). Switch to cursors only if measured.

Query parameters for paginated lists:

| Parameter | Type | Default | Rule |
| --- | --- | --- | --- |
| `page` | integer | 1 | 1 to 100 |
| `pageSize` | integer | 20 | 1 to 100 |
| `q` | string | none | Trimmed, up to 100 characters, case-insensitive match on task `title` (and project `name` for projects). Empty means no filter. |
| `sort` | enum | `createdAt` | Per resource, see below |
| `order` | `asc` or `desc` | `desc` | |

Every ordering adds `id` as the final tie-breaker so pages never overlap.

Task list filters (all optional, combined with AND): `projectId`, `status` (repeatable or comma-separated), `priority` (repeatable), `assigneeId` (a user id, or `me`, or `none`), `creatorId` (id or `me`), `dueBefore`, `dueAfter` (ISO timestamps), `overdue` (`true` means not done and due date in the past). Sort fields for tasks: `createdAt`, `updatedAt`, `dueDate` (nulls last), `priority`, `status`. Unknown query parameters are rejected with 400 (`.strict()` schemas).

### 4.4 Endpoints

Done (slices 1 to 3):

| Method and path | Purpose | Access |
| --- | --- | --- |
| `POST /api/auth/token/register`, `/token/login`, `/token/refresh`, `/token/logout`, cookie variants, `GET /api/auth/me`, password reset | Template authentication | public or signed in |
| `PATCH /api/users/me` | Update display name | signed in |
| `POST /api/organizations` | Create organization, caller becomes admin | signed in |
| `GET /api/organizations` | Organizations of the caller, each with the caller's role | signed in |
| `GET /api/organizations/:organizationId` | One organization | member |
| `GET /api/organizations/:organizationId/members` | Member list | member |
| `POST /api/organizations/:organizationId/members` | Add registered user by email with a role | admin |
| `PATCH /api/organizations/:organizationId/members/:userId` | Change role | admin |
| `DELETE /api/organizations/:organizationId/members/:userId` | Remove member, or leave | admin, or self |

Planned:

| Method and path | Purpose | Slice |
| --- | --- | --- |
| `POST /api/organizations/:oid/projects` | Create project (`name`, `key`, `description`) | 4 |
| `GET /api/organizations/:oid/projects` | List projects (`q`, `archived`, pagination) | 4 |
| `GET /api/organizations/:oid/projects/:projectId` | One project with task counts per status | 4 |
| `PATCH /api/organizations/:oid/projects/:projectId` | Rename, edit description, archive or unarchive (`archived: boolean`) | 4 |
| `POST /api/organizations/:oid/projects/:projectId/tasks` | Create task | 5 |
| `GET /api/organizations/:oid/tasks` | List tasks with filters, sort, search, pagination | 5 |
| `GET /api/organizations/:oid/tasks/:taskId` | One task | 5 |
| `PATCH /api/organizations/:oid/tasks/:taskId` | Partial update of title, description, status, priority, assignee, due date | 6 |
| `DELETE /api/organizations/:oid/tasks/:taskId` | Delete task | 6 |
| `GET /api/organizations/:oid/tasks/:taskId/comments` | List comments, oldest first, paginated | 7 |
| `POST /api/organizations/:oid/tasks/:taskId/comments` | Add comment | 7 |
| `PATCH /api/organizations/:oid/tasks/:taskId/comments/:commentId` | Edit own comment | 7 |
| `DELETE /api/organizations/:oid/tasks/:taskId/comments/:commentId` | Delete comment | 7 |

### 4.5 Validation (Zod)

- Strict objects (`.strict()`) for every request. Unknown fields fail with 400.
- Strings are trimmed. Emails are trimmed and lowercased.
- Limits: organization name 2 to 80 characters. Project name 2 to 80. Project description up to 2000. Project key 2 to 6 characters matching `^[A-Z][A-Z0-9]{1,5}$`. Task title 1 to 200. Task description up to 10000. Comment body 1 to 5000. Due date must be a valid timestamp. Past due dates are allowed.
- `PATCH` accepts any subset of fields but at least one. Sending `null` clears nullable fields (`description`, `assigneeId`, `dueDate`).
- Path ids are validated as UUIDs. A malformed id in an organization route returns 404 from the guard. In other routes it returns 400.

### 4.6 Errors in code

- Application services throw a feature failure (`OrganizationsFailure` pattern: kinds `forbidden`, `not_found`, `conflict`). The transport layer maps it to `AppError` with the status and code above. Services never import HTTP types.
- Each new feature follows the same pattern in `backend/src/modules/<feature>`: `domain`, `application` (service and ports), `infrastructure` (Prisma repository), `transport` (routes, errors), and an `index.ts` factory.
- Writes that must stay consistent run in one transaction. Membership changes lock the organization row (`SELECT ... FOR UPDATE`). Task number allocation uses the atomic update in section 2.3.
- Do not add a cache, queue, or search service. Use PostgreSQL.

### 4.7 Security and limits

- All `/api/*` routes except `/api/auth/*` share the account rate limit (`AUTH_RATE_LIMIT_*`). Slice 9 adds a tighter limit for write endpoints.
- Request bodies are limited by `AUTH_BODY_LIMIT_BYTES`. Slice 9 sets larger limits for task and comment bodies.
- Never log tokens, passwords, or comment bodies.
- Local secrets stay in `backend/.env`, which Git ignores.

## 5. Development standards

- Follow AGENTS.md. Key rules: contract first, failing integration test, then implementation. Prefer HTTP integration tests with real PostgreSQL. Test denied access as well as success. No UI wording or snapshot assertions.
- Every slice must include cross-organization tests: a user from organization B tries every new route against organization A and gets 404, and nothing changes in the database.
- Every slice ends with `bun run typecheck`, `bun run architecture:check`, and `bun run test:backend` passing. Webapp slices also run `bun run test:webapp` and `bun run lint`. `bun run check` runs before release.
- Migrations come from Prisma (`bun run --cwd backend prisma:migrate --name <name>`). Never edit an applied migration.
- Run one backend integration file: `bun run --cwd backend test:integration src/modules/<feature>/<file>.integration.test.ts`. Docker must run. The runner starts and removes its own test database.
- Run all backend tests: `bun run test:backend`.

## 6. Remaining slices

Each slice delivers: contract, migration (if any), failing tests first, backend, webapp (slice 8 only), and green checks. A slice is done only when all listed tests pass.

### Slice 4: Projects

Requirements:
- Migration: add `key` and `nextTaskNumber` to `Project` (section 2.3).
- Endpoints: create, list, read, update (including archive and unarchive) as in section 4.4.
- Business rules: only admins write. Project `name` is unique per organization (case-sensitive index plus a case-insensitive application check). `key` is unique per organization, uppercase, and immutable. Archived projects stay readable. List hides archived projects unless `archived=true` or `archived=all`. The read response includes `taskCounts` per status.

Tests:
- Integration: create and list; admin-only writes (member gets 403); duplicate name and duplicate key return 409; invalid key returns 400; key cannot change (400); archive and unarchive; archived filter; `taskCounts` stay at zero before slice 5.
- Isolation: a user from another organization gets 404 on every project route. A project id from organization A used under organization B returns 404.
- Unit: key and name normalization.

### Slice 5: Tasks, create and read

Requirements:
- Migration: add `number` to `Task` with `@@unique([projectId, number])`.
- Endpoints: create in a project, list with filters, sort, search, pagination, and read one (sections 4.3 and 4.4).
- Business rules: any member creates tasks. `creatorId` is the caller. Default status `backlog`, priority `medium`. Assignee must be a member (else 400 `VALIDATION_ERROR` with the field in `details`). Creating in an archived project returns 409. Task responses include `key`-based identifier (`WEB-12`), assignee and creator summaries (id, email, display name), and `projectId`. Removing an organization member (slice 2 code) unassigns that member's tasks in the same transaction.
- `GET /tasks` supports `assigneeId=me` for the "my tasks" view.

Tests:
- Integration: create with defaults; create with all fields; numbering is sequential per project and independent between projects; concurrent creates never duplicate a number; assignee from another organization is rejected; archived project rejects creation; every filter and sort option; search; pagination boundaries (`hasNext`, last page, `pageSize` limits); overdue filter; member removal unassigns tasks.
- Isolation: list never returns tasks of other organizations; task id from organization A under B returns 404; a `projectId` from another organization returns 404 on create and an empty list as a list filter.

### Slice 6: Tasks, update and delete

Requirements:
- Endpoints: partial update, delete (section 4.4).
- Business rules: permissions per section 3. Moving a task between projects is not allowed in v1. Updates on archived projects return 409. A status change to or from `done` is a normal update with no side effects in v1. `updatedAt` changes on every successful update. Updates are last-write-wins in v1.

Tests:
- Integration: admin edits any task; member edits own and assigned tasks; member gets 403 on others' tasks; each editable field; clearing nullable fields; empty body returns 400; reassignment to a non-member is rejected; delete by admin, by creator, denied for others; archived project returns 409; deleted task disappears from list and its comments are gone.
- Isolation: foreign organization gets 404 on update and delete, and the row is unchanged.

### Slice 7: Comments

Requirements:
- Endpoints: list, add, edit, delete (section 4.4).
- Business rules: any member comments on any task of the organization. Only the author edits a comment. Author and admins delete. Archived projects reject new comments, edits, and deletes with 409. Comments list oldest first. Responses include author summary and `editedAt` semantics: the response exposes `createdAt` and `updatedAt`, and the client treats a difference as "edited".

Tests:
- Integration: add and list order; pagination; edit own (200) and others' (403); delete own, delete by admin, delete denied for other members; empty body returns 400; archived project returns 409; cascade on task delete.
- Isolation: comment id from organization A under B returns 404; a comment cannot be created on a task of another organization even with a forged `organizationId` in the body (the field is rejected by the strict schema).

### Slice 8: Web application

Requirements (webapp, `webapp/src/features/<feature>`, existing design system and icon library):
- First run: a signed-in user without organizations sees a create-organization screen.
- Organization switcher in the sidebar. The selected organization is part of the URL.
- Screens: members (admins manage roles and add by email), project list (admins create and archive), task board with four status columns and filters, task list with search and pagination, task detail with editing and comments, "My tasks".
- Every screen shows loading, empty, and error states with retry, and feedback for writes. Screens work on phones and with a keyboard.
- UI hides actions the role cannot perform. The backend still enforces every rule.
- Replace remaining template demo wording where it conflicts with TaskFlow.

Tests:
- Unit tests for query-key and permission-presentation logic.
- Playwright end-to-end: sign up, create organization, create project, create task, change status, comment; a second user in another organization cannot reach the first organization's URLs (sees the not-found screen).
- The user performs the final visual check.

### Slice 9: Hardening and release readiness

Requirements:
- Rate limits for write endpoints per user. Body size limits for task and comment payloads.
- Development seed: two organizations with members, projects, tasks, and comments (demo data for local use only, protected by the existing seed guards).
- Review indexes against real query plans for the task list filters. Add indexes only for measured problems.
- OpenAPI review: every route documents all its error statuses.
- README for the project: local run steps (Docker Compose, migrate, seed, dev), test commands, environment variables. Remove template-only text and `CHECKLIST.md`.
- Run `bun run check` (needs Docker and package registry access) and fix findings.

Tests:
- Integration: rate limit returns 429 with the standard error shape; oversized body returns 413; seed is idempotent.
- Full suite green.

### Backlog after v1 (not scheduled)

Email invitations; project-level membership; task attachments; activity history; notifications; organization deletion and user account deletion (needs a retention rule for tasks and comments); optimistic concurrency on task updates; production deployment.

## 7. Current state

| Slice | Status |
| --- | --- |
| 1. Sign-in (template) | Done |
| 2. Organizations and members | Done, 10 integration tests |
| 3. Access guard and isolation | Done, covered by the same tests |
| 4 to 9 | Planned |

Known facts:
- Local database: Docker Compose service `postgres`, database `taskflow`, port from `POSTGRES_PORT`. The test database `taskflow_test` is created and removed by the test runner.
- `docs/TASKFLOW_PLAN.md` is the earlier plan. This document replaces it. Delete the old file when the owner agrees.
- The earlier plan named cursor pagination. This document chose page-based pagination to match the template.
