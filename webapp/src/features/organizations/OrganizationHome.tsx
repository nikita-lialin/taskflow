import { Add01Icon, Building03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { OrganizationDto, UserDto } from '@taskflow/contracts'

import { PageContainer, PageHeader } from '@/components/PageLayout'
import { LoadingRows, QueryErrorAlert } from '@/components/QueryStates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { formatDate } from '@/platform/intl'
import { CreateOrganizationCard } from './CreateOrganizationCard'
import { organizationRoleLabels } from './model'
import { useOrganizationsQuery } from './queries'

/** The signed-in home: the person's organizations, or the first-run screen to create one. */
export function OrganizationHome({ user }: { user: UserDto }) {
  const organizations = useOrganizationsQuery()
  const openOrganization = useOpenOrganization()

  if (organizations.isPending) {
    return (
      <PageContainer>
        <LoadingRows label="Loading organizations" />
      </PageContainer>
    )
  }
  if (organizations.isError) {
    return (
      <PageContainer>
        <QueryErrorAlert
          error={organizations.error}
          onRetry={() => void organizations.refetch()}
          title="Organizations are unavailable"
        />
      </PageContainer>
    )
  }

  if (organizations.data.items.length === 0) {
    return (
      <PageContainer>
        <div className="mx-auto grid w-full max-w-xl gap-6" data-testid="first-run">
          <PageHeader
            description="An organization holds your team's projects and tasks."
            title={`Welcome, ${user.displayName ?? user.email}`}
          />
          <CreateOrganizationCard
            description="Create your first organization to start planning work."
            onCreated={openOrganization}
            title="Create your organization"
          />
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button asChild data-testid="organization-new-link">
            <Link to="/app/organizations/new">
              <HugeiconsIcon aria-hidden icon={Add01Icon} strokeWidth={2} />
              New organization
            </Link>
          </Button>
        }
        description="Choose an organization to open its board, tasks, and projects."
        title="Your organizations"
      />
      <ul aria-label="Organizations" className="grid gap-3 md:grid-cols-2" role="list">
        {organizations.data.items.map((organization) => (
          <OrganizationItem key={organization.id} organization={organization} />
        ))}
      </ul>
    </PageContainer>
  )
}

export function NewOrganizationPage() {
  const openOrganization = useOpenOrganization()
  return (
    <PageContainer>
      <div className="mx-auto grid w-full max-w-xl gap-6">
        <PageHeader
          description="Each organization has its own members, projects, and tasks."
          title="New organization"
        />
        <CreateOrganizationCard
          description="You become the admin of the new organization."
          onCreated={openOrganization}
          title="Organization details"
        />
      </div>
    </PageContainer>
  )
}

function OrganizationItem({ organization }: { organization: OrganizationDto }) {
  return (
    <li>
      <Item asChild variant="outline">
        <Link
          data-testid="organization-item"
          params={{ organizationId: organization.id }}
          to="/app/orgs/$organizationId/board"
        >
          <ItemMedia variant="icon">
            <HugeiconsIcon aria-hidden icon={Building03Icon} strokeWidth={2} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{organization.name}</ItemTitle>
            <ItemDescription>Created {formatDate(organization.createdAt)}</ItemDescription>
          </ItemContent>
          <Badge variant="outline">{organizationRoleLabels[organization.role]}</Badge>
        </Link>
      </Item>
    </li>
  )
}

function useOpenOrganization() {
  const navigate = useNavigate()
  return (organization: OrganizationDto) =>
    void navigate({
      params: { organizationId: organization.id },
      to: '/app/orgs/$organizationId/board',
    })
}
