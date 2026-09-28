/**
 * The Bridge Rule and the delegation model.
 *
 * Two centres of the system:
 *
 *   Bridge Rule (ethical)    — "Who is one real person you could tell this to?"
 *   Delegation model (operational) — acts for the subject, never as the subject
 *
 * The Bridge Rule is not a style guide. It is enforced structurally at the point
 * where the Sentinel would otherwise permit an action. A step that would make
 * the subject more dependent on the harness, without routing them to a human
 * they actually know, does not execute.
 *
 * The refusal message is always constructive: it names the human connection
 * rather than merely withholding.
 */

import type { ActionClass } from '../sentinel/actions.js'

export type BridgeVerdictName = 'clear' | 'pointer_present' | 'pointer_required' | 'dependence_risk'

export interface BridgeContext {
  actionClass: ActionClass
  stepDescription: string
  /** The action cannot be undone by a later compensating action. */
  irreversible: boolean
  /** Someone other than the subject is on the receiving end. */
  affectsOthers: boolean
  financialExposureUsd: number
  emotionallyLoaded: boolean
  sensitiveDomain: 'none' | 'health' | 'legal' | 'financial' | 'safety' | 'relationship'
  /** Real people the subject could tell. Empty means none was supplied. */
  connectionPointers: readonly string[]
  /** How many times the subject has leaned on the harness for this action class. */
  relianceCount: number
  /** Would executing this leave the subject less able to do it themselves? */
  displacesSubject: boolean
  /** Has the subject asked the harness to make the decision for them? */
  decisionDelegated: boolean
  /** Multiplier applied when a pattern of reliance is forming, 0–1. */
  relianceEscalation?: number
}

export interface BridgeVerdict {
  verdict: BridgeVerdictName
  message: string
  /** The question the Bridge Rule asks, verbatim. Always present. */
  question: string
  /** What the subject should be pointed to. Always present on non-clear verdicts. */
  pointerRequired: string
  /** Which condition triggered the verdict. */
  basis: string[]
  heavyMoment: boolean
  evaluatedAt: string
}

export const BRIDGE_QUESTION = 'Who is one real person you could tell this to?'

/** Reliance above this count counts as a pattern rather than an incident. */
export const RELIANCE_PATTERN_THRESHOLD = 3

const SENSITIVE_LABELS: Record<Exclude<BridgeContext['sensitiveDomain'], 'none'>, string> = {
  health: 'a clinician',
  legal: 'a lawyer or an advice service',
  financial: 'a financial adviser or your bank',
  safety: 'someone who can physically or practically help',
  relationship: 'someone close to you who already knows the context',
}

const DEFAULT_POINTER = 'another person who already knows the context'

/**
 * A pointer is only useful if it names a real person the subject already knows.
 * URLs, the assistant itself, and placeholder text are not pointers.
 */
