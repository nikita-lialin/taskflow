import type { OrganizationDto } from '@taskflow/contracts'
import { createContext, useContext } from 'react'

import type { OrganizationPermissions } from './model'

export type OrganizationContextValue = {
  organization: OrganizationDto
  permissions: OrganizationPermissions
}

export const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used inside OrganizationScope')
  }
  return context
}
