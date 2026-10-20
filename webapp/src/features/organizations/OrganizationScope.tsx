import { Link } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'

import { PageContainer } from '@/components/PageLayout'
import { EmptyState, LoadingRows, QueryErrorAlert } from '@/components/QueryStates'
import { Button } from '@/components/ui/button'
import { OrganizationContext } from './context'
import { findOrganization, organizationPermissions } from './model'
import { useOrganizationsQuery } from './queries'

/**
 * Gates every screen of one organization. The organization comes from the signed-in person's own
 * list, so an unknown id, a foreign id, and a malformed id all end on the same not-found screen.
 */
export function OrganizationScope({
  children,
  organizationId,
}: {
  children: ReactNode
  organizationId: string
}) {
  const organizations = useOrganizationsQuery()
  const organization = organizations.data
    ? findOrganization(organizations.data.items, organizationId)
    : null
  const value = useMemo(
    () => (organization ? { organization, permissions: organizationPermissions(organization.role) } : null),
    [organization],
  )

  if (organizations.isPending) {
    return (
      <PageContainer>
        <LoadingRows label="Loading organization" />
      </PageContainer>
    )
  }
  if (organizations.isError) {
    return (
      <PageContainer>
        <QueryErrorAlert
          error={organizations.error}
          onRetry={() => void organizations.refetch()}
          title="Organization is unavailable"
        />
      </PageContainer>
    )
  }
  if (!value) {
    return (
      <PageContainer>
        <EmptyState
          action={
            <Button asChild>
              <Link to="/app">Back to your organizations</Link>
            </Button>
          }
          description="It does not exist, or you are not a member of it."
          testId="organization-not-found"
          title="Organization not found"
        />
      </PageContainer>
    )
  }

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}
