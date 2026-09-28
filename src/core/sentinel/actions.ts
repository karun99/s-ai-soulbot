/**
 * Action classification.
 *
 * Every browser operation is mapped to an action class, and action classes are
 * mapped to a policy. The Sentinel is the sole authority that may convert a
 * class into a decision; nothing downstream of it may widen its own scope.
 */

export const ACTION_CLASSES = [
  'read',
  'navigate',
  'scroll',
  'wait',
  'search',
  'click',
  'fill',
  'select',
  'submit_form',
  'send_message',
  'upload',
  'pay',
  'purchase',
  'delete',
  'publish',
  'change_settings',
  'grant_access',
  'transfer_funds',
  'close_account',
] as const

export type ActionClass = (typeof ACTION_CLASSES)[number]

export const OPERATION_TO_CLASS: Record<string, ActionClass> = {
  navigate: 'navigate',
  click: 'click',
  fill: 'fill',
  select: 'select',
  scroll: 'scroll',
  wait: 'wait',
  done: 'read',
  escalate: 'read',
  blocked: 'read',
}

/**
 * Guarded actions per Appendix A: submit, pay, upload, message — plus the
 * destructive and access-granting classes, which carry the same weight.
 */
export const GUARDED_ACTIONS: ReadonlySet<ActionClass> = new Set<ActionClass>([
  'submit_form',
  'send_message',
  'upload',
  'pay',
  'purchase',
  'delete',
  'publish',
  'change_settings',
  'grant_access',
  'transfer_funds',
  'close_account',
])

/** Actions that cannot be undone by a later compensating action. */
export const IRREVERSIBLE_ACTIONS: ReadonlySet<ActionClass> = new Set<ActionClass>([
  'pay',
  'purchase',
  'transfer_funds',
  'delete',
  'publish',
  'send_message',
  'close_account',
  'grant_access',
])

/** Actions that require a credential to be inserted at the point of use. */
export const CREDENTIAL_ACTIONS: ReadonlySet<ActionClass> = new Set<ActionClass>([
  'pay',
  'purchase',
  'transfer_funds',
  'grant_access',
  'close_account',
])

export function isGuarded(action: ActionClass): boolean {
  return GUARDED_ACTIONS.has(action)
}

export function isIrreversible(action: ActionClass): boolean {
  return IRREVERSIBLE_ACTIONS.has(action)
}

export function needsCredential(action: ActionClass): boolean {
  return CREDENTIAL_ACTIONS.has(action)
}

export function classOf(operation: string): ActionClass | undefined {
  return OPERATION_TO_CLASS[operation]
}
