import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import type { OrganizationHttpEnv } from '../organizations'
import { TasksService } from './application/tasks-service'
import { createPrismaTasksRepository } from './infrastructure/tasks-repository'
import { createTasksRoutes } from './transport/routes'

type CreateTasksModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireMembership: MiddlewareHandler<OrganizationHttpEnv>
}

export function createTasksModule({ db, requireAuth, requireMembership }: CreateTasksModuleOptions) {
  const service = new TasksService({
    repository: createPrismaTasksRepository(db),
    now: () => new Date(),
  })
  return { routes: createTasksRoutes({ requireAuth, requireMembership, service }) }
}
