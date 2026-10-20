import { randomBytes } from 'node:crypto'

import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import { OrganizationsService } from './application/organizations-service'
import { createPrismaOrganizationsRepository } from './infrastructure/organizations-repository'
import { createRequireMembership } from './transport/middleware'
import { createOrganizationsRoutes } from './transport/routes'

type CreateOrganizationsModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}

export function createOrganizationsModule({ db, requireAuth }: CreateOrganizationsModuleOptions) {
  const service = new OrganizationsService({
    repository: createPrismaOrganizationsRepository(db),
    randomSuffix: () => randomBytes(4).toString('hex'),
  })
  return {
    routes: createOrganizationsRoutes({ requireAuth, service }),
    /** For feature modules mounted under `/api/organizations/:organizationId/...`. */
    requireMembership: createRequireMembership(service),
  }
}

export type { OrganizationHttpEnv } from './transport/middleware'
export type { OrganizationMembership } from './domain/membership'