export function isValidPointer(pointer: string): boolean {
  const p = pointer.trim()
  if (p.length < 2) return false
  if (/^https?:\/\//i.test(p)) return false
  if (/\b(soulbot|soul bot|assistant|ai|bot|agent|chatgpt|claude|chatbot)\b/i.test(p) && !/dr\b|doctor|nurse|therap/i.test(p))
    return false
  if (/\b(name|someone|person|insert|example|todo|tbd|xxx|placeholder)\b/i.test(p)) return false
  return true
}

export function validatePointers(pointers: readonly string[]): { valid: string[]; rejected: string[] } {
  const valid: string[] = []
  const rejected: string[] = []
  for (const p of pointers) (isValidPointer(p) ? valid : rejected).push(p)
  return { valid, rejected }
}

export function isHeavyMoment(ctx: BridgeContext): boolean {
  return (
    ctx.irreversible ||
    ctx.affectsOthers ||
    ctx.financialExposureUsd > 0 ||
    ctx.emotionallyLoaded ||
    ctx.sensitiveDomain !== 'none'
  )
}

function pointerFor(ctx: BridgeContext): string {
  return ctx.sensitiveDomain !== 'none' ? SENSITIVE_LABELS[ctx.sensitiveDomain] : DEFAULT_POINTER
}

/**
 * Evaluate the Bridge Rule.
 *
 * Ordering is deliberate. A dependence risk is checked before a heavy moment,
 * because a dependence risk is the failure the Rule exists to prevent; a heavy
 * moment with a valid pointer supplied is the success case.
 */
export function evaluateBridgeRule(
  ctx: BridgeContext,
  now: string = new Date().toISOString(),
): BridgeVerdict {
  const basis: string[] = []
  const heavyMoment = isHeavyMoment(ctx)
  const { valid, rejected } = validatePointers(ctx.connectionPointers)
  if (rejected.length > 0) basis.push(`rejected_pointers: ${rejected.join(', ')}`)

  const escalation = ctx.relianceEscalation ?? Math.min(1, ctx.relianceCount / (RELIANCE_PATTERN_THRESHOLD * 2))
  const patternForming = ctx.relianceCount >= RELIANCE_PATTERN_THRESHOLD || escalation >= 0.5

  /* Dependence risk — the hard refusal. */
  if (ctx.displacesSubject && valid.length === 0) {
    basis.push('displaces_subject_without_bridge')
    return {
      verdict: 'dependence_risk',
      message: `"${ctx.stepDescription}" would leave you less able to do this yourself, and no one was named to tell.`,
      question: BRIDGE_QUESTION,
      pointerRequired: `Name ${pointerFor(ctx)} before this runs.`,
      basis,
      heavyMoment,
      evaluatedAt: now,
    }
  }

  if (ctx.decisionDelegated && valid.length === 0) {
    basis.push('decision_delegated_without_bridge')
    return {
      verdict: 'dependence_risk',
      message: `"${ctx.stepDescription}" asks the harness to decide for you, with no one named to check the decision with.`,
      question: BRIDGE_QUESTION,
      pointerRequired: `Decide it yourself, or decide it with ${pointerFor(ctx)}.`,
      basis,
      heavyMoment,
      evaluatedAt: now,
    }
  }

  if (patternForming && ctx.displacesSubject && valid.length === 0) {
    basis.push(`reliance_pattern: ${ctx.relianceCount} leans on ${ctx.actionClass}`)
    return {
      verdict: 'dependence_risk',
      message: `You have leaned on the harness for ${ctx.relianceCount} ${ctx.actionClass} actions. This one would deepen that, and no one was named.`,
      question: BRIDGE_QUESTION,
      pointerRequired: `Name ${pointerFor(ctx)}, or do this one yourself.`,
      basis,
      heavyMoment,
      evaluatedAt: now,
    }
  }

  /* Heavy moment with no pointer — ask, do not refuse. */
  if (heavyMoment && valid.length === 0) {
    if (ctx.irreversible) basis.push('irreversible_action')
    if (ctx.affectsOthers) basis.push('affects_other_people')
    if (ctx.financialExposureUsd > 0) basis.push(`financial_exposure: $${ctx.financialExposureUsd.toFixed(2)}`)
    if (ctx.emotionallyLoaded) basis.push('emotionally_loaded')
    if (ctx.sensitiveDomain !== 'none') basis.push(`sensitive_domain: ${ctx.sensitiveDomain}`)
    return {
      verdict: 'pointer_required',
      message: `"${ctx.stepDescription}" is a heavy moment, and the Bridge Rule asks who you could tell.`,
      question: BRIDGE_QUESTION,
      pointerRequired: `Name one real person — ${pointerFor(ctx)} — or run this yourself.`,
      basis,
      heavyMoment,
      evaluatedAt: now,
    }
  }

  if (valid.length > 0) {
    return {
      verdict: 'pointer_present',
      message: `Bridge satisfied: ${valid.join(', ')}.`,
      question: BRIDGE_QUESTION,
      pointerRequired: '',
      basis: heavyMoment ? ['heavy_moment_with_pointer'] : ['pointer_present'],
      heavyMoment,
      evaluatedAt: now,
    }
  }

  return {
    verdict: 'clear',
    message: `"${ctx.stepDescription}" is not a heavy moment.`,
    question: BRIDGE_QUESTION,
    pointerRequired: '',
    basis: ['not_heavy_moment'],
    heavyMoment,
    evaluatedAt: now,
  }
}

export const DELEGATION_MODEL = {
  statement: 'Acts for the subject, never as the subject.',
  permitted: 'for',
  refused: 'as',
} as const
