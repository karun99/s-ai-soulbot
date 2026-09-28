/**
 * Persona synthesis and lifecycle.
 *
 * A persona is a *claim about a subject*, built from consent-gated evidence.
 * Two properties keep it honest:
 *
 *   - Every identity anchor carries the field paths that ground it. An anchor
 *     with no evidence is not an anchor; `synthesize` drops it and reports it.
 *   - Identity is established by the evidence trail, not by the current
 *     snapshot. A persona that looks identical to its predecessor but whose
 *     trail is broken is not the same subject, and the identity gate says so.
 */

import {
  PersonaModel,
  ValidationIndices,
  type FieldPath,
  type PersonaLifecycle,
  type Trajectory,
} from '../schema/index.js'
import { assessContinuity, type ContinuityResult, type ContinuityLedgerEntry } from '../consent/index.js'

/* -------------------------------------------------------------------------- */
/* Synthesis                                                                   */
/* -------------------------------------------------------------------------- */

export interface SnapshotField {
  path: FieldPath
  value: string
  /** Connector the field arrived from. */
  connector: string
}

export interface AnchorCandidate {
  name: string
  weight: number
  /** Field paths that ground this anchor. */
  evidence: FieldPath[]
}

export interface DomainCandidate {
  name: string
  confidence: number
  evidence: FieldPath[]
}

export interface StyleObservation {
  formality?: number
  directness?: number
  verbosity?: number
}

export interface SynthesisInput {
  personaId: string
  version: string
  snapshotId: string
  name: string
  headline?: string
  anchors: AnchorCandidate[]
  domains: DomainCandidate[]
  style: StyleObservation
  validFrom: string
  validUntil?: string | null
  trajectory: Trajectory
  validation: ValidationIndices
}

export interface SynthesisResult {
  persona: PersonaModel
  /** Anchors dropped for lack of evidence, and why. */
  droppedAnchors: { name: string; reason: string }[]
  /** Domains dropped for lack of evidence. */
  droppedDomains: { name: string; reason: string }[]
  warnings: string[]
}

