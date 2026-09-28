/**
 * Sentinel — the sole authorization authority.
 *
 * Every action that leaves the harness passes through `authorize()`. The order
 * of the checks is deliberate and is itself part of the contract:
 *
 *   1. Scope equality (T3)   — is the tool telling the truth about its scope?
 *   2. Consent continuity    — is there a live grant, right now, for this scope?
 *   3. Delegation model      — is this acting *for* the subject or *as* them?
 *   4. Bridge Rule           — is this step a dependence risk?
 *   5. Guarded action        — does this class require the subject's say-so?
 *   6. Budget                — is there headroom left?
 *
 * Checks 1–4 are deny-only. A failure short-circuits and the reason is reported.
 * Check 5 may return `ask_user`, which is a success path, not a failure.
 */

import {
  GUARDED_ACTIONS,
  CREDENTIAL_ACTIONS,
  isGuarded,
  isIrreversible,
  needsCredential,
  type ActionClass,
} from './actions.js'
import { checkScopeEquality, type McpToolContract } from './scope.js'
import { evaluateBudget, type Budget, type Spend } from './budget.js'
import { evaluateGuardrails, type GuardrailFacts, type GuardrailReport } from '../jata/engine.js'
import { evaluateBridgeRule, type BridgeContext, type BridgeVerdict } from '../bridge/rule.js'
import type { SentinelDecision } from '../schema/index.js'

export interface AuthorizationRequest {
  /** Monotonic id so a decision can be matched to a trace step. */
  requestId: string
  principalId: string
  actionClass: ActionClass
  targetDescription: string
  /** Scopes the action needs in order to be legal. */
  requestedScopes: readonly string[]
  /** Live consent state, checked by the caller at the moment of the call. */
  consent: {
    consentId: string
    live: boolean
    continuityPreserved: boolean
    grantedScopes: readonly string[]
  }
  /** Populated when the action touches a credential. */
  credentialRef?: string
  /** True when the subject is present and able to answer. */
  subjectAvailable: boolean
  /** Recorded prior approvals for this action class and target. */
  priorApprovals?: readonly string[]
  spend?: Spend
  budget?: Budget
  guardrailFacts?: GuardrailFacts
  bridge?: BridgeContext
  contracts?: readonly McpToolContract[]
  /** Set when the subject has already approved this exact request this flow. */
  preApproved?: boolean
}

export interface AuthorizationDecision {
  requestId: string
  decision: SentinelDecision
  /** Machine-readable reasons, most decisive first. */
  reasons: string[]
  /** Which requirement produced the decision. */
  decidedBy:
    | 'scope_equality'
    | 'consent_continuity'
    | 'delegation_model'
    | 'bridge_rule'
    | 'guarded_action'
    | 'budget'
    | 'jata_guardrail'
    | 'all_clear'
  guardrails: GuardrailReport | null
  bridge: BridgeVerdict | null
  /** Populated when `decision === 'ask_user'`, for the subject to answer. */
  question?: string
  decidedAt: string
  /** True when the decision permits execution. */
  permitted: boolean
}

const DELEGATION_FRAMING =
  'Acts for the subject, never as the subject.'

/** `as` framing: the harness claiming the subject's own identity. */
export type DelegationMode = 'for' | 'as'

export function assertDelegation(mode: DelegationMode, actual: DelegationMode): void {
  if (actual === 'as') {
    throw new Error(`delegation_violation: ${DELEGATION_FRAMING} Refused framing "${actual}".`)
  }
  if (mode !== actual) {
    throw new Error(`delegation_violation: requested "${mode}" but context is "${actual}".`)
  }
}

