/**
 * Consent — the authorization substrate.
 *
 * Consent here is a live object, not a receipt. The distinction is the whole
 * point: a grant made last month is not a grant now. Every action re-reads
 * consent at the moment of the call, and a revocation that lands mid-flow must
 * reach every active connector and every derived persona.
 *
 * Invariant IV-1: no connector action without a live consent check.
 */

import type { ConsentObject, ScopeGrant, ScopeName } from '../schema/index.js'

/** Revocation must propagate within this window (FR-005, PR-006). */
export const REVOCATION_PROPAGATION_MS = 60_000

export interface ScopeState {
  granted: boolean
  purposes: string[]
  reason?: string
}

export interface ConnectorState {
  connector: string
  status: 'active' | 'disabled' | 'revoked'
  scopes: Record<string, ScopeState>
}

export interface ConsentState {
  consentId: string
  subjectId: string
  /** null means no expiry. */
  expiresAt: string | null
  revocable: boolean
  connectors: ConnectorState[]
  auditLog: string
  revocationWebhook: string
  grantedAt: string
}

export type ConsentProblem =
  | 'no_consent'
  | 'consent_expired'
  | 'connector_revoked'
  | 'connector_disabled'
  | 'scope_not_granted'
  | 'purpose_not_declared'

export interface ConsentCheck {
  ok: boolean
  problems: ConsentProblem[]
  /** Safe to use for the authorization call. */
  live: boolean
  continuityPreserved: boolean
  grantedScopes: ScopeName[]
  missingScopes: ScopeName[]
  message: string
}

function toState(consent: ConsentObject): ConsentState {
  return {
    consentId: consent.consent_id,
    subjectId: consent.subject_id,
    expiresAt: consent.expires_at,
    revocable: consent.revocable,
    grantedAt: consent.granted_at,
    auditLog: consent.audit_log,
    revocationWebhook: consent.revocation_webhook,
    connectors: consent.connectors.map((c) => ({
      connector: c.connector,
      status: c.status,
      scopes: Object.fromEntries(
        Object.entries(c.scopes).map(([k, v]: [string, ScopeGrant]) => [
          k,
          v.granted
            ? { granted: true, purposes: v.purpose }
            : { granted: false, purposes: [], reason: v.reason },
        ]),
      ),
    })),
  }
}

export function fromConsentObject(consent: ConsentObject): ConsentState {
  return toState(consent)
}

export interface ConsentQuery {
  connector: string
  requiredScopes: readonly ScopeName[]
  /** The purpose the action serves. Must be declared for every scope. */
  purpose: string
}

/**
 * Check consent for a single action, at this instant.
 *
 * `continuityPreserved` is tracked separately from `live` because they fail
 * differently: a revoked grant is not live, while a broken evidence trail
 * leaves a grant technically present but no longer attributable. The Sentinel
 * treats both as refusals, and reports them differently.
 */
export function checkConsent(state: ConsentState, query: ConsentQuery, now: Date = new Date()): ConsentCheck {
  const problems: ConsentProblem[] = []

  if (state.expiresAt && Date.parse(state.expiresAt) <= now.getTime()) problems.push('consent_expired')

  const connector = state.connectors.find((c) => c.connector === query.connector)
  if (!connector) {
    problems.push('no_consent')
    return {
      ok: false,
      problems,
      live: false,
      continuityPreserved: false,
      grantedScopes: [],
      missingScopes: [...query.requiredScopes],
      message: `No consent record for connector "${query.connector}".`,
    }
  }

  if (connector.status === 'revoked') problems.push('connector_revoked')
  if (connector.status === 'disabled') problems.push('connector_disabled')

  const grantedScopes: ScopeName[] = []
  const missingScopes: ScopeName[] = []

  for (const scope of query.requiredScopes) {
    const entry = connector.scopes[scope]
    if (!entry || !entry.granted) {
      missingScopes.push(scope)
      continue
    }
    grantedScopes.push(scope)
    if (!entry.purposes.includes(query.purpose)) problems.push('purpose_not_declared')
  }

  if (missingScopes.length > 0) problems.push('scope_not_granted')

  /* A scope granted for one purpose is not a grant for every purpose. An
   * undeclared purpose is an unauthorized use, not a documentation gap, so it
   * fails here rather than being left for a downstream caller to notice. */
  const live =
    !problems.includes('consent_expired') &&
    !problems.includes('connector_revoked') &&
    !problems.includes('connector_disabled') &&
    !problems.includes('purpose_not_declared') &&
    missingScopes.length === 0

  /* Continuity is the consent object's own integrity, independent of scope. */
  const continuityPreserved = state.revocable === true && problems.length === 0

  return {
    ok: live,
    problems: [...new Set(problems)],
    live,
    continuityPreserved,
    grantedScopes,
    missingScopes,
    message: live
      ? `Consent live for ${query.connector} (${grantedScopes.length} scope(s)).`
      : `Consent not satisfied for ${query.connector}: ${[...new Set(problems)].join(', ')}.`,
  }
}