export function synthesize(input: SynthesisInput): SynthesisResult {
  const droppedAnchors: { name: string; reason: string }[] = []
  const droppedDomains: { name: string; reason: string }[] = []
  const warnings: string[] = []

  const anchors = input.anchors.filter((a) => {
    if (a.evidence.length === 0) {
      droppedAnchors.push({ name: a.name, reason: 'no evidence field paths' })
      return false
    }
    if (a.weight <= 0) {
      droppedAnchors.push({ name: a.name, reason: 'zero weight' })
      return false
    }
    return true
  })

  const domains = input.domains.filter((d) => {
    if (d.evidence.length === 0) {
      droppedDomains.push({ name: d.name, reason: 'no evidence field paths' })
      return false
    }
    if (d.confidence <= 0) {
      droppedDomains.push({ name: d.name, reason: 'zero confidence' })
      return false
    }
    return true
  })

  if (anchors.length === 0) {
    warnings.push('persona has no evidenced identity anchors; it cannot be used for guarded action.')
  }

  const style = {
    formality: clamp01(input.style.formality ?? 0.5),
    directness: clamp01(input.style.directness ?? 0.5),
    verbosity: clamp01(input.style.verbosity ?? 0.5),
  }

  const persona: PersonaModel = {
    persona_id: input.personaId,
    version: input.version,
    lifecycle: 'provisional',
    source_snapshot: input.snapshotId,
    identity: {
      name: input.name,
      headline: input.headline ?? '',
      anchors: anchors.map((a) => ({ name: a.name, weight: clamp01(a.weight), evidence: a.evidence })),
    },
    knowledge_domains: domains.map((d) => ({
      name: d.name,
      confidence: clamp01(d.confidence),
      evidence: d.evidence,
    })),
    communication_style: style,
    temporal_context: {
      valid_from: input.validFrom,
      valid_until: input.validUntil ?? null,
      trajectory: input.trajectory,
    },
    validation: input.validation,
  }

  return { persona, droppedAnchors, droppedDomains, warnings }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

export interface LifecycleInput {
  /** Distinct evidence-backed snapshots behind this persona. */
  snapshotCount: number
  /** Fraction of anchored fields corroborated by a second connector. */
  corroborationRate: number
  /** Whether any guarded action has been completed under it. */
  actedUnderGuard: boolean
  /** Fraction of declared domains with a confidence above 0.6. */
  domainMaturity: number
  validUntil: string | null
  now?: Date
}

/**
 * Derive lifecycle state from evidence, not from age.
 *
 * provisional → warming → ignited → stable, and → expired when the validity
 * window closes. State never moves backwards on its own; a persona that loses
 * corroboration is re-derived as a new version rather than silently downgraded.
 */
export function deriveLifecycle(input: LifecycleInput, now: Date = new Date()): PersonaLifecycle {
  if (input.validUntil && Date.parse(input.validUntil) <= now.getTime()) return 'expired'
  if (input.actedUnderGuard && input.corroborationRate >= 0.8 && input.domainMaturity >= 0.6) return 'stable'
  if (input.actedUnderGuard) return 'ignited'
  if (input.snapshotCount >= 3 && input.corroborationRate >= 0.5) return 'warming'
  return 'provisional'
}

/* -------------------------------------------------------------------------- */
/* Identity continuity gate                                                    */
/* -------------------------------------------------------------------------- */

export type IdentityState = 'same_entity' | 'reconstituted' | 'different_entity' | 'unresolved'

export interface IdentityCheck {
  name: 'continuity' | 'reconstitution' | 'directive'
  status: 'pass' | 'fail' | 'held'
  detail: string
}

export interface IdentityReport {
  identityState: IdentityState
  checks: IdentityCheck[]
  /** How any downstream signal should be read. */
  verdictInterpretation: 'change_signal' | 'new_baseline' | 'held'
  anchorsIntact: number
  anchorsTotal: number
  version: number
  issuedAt: string
  message: string
}

/**
 * The identity continuity gate.
 *
 * The question it answers:
 *
 * > If this persona is the same entity as the previous version, then this signal
 * > is a change. If it is a different entity, then this signal is a new
 * > baseline. Which is it?
 *
 * No psychometric verdict is applied until it has.
 */
export function runIdentityGate(
  previous: PersonaModel | null,
  next: PersonaModel,
  ledger: readonly ContinuityLedgerEntry[],
  directive: { proposedVerdict: string; contradictsAuthorization: boolean } | null,
  now: string = new Date().toISOString(),
): IdentityReport {
  const checks: IdentityCheck[] = []
  const continuity: ContinuityResult = assessContinuity(ledger)

  /* 1 — Continuity: are the anchors still grounded, and is the trail unbroken? */
  const nextAnchors = new Set(next.identity.anchors.map((a) => a.name))
  const prevAnchors = previous ? previous.identity.anchors.map((a) => a.name) : []
  const preservedAnchors = prevAnchors.filter((n) => nextAnchors.has(n))
  const anchorsIntact = preservedAnchors.length
  const anchorsTotal = prevAnchors.length

  const continuityStatus: IdentityCheck['status'] =
    continuity.state === 'unresolved' || continuity.state === 'discontinuous'
      ? 'fail'
      : 'pass'

  checks.push({
    name: 'continuity',
    status: continuityStatus,
    detail:
      anchorsTotal === 0
        ? continuity.message
        : `${anchorsIntact}/${anchorsTotal} anchors preserved. ${continuity.message}`,
  })

  /* 2 — Reconstitution: revoked data restored is a resumption, not a birth. */
  const reconstitution: IdentityCheck =
    continuity.state === 'reconstituted'
      ? { name: 'reconstitution', status: 'pass', detail: 'Restored evidence marks the persona reconstituted, not new.' }
      : { name: 'reconstitution', status: 'pass', detail: 'No revocation in the ledger; nothing to reconstitute.' }
  checks.push(reconstitution)

  /* 3 — Directive: would the proposed verdict invalidate the state needed to read it? */
  const directiveCheck: IdentityCheck = !directive
    ? { name: 'directive', status: 'pass', detail: 'No verdict proposed.' }
    : directive.contradictsAuthorization
      ? {
          name: 'directive',
          status: 'fail',
          detail: `Proposed verdict "${directive.proposedVerdict}" contradicts the subject's current authorization. Self-sabotaging; blocked.`,
        }
      : { name: 'directive', status: 'pass', detail: 'Proposed verdict does not contradict the authorization.' }
  checks.push(directiveCheck)

  const failed = checks.filter((c) => c.status === 'fail')

  let identityState: IdentityState
  if (failed.some((c) => c.name === 'continuity')) {
    identityState = continuity.state === 'reconstituted' ? 'reconstituted' : 'unresolved'
  } else if (previous === null) {
    identityState = 'different_entity'
  } else if (continuity.state === 'reconstituted') {
    identityState = 'reconstituted'
  } else {
    identityState = 'same_entity'
  }

  const verdictInterpretation: IdentityReport['verdictInterpretation'] =
    identityState === 'same_entity'
      ? 'change_signal'
      : identityState === 'unresolved'
        ? 'held'
        : 'new_baseline'

  return {
    identityState,
    checks,
    verdictInterpretation,
    anchorsIntact,
    anchorsTotal,
    version: continuity.version,
    issuedAt: now,
    message:
      verdictInterpretation === 'change_signal'
        ? 'Same entity as the previous version. A signal against it is a change.'
        : verdictInterpretation === 'new_baseline'
          ? 'Evidence was reconstituted or this is a new subject. A signal against it is a new baseline, not a regression.'
          : 'Identity state is unresolved. Any psychometric verdict is held.',
  }
}

/** A persona may not drive guarded action while unresolved or expired. */
export function personaMayAct(persona: PersonaModel, identity: IdentityReport | null): boolean {
  if (persona.lifecycle === 'expired') return false
  if (persona.identity.anchors.length === 0) return false
  if (identity && identity.identityState === 'unresolved') return false
  return true
}

export { PersonaModel, ValidationIndices }
export type { PersonaLifecycle, Trajectory }
