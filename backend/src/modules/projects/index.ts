import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import type { OrganizationHttpEnv } from '../organizations'
import { ProjectsService } from './application/projects-service'
import { createPrismaProjectsRepository } from './infrastructure/projects-repository'
import { createProjectsRoutes } from './transport/routes'

type CreateProjectsModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireMembership: MiddlewareHandler<OrganizationHttpEnv>
}

export function createProjectsModule({ db, requireAuth, requireMembership }: CreateProjectsModuleOptions) {
  const service = new ProjectsService({
    repository: createPrismaProjectsRepository(db),
    now: () => new Date(),
  })
  return { routes: createProjectsRoutes({ requireAuth, requireMembership, service }) }
}
