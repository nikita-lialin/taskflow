import {
  Add01Icon,
  Building03Icon,
  CheckListIcon,
  Folder01Icon,
  KanbanIcon,
  ListViewIcon,
  UnfoldMoreIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Link, useLocation } from '@tanstack/react-router'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Typography } from '@/components/typography'
import { findOrganization, organizationIdFromPath } from './model'
import { useOrganizationsQuery } from './queries'

type SectionLink = {
  icon: IconSvgElement
  label: string
  section: 'board' | 'tasks' | 'my-tasks' | 'projects' | 'members'
  to:
    | '/app/orgs/$organizationId/board'
    | '/app/orgs/$organizationId/tasks'
    | '/app/orgs/$organizationId/my-tasks'
    | '/app/orgs/$organizationId/projects'
    | '/app/orgs/$organizationId/members'
}

const sectionLinks: ReadonlyArray<SectionLink> = [
  { icon: KanbanIcon, label: 'Board', section: 'board', to: '/app/orgs/$organizationId/board' },
  { icon: ListViewIcon, label: 'Tasks', section: 'tasks', to: '/app/orgs/$organizationId/tasks' },
  {
    icon: CheckListIcon,
    label: 'My tasks',
    section: 'my-tasks',
    to: '/app/orgs/$organizationId/my-tasks',
  },
  {
    icon: Folder01Icon,
    label: 'Projects',
    section: 'projects',
    to: '/app/orgs/$organizationId/projects',
  },
  {
    icon: UserGroupIcon,
    label: 'Members',
    section: 'members',
    to: '/app/orgs/$organizationId/members',
  },
]

/** Organization switcher and the navigation of the selected organization. */
export function OrganizationSidebarSection() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const organizationId = organizationIdFromPath(pathname)

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Organization</SidebarGroupLabel>
        <SidebarGroupContent>
          <OrganizationSwitcher organizationId={organizationId} />
        </SidebarGroupContent>
      </SidebarGroup>
      {organizationId && (
        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Organization navigation" data-testid="organization-navigation">
              <SidebarMenu>
                {sectionLinks.map((link) => (
                  <SectionMenuItem
                    key={link.section}
                    link={link}
                    organizationId={organizationId}
                    pathname={pathname}
                  />
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  )
}

function SectionMenuItem({
  link,
  organizationId,
  pathname,
}: {
  link: SectionLink
  organizationId: string
  pathname: string
}) {
  const { setOpenMobile } = useSidebar()
  const base = `/app/orgs/${organizationId}/${link.section}`
  const isActive = pathname === base || pathname.startsWith(`${base}/`)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={link.label}>
        <Link
          data-testid={`org-nav-${link.section}`}
          onClick={() => setOpenMobile(false)}
          params={{ organizationId }}
          to={link.to}
        >
          <HugeiconsIcon aria-hidden icon={link.icon} strokeWidth={2} />
          <Typography asChild variant="control">
            <span>{link.label}</span>
          </Typography>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function OrganizationSwitcher({ organizationId }: { organizationId: string | null }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const organizations = useOrganizationsQuery()
  const items = organizations.data?.items ?? []
  const current = organizationId ? findOrganization(items, organizationId) : null
  const label = current?.name ?? (organizations.isPending ? 'Loading…' : 'Select organization')

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              aria-label="Switch organization"
              data-testid="organization-switcher"
              tooltip={label}
            >
              <HugeiconsIcon aria-hidden icon={Building03Icon} strokeWidth={2} />
              <Typography asChild truncate variant="control">
                <span>{label}</span>
              </Typography>
              <HugeiconsIcon
                aria-hidden
                className="ml-auto size-4"
                icon={UnfoldMoreIcon}
                strokeWidth={2}
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
            <DropdownMenuGroup>
              {items.map((organization) => (
                <DropdownMenuItem asChild key={organization.id}>
                  <Link
                    data-testid="organization-switcher-item"
                    onClick={() => setOpenMobile(false)}
                    params={{ organizationId: organization.id }}
                    to="/app/orgs/$organizationId/board"
                  >
                    {organization.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                data-testid="organization-switcher-new"
                onClick={() => setOpenMobile(false)}
                to="/app/organizations/new"
              >
                <HugeiconsIcon aria-hidden icon={Add01Icon} strokeWidth={2} />
                New organization
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
