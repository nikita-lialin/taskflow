import { expect, type Page } from '@playwright/test'

export function uniqueName(prefix: string) {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`
}

/** Creates an organization from the first-run screen or the "new organization" page. */
export async function createOrganization(page: Page, name: string) {
  await page.getByTestId('organization-name').fill(name)
  await page.getByTestId('organization-create').click()
  await expect(page).toHaveURL(/\/app\/orgs\/[^/]+\/board$/)
}

export function organizationIdFromUrl(page: Page) {
  const match = /\/app\/orgs\/([^/]+)/.exec(page.url())
  if (!match?.[1]) throw new Error(`No organization in ${page.url()}`)
  return match[1]
}

/** Creates a project from the projects page of the current organization. */
export async function createProject(page: Page, name: string, key: string) {
  await page.getByTestId('org-nav-projects').click()
  await expect(page).toHaveURL(/\/projects$/)
  await page.getByTestId('project-new').click()
  await page.getByTestId('project-name').fill(name)
  await page.getByTestId('project-key').fill(key)
  await page.getByTestId('project-create-submit').click()
  await expect(page.getByTestId('project-row').filter({ hasText: name })).toBeVisible()
}

/** Creates a task from the board of the current organization. */
export async function createTask(page: Page, title: string) {
  await page.getByTestId('org-nav-board').click()
  await expect(page).toHaveURL(/\/board$/)
  await page.getByTestId('task-new').click()
  await page.getByTestId('task-title').fill(title)
  await page.getByTestId('task-create-submit').click()
  await expect(page.getByTestId('board-card').filter({ hasText: title })).toBeVisible()
}

export function boardColumn(page: Page, status: 'backlog' | 'todo' | 'in_progress' | 'done') {
  return page.locator(`[data-testid="board-column"][data-status="${status}"]`)
}
