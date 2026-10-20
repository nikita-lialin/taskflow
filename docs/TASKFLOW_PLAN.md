# TaskFlow v1 plan

Scope: users, organizations, projects, tasks, and comments. Organization roles are `admin` and `member`. All data stays inside one organization. No AI and no microservices.

Stack: the template stack (Bun, Hono, Prisma, PostgreSQL, React, Tailwind). Schema: `backend/prisma/schema/tasks.prisma`.

## Isolation rules

- Every query on projects, tasks, and comments filters by `organizationId`. Application services take the organization from the membership check, never from the request body.
- Composite foreign keys keep `Task.organizationId` equal to its project's organization, and `Comment.organizationId` equal to its task's organization.
- The application checks that an assignee is a member of the organization. A non-member gets the same 404 as a missing record.
- `User.role` is the platform role. `OrganizationMember.role` is the role inside one organization.

## Vertical slices

Each slice follows AGENTS.md: shared contract, failing backend integration test, backend, webapp, verification.

1. **Sign-in.** The template already has registration, login, refresh, and password reset. Check them against the new schema and rename the demo screens to TaskFlow.
2. **Organizations and members.** Create an organization (the creator becomes `admin`), list the user's organizations, invite and remove members, change roles. The last admin cannot be removed or demoted.
3. **Access layer.** One organization guard for all later routes: loads the membership, rejects non-members, and exposes `admin` checks. Tests for denied access across two organizations.
4. **Projects.** Create, list, rename, archive. Create, rename, and archive need `admin`.
5. **Tasks, create and read.** Create a task in a project (the creator is the signed-in user), task list with filters (project, status, priority, assignee) and cursor pagination, task detail.
6. **Tasks, update and delete.** Change status, priority, assignee, deadline, title, and description. Members edit their own or assigned tasks. Admins edit all.
7. **Comments.** Add, list, edit and delete own comments. Admins can delete any.
8. **Webapp screens.** Organization switcher, project list, task board by status, task detail with comments.
9. **Hardening.** Rate limits on writes, input limits, seed data for demos, and a full `bun run check`.
