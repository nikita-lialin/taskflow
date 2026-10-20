export type OrganizationsFailureKind = 'forbidden' | 'not_found' | 'conflict'

export class OrganizationsFailure extends Error {
  constructor(
    public readonly kind: OrganizationsFailureKind,
    message: string,
  ) {
    super(message)
  }
}

/** One answer for "no such organization" and "not your organization", so ids cannot be probed. */
export function organizationNotFound() {
  return new OrganizationsFailure('not_found', 'Organization not found')
}
