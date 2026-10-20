import { useState } from 'react'

import { EmptyState, LoadingRows, QueryErrorAlert } from '@/components/QueryStates'
import { Typography } from '@/components/typography'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { pageWindow } from '@/platform/pagination'
import { describeActivity } from './activity-model'
import { userInitials, userLabel } from './model'
import { useTaskActivityQuery } from './queries'

const ACTIVITY_PAGE_SIZE = 20

const dateTimeFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

/** The journal of one task: who changed what, newest first. */
export function TaskActivitySection({
  organizationId,
  taskId,
}: {
  organizationId: string
  taskId: string
}) {
  const [page, setPage] = useState(1)
  const activity = useTaskActivityQuery(organizationId, taskId, {
    page,
    pageSize: ACTIVITY_PAGE_SIZE,
  })
  const pages = activity.data ? pageWindow(activity.data) : null

  return (
    <div className="grid gap-4" data-testid="task-activity">
      {activity.isPending && <LoadingRows label="Loading activity" rows={2} />}
      {activity.isError && (
        <QueryErrorAlert
          error={activity.error}
          onRetry={() => void activity.refetch()}
          title="Activity is unavailable"
        />
      )}
      {activity.data && activity.data.items.length === 0 && (
        <EmptyState
          description="Changes to this task will appear here."
          testId="task-activity-empty"
          title="No activity yet"
        />
      )}
      {activity.data && activity.data.items.length > 0 && (
        <ul aria-label="Activity" className="grid gap-4" role="list">
          {activity.data.items.map((entry) => (
            <li className="flex gap-3" data-testid="task-activity-entry" key={entry.id}>
              <Avatar aria-hidden size="sm">
                <AvatarFallback>{userInitials(entry.actor)}</AvatarFallback>
              </Avatar>
              <div className="grid gap-0.5">
                <Typography variant="bodySm" wrap="break">
                  <Typography as="span" variant="bodySmMedium">
                    {userLabel(entry.actor)}
                  </Typography>{' '}
                  {describeActivity(entry)}
                </Typography>
                <Typography tone="muted" variant="caption">
                  {dateTimeFormatter.format(new Date(entry.createdAt))}
                </Typography>
              </div>
            </li>
          ))}
        </ul>
      )}
      {activity.data && pages && pages.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            size="sm"
            type="button"
            variant="outline"
          >
            Newer
          </Button>
          <Typography tone="muted" variant="bodySm">
            {`Page ${activity.data.page} of ${pages.totalPages}`}
          </Typography>
          <Button
            disabled={!pages.canGoNext}
            onClick={() => setPage((current) => current + 1)}
            size="sm"
            type="button"
            variant="outline"
          >
            Older
          </Button>
        </div>
      )}
    </div>
  )
}