/* -------------------------------------------------------------------------- */
/* Revocation                                                                  */
/* -------------------------------------------------------------------------- */

export interface RevocationTarget {
  kind: 'connector' | 'scope' | 'all'
  /** Connector name when kind === 'connector'; scope name when kind === 'scope'. */
  name?: string
  /** Purposes to clear on a scope revocation. Omit or empty to clear all. */
  purposes?: string[]
}

export interface RevocationResult {
  state: ConsentState
  /** What was changed, for the audit log. */
  changes: string[]
  /** Personas built from data covered by the revocation. */
  invalidatedPersonas: string[]
  propagationMs: number
  withinWindow: boolean
  revokedAt: string
}

/**
 * Revoke consent and report what must be invalidated.
 *
 * Revocation is a propagation problem, not a local one. The result names the
 * personas that must be marked expired so the caller can act on them; this
 * function does not reach out and mutate them, because consent state must not
 * depend on the availability of the persona store.
 */
export function revoke(
  state: ConsentState,
  target: RevocationTarget,
  derivedPersonas: readonly { personaId: string; connectors: string[]; scopes: string[] }[] = [],
  now: string = new Date().toISOString(),
): RevocationResult {
  const started = Date.parse(now)
  const changes: string[] = []
  const connectors = state.connectors.map((c) => ({ ...c, scopes: { ...c.scopes } }))

  if (target.kind === 'all') {
    for (const c of connectors) {
      if (c.status !== 'revoked') {
        c.status = 'revoked'
        changes.push(`revoked all consent for connector ${c.connector}`)
      }
    }
  } else if (target.kind === 'connector' && target.name) {
    const c = connectors.find((x) => x.connector === target.name)
    if (c) {
      c.status = 'revoked'
      changes.push(`revoked connector ${c.connector}`)
    } else {
      changes.push(`connector ${target.name} not present; nothing to revoke`)
    }
  } else if (target.kind === 'scope' && target.name) {
    const purposes = target.purposes ?? []
    for (const c of connectors) {
      const entry = c.scopes[target.name]
      if (!entry?.granted) continue
      if (purposes.length > 0) {
        const before = entry.purposes.length
        entry.purposes = entry.purposes.filter((p) => !purposes.includes(p))
        for (const p of purposes) {
          if (entry.purposes.length < before || before > 0)
            changes.push(`revoked ${target.name}:${p} on ${c.connector}`)
        }
        if (entry.purposes.length === 0) {
          entry.granted = false
          entry.reason = 'revoked_by_subject'
        }
      } else {
        entry.granted = false
        entry.purposes = []
        entry.reason = 'revoked_by_subject'
        changes.push(`revoked ${target.name} on ${c.connector}`)
      }
    }
  }

  const affected = new Set<string>()
  for (const c of connectors) {
    if (c.status !== 'revoked') continue
    for (const p of derivedPersonas) {
      if (p.connectors.includes(c.connector)) affected.add(p.personaId)
    }
  }

  const propagationMs = Date.now() - started
  const next: ConsentState = { ...state, connectors, revocable: true }

  return {
    state: next,
    changes,
    invalidatedPersonas: [...affected].sort(),
    propagationMs,
    withinWindow: propagationMs <= REVOCATION_PROPAGATION_MS,
    revokedAt: now,
  }
}

