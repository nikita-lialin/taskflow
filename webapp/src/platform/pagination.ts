import { MAX_PAGE } from '@taskflow/contracts'

/**
 * The page window of a paginated list. The server serves pages 1 to `MAX_PAGE` only, so the
 * count of pages and the next button stop there even when `total` is larger.
 */
export function pageWindow({
  hasNext,
  page,
  pageSize,
  total,
}: {
  hasNext: boolean
  page: number
  pageSize: number
  total: number
}) {
  const unboundedPages = Math.max(1, Math.ceil(total / pageSize))
  const totalPages = Math.min(MAX_PAGE, unboundedPages)
  return {
    canGoNext: hasNext && page < totalPages,
    totalPages,
    wasBounded: unboundedPages > MAX_PAGE,
  }
}

export function pageSummary(
  list: { hasNext: boolean; page: number; pageSize: number; total: number },
  noun: { one: string; other: string },
) {
  const { totalPages } = pageWindow(list)
  return `Page ${list.page} of ${totalPages} · ${list.total} ${list.total === 1 ? noun.one : noun.other}`
}
