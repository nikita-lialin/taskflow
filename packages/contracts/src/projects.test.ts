import { describe, expect, test } from 'bun:test'

import {
  createProjectRequestSchema,
  projectsQuerySchema,
  updateProjectRequestSchema,
} from './index'

describe('project contracts', () => {
  test('trims names and uppercases keys', () => {
    expect(
      createProjectRequestSchema.parse({ name: '  Website  ', key: ' web2 ', description: '  Public site ' }),
    ).toEqual({ name: 'Website', key: 'WEB2', description: 'Public site' })
  })

  test('accepts only 2 to 6 letters or digits that start with a letter', () => {
    for (const key of ['AB', 'A1', 'ABCDEF', 'a1b2c3']) {
      expect(createProjectRequestSchema.safeParse({ name: 'Site', key }).success, key).toBe(true)
    }
    for (const key of ['A', 'ABCDEFG', '1AB', 'A-B', 'A B', 'ÄB', '']) {
      expect(createProjectRequestSchema.safeParse({ name: 'Site', key }).success, key).toBe(false)
    }
  })

  test('limits name and description length and rejects unknown fields', () => {
    const valid = { name: 'Site', key: 'WEB' }
    expect(createProjectRequestSchema.safeParse({ ...valid, name: 'x' }).success).toBe(false)
    expect(createProjectRequestSchema.safeParse({ ...valid, name: 'x'.repeat(81) }).success).toBe(false)
    expect(createProjectRequestSchema.safeParse({ ...valid, description: 'x'.repeat(2001) }).success).toBe(false)
    expect(createProjectRequestSchema.safeParse({ ...valid, description: null }).success).toBe(true)
    expect(createProjectRequestSchema.safeParse({ ...valid, nextTaskNumber: 5 }).success).toBe(false)
  })

  test('accepts any non-empty subset on update and never accepts a key', () => {
    expect(updateProjectRequestSchema.parse({ archived: true })).toEqual({ archived: true })
    expect(updateProjectRequestSchema.parse({ description: null })).toEqual({ description: null })
    expect(updateProjectRequestSchema.safeParse({}).success).toBe(false)
    expect(updateProjectRequestSchema.safeParse({ key: 'NEW' }).success).toBe(false)
    expect(updateProjectRequestSchema.safeParse({ archived: 'yes' }).success).toBe(false)
  })

  test('defaults the list query to active projects on the first page', () => {
    expect(projectsQuerySchema.parse({})).toEqual({ archived: 'false', page: 1, pageSize: 20 })
    expect(projectsQuerySchema.parse({ q: '  ', archived: 'all', page: '2' })).toMatchObject({
      archived: 'all',
      page: 2,
    })
    expect(projectsQuerySchema.safeParse({ archived: 'maybe' }).success).toBe(false)
    expect(projectsQuerySchema.safeParse({ sort: 'name' }).success).toBe(false)
  })
})