/**
 * Consent continuity: has the evidence trail behind a grant stayed unbroken?
 *
 * Two failure modes are distinguished. A grant that was revoked and then
 * re-granted is *reconstituted* — the same grant, resumed. A grant whose
 * underlying source was invalidated without a new consent event is
 * *discontinuous* — there is no attributable evidence behind it, and the
 * Sentinel refuses.
 */
export interface ContinuityLedgerEntry {
  consentId: string
  version: number
  event: 'granted' | 'revoked' | 'regranted' | 'evidence_invalidated' | 'evidence_restored'
  at: string
  note?: string
}

export type ContinuityState = 'intact' | 'reconstituted' | 'discontinuous' | 'unresolved'

export interface ContinuityResult {
  state: ContinuityState
  version: number
  /** A new baseline, not a change against a prior one. */
  isNewBaseline: boolean
  findings: string[]
  message: string
}

/**
 * Replay the ledger to determine continuity.
 *
 * A `evidence_invalidated` event with no following `evidence_restored` leaves the
 * trail discontinuous. `unresolved` means the ledger itself is malformed —
 * events out of order, or a re-grant with no prior revoke — and the caller must
 * not interpret any signal derived from it.
 */
export function assessContinuity(ledger: readonly ContinuityLedgerEntry[]): ContinuityResult {
  const findings: string[] = []
  if (ledger.length === 0) {
    return {
      state: 'unresolved',
      version: 0,
      isNewBaseline: true,
      findings: ['empty_ledger'],
      message: 'No consent ledger. Identity state is unresolved; hold any derived verdict.',
    }
  }

  let state: ContinuityState = 'intact'
  let version = 0
  let sawInvalidation = false
  let sawRestoreAfter = false
  let lastTime = -Infinity
  let regrantWithoutRevoke = false
  let live = false

  for (const e of ledger) {
    const t = Date.parse(e.at)
    if (Number.isNaN(t)) {
      findings.push(`unparseable timestamp on ${e.event} at version ${e.version}`)
      continue
    }
    if (t < lastTime) findings.push(`out-of-order event ${e.event} at version ${e.version}`)
    lastTime = t
    version = Math.max(version, e.version)

    switch (e.event) {
      case 'granted':
        if (live) regrantWithoutRevoke = true
        live = true
        break
      case 'revoked':
        live = false
        break
      case 'regranted':
        live = true
        break
      case 'evidence_invalidated':
        sawInvalidation = true
        sawRestoreAfter = false
        break
      case 'evidence_restored':
        if (sawInvalidation) sawRestoreAfter = true
        break
    }
  }

  if (regrantWithoutRevoke) {
    findings.push('regrant_without_prior_revoke')
    state = 'unresolved'
  } else if (sawInvalidation && !sawRestoreAfter) {
    state = 'discontinuous'
    findings.push('evidence_invalidated_without_restore')
  } else if (sawInvalidation && sawRestoreAfter) {
    state = 'reconstituted'
    findings.push('evidence_invalidated_then_restored')
  } else if (!live) {
    state = 'discontinuous'
    findings.push('last_event_is_revocation')
  }

  const isNewBaseline = state === 'reconstituted' || state === 'unresolved'

  const message =
    state === 'intact'
      ? `Continuity intact at version ${version}.`
      : state === 'reconstituted'
        ? `Continuity reconstituted at version ${version}. Derived signals are a new baseline, not a change.`
        : state === 'discontinuous'
          ? `Continuity broken at version ${version}. Hold any derived verdict.`
          : `Continuity unresolved at version ${version}: ${findings.join(', ')}.`

  return { state, version, isNewBaseline, findings, message }
}
