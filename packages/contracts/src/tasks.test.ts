import { describe, expect, test } from 'bun:test'

import { createTaskRequestSchema, tasksQuerySchema } from './index'

describe('task contracts', () => {
  test('fills defaults and trims text on create', () => {
    expect(createTaskRequestSchema.parse({ title: '  Fix  ' })).toEqual({
      title: 'Fix',
      status: 'backlog',
      priority: 'medium',
    })
  })

  test('accepts repeated and comma-separated status and priority filters', () => {
    expect(tasksQuerySchema.parse({ status: ['todo', 'done'], priority: 'low,high' })).toMatchObject({
      status: ['todo', 'done'],
      priority: ['low', 'high'],
    })
    expect(tasksQuerySchema.parse({ status: 'todo,done' }).status).toEqual(['todo', 'done'])
    expect(tasksQuerySchema.safeParse({ status: 'todo,finished' }).success).toBe(false)
  })

  test('defaults to newest first and rejects unknown parameters', () => {
    expect(tasksQuerySchema.parse({})).toMatchObject({ sort: 'createdAt', order: 'desc', page: 1, pageSize: 20 })
    expect(tasksQuerySchema.safeParse({ organizationId: 'x' }).success).toBe(false)
  })
})
