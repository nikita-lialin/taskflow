/** A readable URL name. The suffix keeps equal names apart, so the unique index never rejects one. */
export function createSlug(name: string, suffix: string) {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return base ? `${base}-${suffix}` : `org-${suffix}`
}
