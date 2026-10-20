import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import type { OrganizationHttpEnv } from '../organizations'
import { CommentsService } from './application/comments-service'
import { createPrismaCommentsRepository } from './infrastructure/comments-repository'
import { createCommentsRoutes } from './transport/routes'

type CreateCommentsModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  requireMembership: MiddlewareHandler<OrganizationHttpEnv>
}

export function createCommentsModule({ db, requireAuth, requireMembership }: CreateCommentsModuleOptions) {
  const service = new CommentsService({
    repository: createPrismaCommentsRepository(db),
    now: () => new Date(),
  })
  return { routes: createCommentsRoutes({ requireAuth, requireMembership, service }) }
}
