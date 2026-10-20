import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'

import { RootLayout } from './root-layout'

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: lazyRouteComponent(() => import('./pages'), 'NotFoundPage'),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages'), 'HomePage'),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: returnToSearch,
  component: lazyRouteComponent(() => import('./pages'), 'LoginPage'),
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  validateSearch: returnToSearch,
  component: lazyRouteComponent(() => import('./pages'), 'SignupPage'),
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: lazyRouteComponent(() => import('./pages'), 'ForgotPasswordPage'),
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: lazyRouteComponent(() => import('./pages'), 'ResetPasswordPage'),
})

const userWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'userWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'UserWorkspaceLayout'),
})

const userHomeRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app',
  component: lazyRouteComponent(() => import('./pages'), 'UserHomePage'),
})

const userProfileRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/profile',
  component: lazyRouteComponent(() => import('./pages'), 'UserProfilePage'),
})

const userSettingsRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/settings',
  component: lazyRouteComponent(() => import('./pages'), 'UserSettingsPage'),
})

const newOrganizationRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/organizations/new',
  component: lazyRouteComponent(() => import('./pages'), 'NewOrganizationRoutePage'),
})

const organizationRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/orgs/$organizationId',
  component: lazyRouteComponent(() => import('./pages'), 'OrganizationIndexPage'),
})

const boardRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/orgs/$organizationId/board',
  component: lazyRouteComponent(() => import('./pages'), 'BoardPage'),
})

const tasksRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/orgs/$organizationId/tasks',
  component: lazyRouteComponent(() => import('./pages'), 'TasksPage'),
})

const taskRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/orgs/$organizationId/tasks/$taskId',
  component: lazyRouteComponent(() => import('./pages'), 'TaskPage'),
})

const myTasksRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/orgs/$organizationId/my-tasks',
  component: lazyRouteComponent(() => import('./pages'), 'MyTasksPage'),
})

const projectsRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/orgs/$organizationId/projects',
  component: lazyRouteComponent(() => import('./pages'), 'ProjectsRoutePage'),
})

const membersRoute = createRoute({
  getParentRoute: () => userWorkspaceRoute,
  path: '/app/orgs/$organizationId/members',
  component: lazyRouteComponent(() => import('./pages'), 'MembersRoutePage'),
})

const adminWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'adminWorkspace',
  component: lazyRouteComponent(() => import('./pages'), 'AdminWorkspaceLayout'),
})

const adminDashboardRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin',
  component: lazyRouteComponent(() => import('./pages'), 'AdminDashboardPage'),
})

const adminUsersRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/users',
  component: lazyRouteComponent(() => import('./pages'), 'AdminUsersPage'),
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminWorkspaceRoute,
  path: '/admin/settings',
  component: lazyRouteComponent(() => import('./pages'), 'AdminSettingsPage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  signupRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  userWorkspaceRoute.addChildren([
    userHomeRoute,
    userProfileRoute,
    userSettingsRoute,
    newOrganizationRoute,
    organizationRoute,
    boardRoute,
    tasksRoute,
    taskRoute,
    myTasksRoute,
    projectsRoute,
    membersRoute,
  ]),
  adminWorkspaceRoute.addChildren([
    adminDashboardRoute,
    adminUsersRoute,
    adminSettingsRoute,
  ]),
])

export const router = createRouter({ routeTree })

function returnToSearch(search: Record<string, unknown>) {
  return {
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
