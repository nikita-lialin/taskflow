import { z } from 'zod'

/** The last page a client can request. Deeper pages are not reachable. */
export const MAX_PAGE = 100
export const MAX_PAGE_SIZE = 100

export const positiveIntegerQuerySchema = (defaultValue: number, maximum?: number) =>
  z.coerce.number().int().positive().max(maximum ?? Number.MAX_SAFE_INTEGER).default(defaultValue)

/** Query parameters shared by every paginated list. An empty `q` means no filter. */
export const paginationQueryShape = {
  q: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(100).optional(),
  ),
  page: positiveIntegerQuerySchema(1, MAX_PAGE),
  pageSize: positiveIntegerQuerySchema(20, MAX_PAGE_SIZE),
}

/** Fields that follow `items` in every paginated response. */
export const paginationResponseShape = {
  page: z.number().int().positive().max(MAX_PAGE),
  pageSize: z.number().int().positive().max(MAX_PAGE_SIZE),
  total: z.number().int().nonnegative(),
  hasNext: z.boolean(),
}
