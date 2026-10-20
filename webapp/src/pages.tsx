import { Navigate, Outlet, useLocation, useParams, useRouter, useSearch } from '@tanstack/react-router'
import type { UserDto, UserRole } from '@taskflow/contracts'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  NotFoundSection,
  SessionErrorSection,
  SessionLoadingSection,
} from '@/components/WebRouteSections'
import { WorkspaceShell } from '@/components/WorkspaceShell'
import { AdminDashboard, AdminSettings, AdminUsers } from '@/features/admin'
import {
  AuthPageShell,
  clearPasswordResetTokenHash,
  ForgotPasswordForm,
  LoginForm,
  RegisterForm,
  readPasswordResetToken,
  ResetPasswordForm,
  useAuth,
} from '@/features/auth'
import { homePathForRole, safeReturnPath } from '@/features/navigation'
import {
  MembersPage,
  NewOrganizationPage,
  OrganizationHome,
  OrganizationScope,
} from '@/features/organizations'
import { ProjectsPage } from '@/features/projects'
import { TaskBoard, TaskDetailPage, TaskListPage } from '@/features/tasks'
import { UserProfile, UserSettings } from '@/features/users'

export function HomePage() {
  const auth = useAuth()
  const { returnTo } = useSearch({ from: '/' })

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (auth.user) {
    return (
      <HrefRedirect
        href={safeReturnPath(auth.user.role, returnTo) ?? homePathForRole(auth.user.role)}
      />
    )
  }
  const destination = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/login'
  return <HrefRedirect href={destination} />
}

export function LoginPage() {
  const { returnTo } = useSearch({ from: '/login' })
  return (
    <GuestAuthPage returnTo={returnTo}>
      <AuthPageShell>
        <LoginForm returnTo={returnTo} />
      </AuthPageShell>
    </GuestAuthPage>
  )
}

export function SignupPage() {
  const { returnTo } = useSearch({ from: '/signup' })
  return (
    <GuestAuthPage returnTo={returnTo}>
      <AuthPageShell>
        <RegisterForm returnTo={returnTo} />
      </AuthPageShell>
    </GuestAuthPage>
  )
}

export function ForgotPasswordPage() {
  return (
    <GuestAuthPage>
      <AuthPageShell>
        <ForgotPasswordForm />
      </AuthPageShell>
    </GuestAuthPage>
  )
}

export function ResetPasswordPage() {
  const auth = useAuth()
  const token = usePasswordResetToken()
  if (auth.isBootstrapping) return <SessionLoadingSection />

  return (
    <AuthPageShell>
      <ResetPasswordForm token={token} />
    </AuthPageShell>
  )
}

export function UserHomePage() {
  const user = useWorkspaceUser('user')
  return <OrganizationHome user={user} />
}

export function UserProfilePage() {
  const user = useWorkspaceUser('user')
  return <UserProfile user={user} />
}

export function UserSettingsPage() {
  const auth = useAuth()
  return <UserSettings onLogout={auth.logout} />
}

export function NewOrganizationRoutePage() {
  return <NewOrganizationPage />
}

export function OrganizationIndexPage() {
  const organizationId = useOrganizationParam()
  return (
    <Navigate params={{ organizationId }} replace to="/app/orgs/$organizationId/board" />
  )
}

export function BoardPage() {
  return (
    <OrganizationRoute>
      <TaskBoard />
    </OrganizationRoute>
  )
}

export function TasksPage() {
  return (
    <OrganizationRoute>
      <TaskListPage mode="all" />
    </OrganizationRoute>
  )
}

export function MyTasksPage() {
  return (
    <OrganizationRoute>
      <TaskListPage mode="mine" />
    </OrganizationRoute>
  )
}

export function TaskPage() {
  const { taskId } = useParams({ strict: false })
  return (
    <OrganizationRoute>
      <TaskDetailPage key={taskId} taskId={taskId ?? ''} />
    </OrganizationRoute>
  )
}

export function ProjectsRoutePage() {
  return (
    <OrganizationRoute>
      <ProjectsPage />
    </OrganizationRoute>
  )
}

export function MembersRoutePage() {
  return (
    <OrganizationRoute>
      <MembersPage />
    </OrganizationRoute>
  )
}

export function AdminDashboardPage() {
  return <AdminDashboard />
}

export function AdminUsersPage() {
  const user = useWorkspaceUser('admin')
  return <AdminUsers currentUser={user} />
}

export function AdminSettingsPage() {
  const user = useWorkspaceUser('admin')
  return <AdminSettings user={user} />
}

export function UserWorkspaceLayout() {
  return <WorkspaceRoute role="user" />
}

export function AdminWorkspaceLayout() {
  return <WorkspaceRoute role="admin" />
}

export function NotFoundPage() {
  const auth = useAuth()

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }

  const destination = auth.user ? homePathForRole(auth.user.role) : '/login'
  return <NotFoundSection destination={destination} />
}

function WorkspaceRoute({ role }: { role: UserRole }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (!auth.user) {
    const returnTo = `${location.pathname}${location.searchStr}`
    return <HrefRedirect href={`/login?returnTo=${encodeURIComponent(returnTo)}`} />
  }
  if (auth.user.role !== role) {
    return <HrefRedirect href={homePathForRole(auth.user.role)} />
  }

  return (
    <WorkspaceShell onLogout={auth.logout} user={auth.user}>
      <Outlet />
    </WorkspaceShell>
  )
}

function GuestAuthPage({
  children,
  returnTo,
}: {
  children: ReactNode
  returnTo?: string
}) {
  const auth = useAuth()

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (auth.user) {
    return (
      <HrefRedirect
        href={safeReturnPath(auth.user.role, returnTo) ?? homePathForRole(auth.user.role)}
      />
    )
  }

  return children
}

function useOrganizationParam() {
  const { organizationId } = useParams({ strict: false })
  if (!organizationId) throw new Error('Organization page rendered without an organization id')
  return organizationId
}

// Keyed by organization, so switching organizations never carries filters or drafts across.
function OrganizationRoute({ children }: { children: ReactNode }) {
  const organizationId = useOrganizationParam()
  return (
    <OrganizationScope key={organizationId} organizationId={organizationId}>
      {children}
    </OrganizationScope>
  )
}

function usePasswordResetToken() {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    return readPasswordResetToken(window.location)
  })

  useEffect(() => {
    const captureToken = () => {
      const nextToken = readPasswordResetToken(window.location)
      if (!nextToken) return
      setToken(nextToken)
      clearPasswordResetTokenHash(window.location, window.history)
    }

    captureToken()
    window.addEventListener('hashchange', captureToken)
    return () => window.removeEventListener('hashchange', captureToken)
  }, [])

  return token
}

function useWorkspaceUser(role: UserRole): UserDto {
  const user = useAuth().user
  if (!user || user.role !== role) {
    throw new Error(`${role} workspace page rendered outside its guarded layout`)
  }
  return user
}

function HrefRedirect({ href }: { href: string }) {
  const router = useRouter()
  const hasRedirected = useRef(false)
  useEffect(() => {
    if (hasRedirected.current) return
    hasRedirected.current = true
    router.history.replace(href)
  }, [href, router])
  return null
}
