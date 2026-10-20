import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { projectAcceptsWork } from '@/features/projects'
import { CreateTaskDialog } from './CreateTaskDialog'
import { useMemberOptions, useProjectIndex } from './hooks'

/** The "New task" button with its dialog. It waits for an active project before it opens. */
export function NewTaskAction({
  defaultProjectId,
  organizationId,
}: {
  defaultProjectId?: string
  organizationId: string
}) {
  const [open, setOpen] = useState(false)
  const { projects, query } = useProjectIndex(organizationId)
  const { members } = useMemberOptions(organizationId)
  const activeProjects = projects.filter(projectAcceptsWork)
  const hasNoProject = query.isSuccess && activeProjects.length === 0

  return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <Button
        data-testid="task-new"
        disabled={!query.isSuccess || hasNoProject}
        onClick={() => setOpen(true)}
        type="button"
      >
        <HugeiconsIcon aria-hidden icon={Add01Icon} strokeWidth={2} />
        New task
      </Button>
      {hasNoProject && (
        <Typography tone="muted" variant="caption">
          Create an active project first.
        </Typography>
      )}
      <CreateTaskDialog
        defaultProjectId={defaultProjectId}
        members={members}
        onOpenChange={setOpen}
        open={open}
        organizationId={organizationId}
        projects={activeProjects}
      />
    </div>
  )
}
