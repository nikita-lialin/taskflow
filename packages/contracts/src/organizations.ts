import { z } from 'zod'

import { emailSchema } from './auth'

export const organizationRoleSchema = z.enum(['admin', 'member'])

export const organizationParamsSchema = z
  .object({
    organizationId: z.uuid(),
  })
  .strict()

export const organizationMemberParamsSchema = organizationParamsSchema
  .extend({
    userId: z.uuid(),
  })
  .strict()

export const createOrganizationRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
  })
  .strict()

/** An organization as one of its members sees it: `role` is the caller's own role. */
export const organizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: organizationRoleSchema,
    createdAt: z.string().datetime(),
  })
  .strict()

export const organizationResponseSchema = z.object({ organization: organizationSchema }).strict()

export const organizationsResponseSchema = z
  .object({ items: z.array(organizationSchema) })
  .strict()

export const organizationMemberSchema = z
  .object({
    userId: z.string(),
    email: emailSchema,
    displayName: z.string().nullable(),
    role: organizationRoleSchema,
    joinedAt: z.string().datetime(),
  })
  .strict()

export const organizationMemberResponseSchema = z
  .object({ member: organizationMemberSchema })
  .strict()

export const organizationMembersResponseSchema = z
  .object({ items: z.array(organizationMemberSchema) })
  .strict()

/** Adds an already registered user. Email invitations for unregistered people come later. */
export const addOrganizationMemberRequestSchema = z
  .object({
    email: emailSchema,
    role: organizationRoleSchema.default('member'),
  })
  .strict()

export const updateOrganizationMemberRoleRequestSchema = z
  .object({
    role: organizationRoleSchema,
  })
  .strict()

export type OrganizationRole = z.infer<typeof organizationRoleSchema>
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>
export type OrganizationDto = z.infer<typeof organizationSchema>
export type OrganizationMemberDto = z.infer<typeof organizationMemberSchema>
export type AddOrganizationMemberRequest = z.infer<typeof addOrganizationMemberRequestSchema>
export type UpdateOrganizationMemberRoleRequest = z.infer<
  typeof updateOrganizationMemberRoleRequestSchema
>