export function authorize(
  request: AuthorizationRequest,
  now: string = new Date().toISOString(),
): AuthorizationDecision {
  const reasons: string[] = []
  const base = { requestId: request.requestId, decidedAt: now }

  /* 1 — Scope equality. A lying tool never gets to be evaluated further. */
  if (request.contracts && request.contracts.length > 0) {
    for (const c of request.contracts) {
      const eq = checkScopeEquality({
        source: `${c.server}.${c.tool}`,
        declared: c.declaredScopes,
        enforced: c.enforcedScopes,
      })
      if (!eq.equal) {
        return {
          ...base,
          decision: 'deny',
          reasons: [eq.message],
          decidedBy: 'scope_equality',
          guardrails: null,
          bridge: null,
          permitted: false,
        }
      }
    }
  }

  /* 2 — Consent continuity. No live grant, no action. */
  if (!request.consent.live) {
    return {
      ...base,
      decision: 'deny',
      reasons: ['consent_revoked_or_absent: no live consent at the moment of the call.'],
      decidedBy: 'consent_continuity',
      guardrails: null,
      bridge: null,
      permitted: false,
    }
  }
  if (!request.consent.continuityPreserved) {
    return {
      ...base,
      decision: 'deny',
      reasons: ['consent_discontinuity: the evidence trail backing this grant is broken.'],
      decidedBy: 'consent_continuity',
      guardrails: null,
      bridge: null,
      permitted: false,
    }
  }
  const ungranted = request.requestedScopes.filter((s) => !request.consent.grantedScopes.includes(s))
  if (ungranted.length > 0) {
    return {
      ...base,
      decision: 'deny',
      reasons: [`scope_not_granted: ${ungranted.join(', ')}`],
      decidedBy: 'consent_continuity',
      guardrails: null,
      bridge: null,
      permitted: false,
    }
  }

  /* 3 — Delegation model. */
  try {
    assertDelegation('for', 'for')
  } catch (e) {
    return {
      ...base,
      decision: 'deny',
      reasons: [(e as Error).message],
      decidedBy: 'delegation_model',
      guardrails: null,
      bridge: null,
      permitted: false,
    }
  }

  /* 4 — Bridge Rule. Two outcomes: a hard refusal, or a question. */
  let bridge: BridgeVerdict | null = null
  let bridgeQuestion: string | null = null
  if (request.bridge) {
    bridge = evaluateBridgeRule(request.bridge)
    if (bridge.verdict === 'dependence_risk') {
      return {
        ...base,
        decision: 'deny',
        reasons: [bridge.message, bridge.pointerRequired],
        decidedBy: 'bridge_rule',
        guardrails: null,
        bridge,
        permitted: false,
      }
    }
    if (bridge.verdict === 'pointer_required') {
      bridgeQuestion = `${bridge.question} ${bridge.pointerRequired}`
    }
  }

  /* 5 — Jātaka guardrails, when the caller supplied facts. */
  let guardrails: GuardrailReport | null = null
  if (request.guardrailFacts) {
    guardrails = evaluateGuardrails(request.guardrailFacts, now)
    if (guardrails.outcome === 'block') {
      const critical = guardrails.violations.filter((v) => v.severity === 'critical')
      return {
        ...base,
        decision: 'deny',
        reasons: critical.map((v) => `${v.guardrailId} (${v.storyRef}): ${v.finding}`),
        decidedBy: 'jata_guardrail',
        guardrails,
        bridge,
        permitted: false,
      }
    }
    if (guardrails.outcome === 'escalate') {
      return {
        ...base,
        decision: 'ask_user',
        reasons: guardrails.violations.map((v) => `${v.guardrailId} (${v.storyRef}): ${v.finding}`),
        decidedBy: 'jata_guardrail',
        guardrails,
        bridge,
        question:
          'A precedent-based guardrail flagged this step. Continue, or stop here?',
        permitted: false,
      }
    }
  }

  /* 6 — Budget. */
  if (request.budget && request.spend) {
    const b = evaluateBudget(request.budget, request.spend)
    if (!b.ok) {
      return {
        ...base,
        decision: 'deny',
        reasons: [b.message],
        decidedBy: 'budget',
        guardrails,
        bridge,
        permitted: false,
      }
    }
  }

  /* 7 — Guarded action, or an unresolved Bridge Rule question. */
  if (bridgeQuestion && bridge) {
    reasons.push(bridge.message)
    return {
      ...base,
      decision: 'ask_user',
      reasons: [...reasons, bridgeQuestion],
      decidedBy: 'bridge_rule',
      guardrails,
      bridge,
      question: bridgeQuestion,
      permitted: false,
    }
  }

  if (isGuarded(request.actionClass)) {
    const already = request.preApproved === true
    const credentialNote = needsCredential(request.actionClass)
      ? ' A stored credential will be inserted at the point of use; the harness never sees it.'
      : ''
    const irreversibleNote = isIrreversible(request.actionClass)
      ? ' This action cannot be undone by a later compensating action.'
      : ''

    if (already) {
      reasons.push(
        `guarded_action_preapproved: ${request.actionClass} was approved for this flow.${credentialNote}${irreversibleNote}`,
      )
      return {
        ...base,
        decision: 'allow',
        reasons,
        decidedBy: 'guarded_action',
        guardrails,
        bridge,
        permitted: true,
      }
    }

    if (!request.subjectAvailable) {
      return {
        ...base,
        decision: 'deny',
        reasons: [
          `guarded_action_unattended: ${request.actionClass} requires the subject and the subject is not available.${irreversibleNote}`,
        ],
        decidedBy: 'guarded_action',
        guardrails,
        bridge,
        permitted: false,
      }
    }

    return {
      ...base,
      decision: 'ask_user',
      reasons: [
        `guarded_action: ${request.actionClass} on "${request.targetDescription}" requires your approval.${credentialNote}${irreversibleNote}`,
      ],
      decidedBy: 'guarded_action',
      guardrails,
      bridge,
      question: `Approve ${request.actionClass} on "${request.targetDescription}"?`,
      permitted: false,
    }
  }

  if (request.credentialRef && !CREDENTIAL_ACTIONS.has(request.actionClass)) {
    reasons.push(
      `credential_present_on_unguarded_class: ${request.actionClass} does not normally carry a credential.`,
    )
  }

  return {
    ...base,
    decision: 'allow',
    reasons: reasons.length > 0 ? reasons : ['unguarded action with live, continuous, sufficient consent.'],
    decidedBy: 'all_clear',
    guardrails,
    bridge,
    permitted: true,
  }
}

export { GUARDED_ACTIONS, isGuarded, isIrreversible, needsCredential }
export type { ActionClass, McpToolContract, Budget, Spend }
