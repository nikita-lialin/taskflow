import type { ReactNode } from 'react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingRows({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div aria-label={label} className="grid gap-3 py-2" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton className="h-12 w-full" key={index} />
      ))}
    </div>
  )
}

export function QueryErrorAlert({
  error,
  onRetry,
  title,
}: {
  error: Error
  onRetry: () => void
  title: string
}) {
  return (
    <Alert data-testid="query-error" variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
      <AlertAction>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Try again
        </Button>
      </AlertAction>
    </Alert>
  )
}

export function EmptyState({
  action,
  description,
  testId,
  title,
}: {
  action?: ReactNode
  description: string
  testId?: string
  title: string
}) {
  return (
    <Empty data-testid={testId}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export function MutationErrorAlert({ error, title }: { error: Error | null; title: string }) {
  if (!error) return null
  return (
    <Alert data-testid="mutation-error" role="alert" variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  )
}
