import { expect, signUp, test, uniqueEmail } from '../helpers/test'
import {
  boardColumn,
  dragCardToColumn,
  createOrganization,
  createProject,
  createTask,
  organizationIdFromUrl,
  uniqueName,
} from '../helpers/workspace'

test('a new user creates an organization, a project, and a task, moves it, and comments', async ({
  page,
}) => {
  const taskTitle = uniqueName('Ship the release')

  await signUp(page, uniqueEmail('web-e2e-flow'), 'Flow Owner')
  await expect(page).toHaveURL(/\/app$/)

  // First run: no organization yet, so the page offers to create one.
  await expect(page.getByTestId('first-run')).toBeVisible()
  await createOrganization(page, uniqueName('Acme'))
  await expect(page.getByTestId('organization-navigation')).toBeVisible()

  // Without a project no task can be created.
  await expect(page.getByTestId('task-new')).toBeDisabled()
  await createProject(page, uniqueName('Website'), 'WEB')
  await createTask(page, taskTitle)

  const backlog = boardColumn(page, 'backlog')
  await expect(backlog.getByTestId('board-card').filter({ hasText: taskTitle })).toBeVisible()
  await expect(backlog.getByText('WEB-1')).toBeVisible()

  // Drag the card to another column. It moves at once and stays there after a reload.
  await dragCardToColumn(page, backlog.getByTestId('board-card').filter({ hasText: taskTitle }), 'in_progress')
  await expect(
    boardColumn(page, 'in_progress').getByTestId('board-card').filter({ hasText: taskTitle }),
  ).toBeVisible()
  await expect(backlog.getByTestId('board-card')).toHaveCount(0)
  await page.reload()
  await expect(
    boardColumn(page, 'in_progress').getByTestId('board-card').filter({ hasText: taskTitle }),
  ).toBeVisible()

  // Open the task, add a comment, and read it back after a reload.
  await boardColumn(page, 'in_progress').getByTestId('task-link').click()
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/)
  await expect(page.getByTestId('task-title')).toHaveValue(taskTitle)
  await expect(page.getByTestId('task-status')).toHaveValue('in_progress')

  await page.getByTestId('comment-input').fill('First comment from the browser test')
  await page.getByTestId('comment-submit').click()
  const comment = page.getByTestId('comment').filter({ hasText: 'First comment from the browser test' })
  await expect(comment).toBeVisible()

  await page.reload()
  await expect(comment).toBeVisible()

  // The window saves by itself: selects at once, the description when typing stops.
  const saveState = page.getByTestId('task-save-state')
  await page.getByTestId('task-assignee').selectOption({ index: 1 })
  await page.getByTestId('task-priority').selectOption('high')
  await expect(saveState).toHaveAttribute('data-state', 'saved')
  await page.getByTestId('task-description').fill('Written in the browser test')
  await page.getByTestId('task-description').blur()
  await expect(saveState).toHaveAttribute('data-state', 'saved')
  await page.reload()
  await expect(page.getByTestId('task-description')).toHaveValue('Written in the browser test')
  await expect(page.getByTestId('task-priority')).toHaveValue('high')

  // The journal lists the drag, the edits, and the creation, with the person who made them.
  await page.getByTestId('task-tab-activity').click()
  const entries = page.getByTestId('task-activity-entry')
  await expect(entries.filter({ hasText: 'changed the priority from Medium to High' })).toBeVisible()
  await expect(entries.filter({ hasText: 'moved the task from Backlog to In Progress' })).toBeVisible()
  await expect(entries.filter({ hasText: 'changed the description' })).toBeVisible()
  await expect(entries.filter({ hasText: 'created this task' })).toBeVisible()

  // Closing the window returns to the board, and Forward opens it again.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/board$/)
  await expect(page.getByTestId('task-dialog')).toHaveCount(0)
  await page.goForward()
  await expect(page.getByTestId('task-dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId('task-dialog')).toHaveCount(0)

  await page.getByTestId('org-nav-tasks').click()
  await expect(page.getByTestId('task-row').filter({ hasText: taskTitle })).toBeVisible()
  await page.getByTestId('task-search-input').fill('no such task title')
  await page.getByTestId('task-search-submit').click()
  await expect(page.getByTestId('tasks-empty')).toBeVisible()

  await page.getByTestId('org-nav-my-tasks').click()
  await expect(page.getByTestId('task-row').filter({ hasText: taskTitle })).toBeVisible()

  // Deleting asks first, closes the window, and removes the card.
  await page.getByTestId('org-nav-board').click()
  await boardColumn(page, 'in_progress').getByTestId('task-link').click()
  await page.getByTestId('task-delete').click()
  await page.getByTestId('task-delete-confirm').click()
  await expect(page.getByTestId('task-dialog')).toHaveCount(0)
  await expect(page.getByTestId('board-card')).toHaveCount(0)
})

test('a user from another organization cannot reach the first organization', async ({
  browser,
  page,
}) => {
  const taskTitle = uniqueName('Private roadmap')

  await signUp(page, uniqueEmail('web-e2e-owner'), 'Owner')
  await createOrganization(page, uniqueName('Owner Org'))
  await createProject(page, uniqueName('Secret'), 'SEC')
  await createTask(page, taskTitle)
  await boardColumn(page, 'backlog').getByTestId('task-link').click()
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/)
  const taskUrl = new URL(page.url()).pathname
  const organizationUrl = `/app/orgs/${organizationIdFromUrl(page)}`

  const otherContext = await browser.newContext()
  const otherPage = await otherContext.newPage()
  await signUp(otherPage, uniqueEmail('web-e2e-outsider'), 'Outsider')
  await expect(otherPage.getByTestId('first-run')).toBeVisible()

  for (const path of [
    `${organizationUrl}/board`,
    `${organizationUrl}/tasks`,
    `${organizationUrl}/projects`,
    `${organizationUrl}/members`,
    taskUrl,
  ]) {
    await otherPage.goto(path)
    await expect(otherPage.getByTestId('organization-not-found')).toBeVisible()
    await expect(otherPage.getByText(taskTitle)).toHaveCount(0)
  }

  // The outsider's own organization is separate: it lists nothing of the first one.
  await otherPage.goto('/app')
  await createOrganization(otherPage, uniqueName('Outsider Org'))
  await expect(otherPage.getByTestId('organization-switcher')).not.toContainText('Owner Org')
  await otherPage.getByTestId('organization-switcher').click()
  await expect(otherPage.getByTestId('organization-switcher-item')).toHaveCount(1)
  await otherContext.close()
})

