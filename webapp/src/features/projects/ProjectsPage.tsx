import { Add01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { projectArchivedFilterSchema, type ProjectDto, type ProjectsQuery } from '@taskflow/contracts'
import { useState, type FormEvent } from 'react'

import { DataTableFrame } from '@/components/dashboard'
import { PageContainer, PageHeader } from '@/components/PageLayout'
import {
  EmptyState,
  LoadingRows,
  MutationErrorAlert,
  QueryErrorAlert,
} from '@/components/QueryStates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useOrganization } from '@/features/organizations'
import { pageSummary, pageWindow } from '@/platform/pagination'
import { CreateProjectDialog } from './CreateProjectDialog'
import { archivedFilterLabels, isArchived } from './model'
import { useProjectsQuery, useSetProjectArchivedMutation } from './queries'

const PAGE_SIZE = 20

export function ProjectsPage() {
  const { organization, permissions } = useOrganization()
  const [draftQuery, setDraftQuery] = useState('')
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState<ProjectsQuery['archived']>('false')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const projects = useProjectsQuery(organization.id, {
    archived,
    page,
    pageSize: PAGE_SIZE,
    q: search || undefined,
  })
  const archiveMutation = useSetProjectArchivedMutation(organization.id)

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setSearch(draftQuery.trim())
  }

  const pages = projects.data ? pageWindow(projects.data) : null

  return (
    <PageContainer>
      <PageHeader
        actions={
          permissions.canManageProjects && (
            <Button data-testid="project-new" onClick={() => setCreating(true)} type="button">
              <HugeiconsIcon aria-hidden icon={Add01Icon} strokeWidth={2} />
              New project
            </Button>
          )
        }
        description={
          permissions.canManageProjects
            ? 'Create projects and archive the ones you no longer use.'
            : 'Projects group the tasks of this organization. Admins manage them.'
        }
        title="Projects"
      />
      <MutationErrorAlert error={archiveMutation.error} title="Project was not updated" />
      <DataTableFrame
        nextDisabled={!pages?.canGoNext}
        onNext={() => setPage((current) => current + 1)}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        previousDisabled={page <= 1}
        summary={
          projects.data
            ? pageSummary(projects.data, { one: 'project', other: 'projects' })
            : 'Loading projects'
        }
        title="All projects"
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row">
            <form className="flex flex-1 flex-col gap-2 sm:flex-row" onSubmit={submitSearch}>
              <InputGroup>
                <InputGroupAddon>
                  <HugeiconsIcon aria-hidden icon={Search01Icon} strokeWidth={2} />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label="Search projects"
                  data-testid="project-search-input"
                  onChange={(event) => setDraftQuery(event.target.value)}
                  placeholder="Search by name"
                  value={draftQuery}
                />
              </InputGroup>
              <Button type="submit">Search</Button>
            </form>
            <NativeSelect
              aria-label="Show projects"
              data-testid="project-archived-filter"
              onChange={(event) => {
                const parsed = projectArchivedFilterSchema.safeParse(event.target.value)
                if (parsed.success) {
                  setArchived(parsed.data)
                  setPage(1)
                }
              }}
              value={archived}
            >
              {projectArchivedFilterSchema.options.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {archivedFilterLabels[option]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        }
      >
        {projects.isPending && <LoadingRows label="Loading projects" />}
        {projects.isError && (
          <QueryErrorAlert
            error={projects.error}
            onRetry={() => void projects.refetch()}
            title="Projects are unavailable"
          />
        )}
        {projects.data && projects.data.items.length === 0 && (
          <EmptyState
            action={
              permissions.canManageProjects && !search && archived === 'false' ? (
                <Button onClick={() => setCreating(true)} type="button">
                  Create the first project
                </Button>
              ) : undefined
            }
            description={
              search || archived !== 'false'
                ? 'No project matches these filters.'
                : permissions.canManageProjects
                  ? 'Tasks live inside projects, so start by creating one.'
                  : 'An admin has to create a project before tasks can be added.'
            }
            testId="projects-empty"
            title="No projects"
          />
        )}
        {projects.data && projects.data.items.length > 0 && (
          <ul aria-label="Projects" className="grid gap-3" role="list">
            {projects.data.items.map((project) => (
              <ProjectRow
                canManage={permissions.canManageProjects}
                isPending={archiveMutation.isPending}
                key={project.id}
                onToggleArchived={() => {
                  archiveMutation.reset()
                  archiveMutation.mutate({ archived: !isArchived(project), projectId: project.id })
                }}
                project={project}
              />
            ))}
          </ul>
        )}
      </DataTableFrame>
      {permissions.canManageProjects && (
        <CreateProjectDialog
          onOpenChange={setCreating}
          open={creating}
          organizationId={organization.id}
        />
      )}
    </PageContainer>
  )
}

function ProjectRow({
  canManage,
  isPending,
  onToggleArchived,
  project,
}: {
  canManage: boolean
  isPending: boolean
  onToggleArchived: () => void
  project: ProjectDto
}) {
  const archived = isArchived(project)
  return (
    <li>
      <Item data-testid="project-row" variant="outline">
        <ItemContent>
          <ItemTitle>
            {project.name}
            <Badge variant="outline">{project.key}</Badge>
            {archived && <Badge variant="secondary">Archived</Badge>}
          </ItemTitle>
          {project.description && <ItemDescription>{project.description}</ItemDescription>}
        </ItemContent>
        {canManage && (
          <ItemActions>
            <Button
              data-testid="project-archive-toggle"
              disabled={isPending}
              onClick={onToggleArchived}
              size="sm"
              type="button"
              variant="outline"
            >
              {archived ? 'Unarchive' : 'Archive'}
            </Button>
          </ItemActions>
        )}
      </Item>
    </li>
  )
}
