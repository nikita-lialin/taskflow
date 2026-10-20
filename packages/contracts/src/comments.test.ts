import { describe, expect, test } from 'bun:test'

import { commentsQuerySchema, createCommentRequestSchema, updateCommentRequestSchema } from './index'

describe('comment contracts', () => {
  test('trims the body and rejects empty, oversized, and unknown fields', () => {
    expect(createCommentRequestSchema.parse({ body: '  Looks good  ' })).toEqual({ body: 'Looks good' })
    expect(createCommentRequestSchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(createCommentRequestSchema.safeParse({ body: 'x'.repeat(5001) }).success).toBe(false)
    expect(createCommentRequestSchema.safeParse({ body: 'ok', organizationId: 'x' }).success).toBe(false)
    expect(updateCommentRequestSchema.safeParse({}).success).toBe(false)
  })

  test('paginates with defaults and rejects unknown parameters', () => {
    expect(commentsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
    expect(commentsQuerySchema.safeParse({ sort: 'createdAt' }).success).toBe(false)
  })
})