test('a member sees only the actions the role allows', async ({ browser, page }) => {
  const memberEmail = uniqueEmail('web-e2e-member')
  const adminTask = uniqueName('Admin task')
  const memberTask = uniqueName('Member task')

  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await signUp(memberPage, memberEmail, 'Team Member')
  await expect(memberPage.getByTestId('first-run')).toBeVisible()

  // The admin adds the registered member by email.
  await signUp(page, uniqueEmail('web-e2e-admin'), 'Team Admin')
  await createOrganization(page, uniqueName('Team'))
  await createProject(page, uniqueName('Platform'), 'PLT')
  await createTask(page, adminTask)
  await page.getByTestId('org-nav-members').click()
  await page.getByTestId('member-email').fill(memberEmail)
  await page.getByTestId('member-add').click()
  await expect(page.getByTestId('member-added')).toBeVisible()
  await expect(page.getByTestId('member-row')).toHaveCount(2)
  await expect(page.getByTestId('member-role-select')).toHaveCount(1)

  // The member opens the organization. Admin-only controls are absent.
  await memberPage.goto('/app')
  await memberPage.getByTestId('organization-item').click()
  await expect(memberPage).toHaveURL(/\/board$/)
  await memberPage.getByTestId('org-nav-projects').click()
  await expect(memberPage.getByTestId('project-row')).toHaveCount(1)
  await expect(memberPage.getByTestId('project-new')).toHaveCount(0)
  await expect(memberPage.getByTestId('project-archive-toggle')).toHaveCount(0)
  await memberPage.getByTestId('org-nav-members').click()
  await expect(memberPage.getByTestId('member-row')).toHaveCount(2)
  await expect(memberPage.getByTestId('member-add')).toHaveCount(0)
  await expect(memberPage.getByTestId('member-role-select')).toHaveCount(0)

  // Someone else's task is read-only for the member, and their own task is editable.
  await memberPage.getByTestId('org-nav-board').click()
  const adminCard = memberPage.getByTestId('board-card').filter({ hasText: adminTask })
  await expect(adminCard).toBeVisible()
  await expect(adminCard.getByTestId('board-card-handle')).toHaveCount(0)
  await adminCard.getByTestId('task-link').click()
  await expect(memberPage.getByTestId('task-title')).toBeDisabled()
  await expect(memberPage.getByTestId('task-delete')).toHaveCount(0)
  // Everyone in the organization can comment.
  await memberPage.getByTestId('comment-input').fill('Question from the member')
  await memberPage.getByTestId('comment-submit').click()
  await expect(memberPage.getByTestId('comment').filter({ hasText: 'Question from the member' })).toBeVisible()

  await memberPage.keyboard.press('Escape')
  await createTask(memberPage, memberTask)
  const ownCard = memberPage.getByTestId('board-card').filter({ hasText: memberTask })
  await expect(ownCard.getByTestId('board-card-handle')).toHaveCount(1)
  await ownCard.getByTestId('task-link').click()
  await expect(memberPage.getByTestId('task-title')).toBeEnabled()
  await expect(memberPage.getByTestId('task-delete')).toHaveCount(1)
  await memberPage.keyboard.press('Escape')

  // The admin can delete the comment of the member, and the member cannot touch the admin's task.
  await page.getByTestId('org-nav-board').click()
  await page.getByTestId('board-card').filter({ hasText: adminTask }).getByTestId('task-link').click()
  const memberComment = page.getByTestId('comment').filter({ hasText: 'Question from the member' })
  await expect(memberComment).toBeVisible()
  await expect(memberComment.getByTestId('comment-edit')).toHaveCount(0)
  await memberComment.getByTestId('comment-delete').click()
  await page.getByTestId('comment-delete-confirm').click()
  await expect(page.getByTestId('comments-empty')).toBeVisible()

  await memberContext.close()
})
