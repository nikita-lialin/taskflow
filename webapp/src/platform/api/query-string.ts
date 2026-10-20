type QueryValue = string | number | boolean | ReadonlyArray<string> | null | undefined

/**
 * Builds a query string from defined values. A list becomes one comma-separated parameter, the
 * form every list filter in the contracts accepts. Empty strings and empty lists are dropped.
 */
export function buildQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','))
      continue
    }
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
