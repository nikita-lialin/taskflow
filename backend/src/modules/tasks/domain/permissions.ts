import type { OrganizationMembership } from '../../organizations'

type TaskOwnership = {
  creatorId: string
  assigneeId: string | null
}

/** Administrators edit every task. Members edit the tasks they created or that are assigned to them. */
export function canEditTask(membership: OrganizationMembership, callerId: string, task: TaskOwnership) {
  return membership.role === 'admin' || task.creatorId === callerId || task.assigneeId === callerId
}

/** Administrators delete every task. Members delete only the tasks they created. */
export function canDeleteTask(membership: OrganizationMembership, callerId: string, task: TaskOwnership) {
  return membership.role === 'admin' || task.creatorId === callerId
}
