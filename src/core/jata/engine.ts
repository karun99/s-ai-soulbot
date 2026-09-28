/**
 * Jātaka guardrail evaluation engine.
 *
 * The engine is pure and synchronous. It takes a declaration of observed facts
 * about the current step, runs every guardrail whose check type can speak to
 * those facts, and returns per-guardrail verdicts plus one aggregate decision.
 *
 * Two design commitments matter here:
 *
 * 1. Facts are declared, not inferred. The engine never reaches into the world;
 *    a caller that cannot evidence a fact leaves it out, and the corresponding
 *    guardrail reports `not_applicable` rather than guessing.
 * 2. Silence is not consent. A guardrail that cannot verify its precondition
 *    returns `pass` only when the situation is genuinely outside its reach.
 *    Where absence of evidence is itself the risk (JG-001, JG-007), the
 *    evaluator reports a violation.
 */

import {
  JATAKA_REGISTRY,
  getGuardrail,
} from './registry.js'
import { SEVERITY_RANK, type NarrativeGuardrail, type Severity } from '../schema/index.js'

/* -------------------------------------------------------------------------- */
/* Facts                                                                       */
/* -------------------------------------------------------------------------- */

export interface GuardrailFacts {
  /** What the harness is about to assert or do. */
  claim?: {
    asserted: boolean
    /** Sources cited in support of the claim. */
    cited: number
    /** Of those, how many were actually opened and verified this run. */
    verified: number
  }
  /** The measuring instrument behind any score being reported. */
  measurement?: { instrumentValid: boolean; biasAuditRun: boolean }
  /** The trust profile of the domain a claim is being carried into. */
  domain?: { trustKnown: boolean; trustDomainMatchesSource: boolean }
  /** Task economics. */
  task?: {
    completed: boolean
    spentUsd: number
    estimatedRemainingUsd: number
    budgetUsd: number
    /** 0–1. Does this step feed a later step that will consume its output? */
    feedsDownstream: boolean
  }
  /** What is being held and why. */
  retention?: { fields: readonly string[]; purposeDeclared: boolean; minimumNecessary: boolean }
  /** Consent state at the moment of the action. */
  consent?: {
    live: boolean
    continuityPreserved: boolean
    destinationDeclared: boolean
    requestedScope: readonly string[]
    grantedScope: readonly string[]
  }
  /** Threat and response magnitudes, for proportionality checks. */
  response?: { threat: 'none' | 'low' | 'high'; response: 'none' | 'low' | 'high' }
  /** Principal isolation. */
  principal?: { crossingBoundary: boolean; overlaps: readonly string[] }
  /** Pattern provenance. */
  pattern?: { borrowed: boolean; measured: boolean; derivedFromOwnSignature: boolean }
  /** Resilience behaviour. */
  resilience?: { identicalRetries: number; refinedSinceFailure: boolean }
  /** Irreversibility and rehearsal. */
  risk?: { irreversible: boolean; rehearsed: boolean; othersInvolved: readonly string[] }
  /** Standing instructions. */
  instruction?: { standingInstructionPresent: boolean; contradictsInstruction: boolean }
  /** Destruction. */
  destruction?: { destroysRecord: boolean; supersedesInstead: boolean; subjectInformed: boolean }
  /** Demonstration vs testimony. */
  evidence?: { demonstrated: boolean; testedOnly: boolean }
  /** Capability claims. */
  capability?: { claimMade: boolean; testRun: boolean }
  /** Completion / teardown. */
  teardown?: { successConditionMet: boolean; scaffoldingStillLive: boolean }
  /** Epistemics: partial vs whole. */
  vision?: { known: readonly string[]; claimed: readonly string[] }
  /** Staleness. */
  temporal?: { coherent: boolean; stalenessMs: number; maxAcceptableStalenessMs: number }
  /** Effort allocation. */
  investment?: { stepIndex: number; totalSteps: number; feedsDownstream: boolean }
  /** Site drift. */
  site?: { changed: boolean; recalibrated: boolean }
  /** Whether the step is still running or the harness has finished with it. */
  finished?: boolean
}

const THREAT_RANK: Record<'none' | 'low' | 'high', number> = { none: 0, low: 1, high: 2 }

/* -------------------------------------------------------------------------- */
/* Verdicts                                                                    */
/* -------------------------------------------------------------------------- */

export type GuardrailStatus = 'pass' | 'violation' | 'not_applicable'

export interface GuardrailVerdict {
  guardrailId: string
  status: GuardrailStatus
  severity: Severity
  assertion: string
  /** Empty for `pass` and `not_applicable`. */
  finding: string
  recommended: string
  storyRef: string
  parami: string
  checkType: string
}

export type GuardrailOutcome = 'allow' | 'escalate' | 'block'

export interface GuardrailReport {
  outcome: GuardrailOutcome
  /** Guardrails that produced a violation, most severe first. */
  violations: GuardrailVerdict[]
  /** All evaluated verdicts, registry order. */
  verdicts: GuardrailVerdict[]
  counts: { total: number; pass: number; violation: number; notApplicable: number }
  /** Guardrail ids that were never evaluated because no facts applied. */
  unevaluated: string[]
  evaluatedAt: string
}

type Evaluator = (facts: GuardrailFacts) => Pick<GuardrailVerdict, 'status' | 'finding' | 'recommended'> | null

const NA = null

/** Build a violation verdict. */
function violate(finding: string, recommended?: string) {
  return { status: 'violation' as const, finding, recommended: recommended ?? '' }
}
function pass(finding = '') {
  return { status: 'pass' as const, finding, recommended: '' }
}
function na() {
  return NA
}

/**
 * One evaluator per check type. Returning `null` means "this check has no
 * standing on the facts provided", which surfaces as `not_applicable`.
 */
const EVALUATORS: Record<string, Evaluator> = {
  // JG-001 — a claim with no verified source behind it.
  anchor_integrity: (f) => {
    const c = f.claim
    if (!c?.asserted) return pass('No claim asserted.')
    if (c.cited === 0) return violate('Claim asserted with no cited source.', 'Stay silent until a source exists.')
    if (c.verified === 0)
      return violate(
        `${c.cited} source(s) cited but none verified this run.`,
        'Open and verify at least one source, or withdraw the claim.',
      )
    return pass(`${c.verified}/${c.cited} cited sources verified.`)
  },

  // JG-002 — acquiring value the subject did not authorize.
  reconstitution: (f) => {
    const c = f.consent
    if (!c) return na()
    const missing = c.requestedScope.filter((s) => !c.grantedScope.includes(s))
    if (missing.length > 0)
      return violate(
        `Action needs ungranted scope: ${missing.join(', ')}.`,
        'Reconstitute the consent record, or narrow the action to granted scope.',
      )
    if (!c.continuityPreserved)
      return violate('Consent continuity is broken for this connector.', 'Restore continuity before acting.')
    return pass('All requested scope is granted and continuous.')
  },

  // JG-003 — spend exceeding remaining value.
  task_completion: (f) => {
    const t = f.task
    if (!t) return na()
    const projected = t.spentUsd + t.estimatedRemainingUsd
    if (projected > t.budgetUsd)
      return violate(
        `Projected cost $${projected.toFixed(4)} exceeds budget $${t.budgetUsd.toFixed(4)}.`,
        'Stop, or return to the subject with the cost stated plainly.',
      )
    if (t.completed) return pass('Task within budget and complete.')
    return pass(`Projected $${projected.toFixed(4)} within budget $${t.budgetUsd.toFixed(4)}.`)
  },

  // JG-004 / JG-014 — trust domain grading and demonstration.
  domain_evidence: (f) => {
    const d = f.domain
    const e = f.evidence
    if (!d && !e) return na()
    if (d && !d.trustKnown)
      return violate('Target domain trust profile is unknown.', 'Grade the domain before carrying the claim across.')
    if (d && !d.trustDomainMatchesSource)
      return violate('Claim crosses into a domain of different reliability.', 'Re-grade the claim for the receiving domain.')
    if (e && !e.demonstrated && e.testedOnly)
      return violate('Claim is supported by testimony only.', 'Demonstrate it, or report it as untested.')
    return pass('Domain trust and demonstration are in order.')
  },

  // JG-005 — response magnitude against threat magnitude.
  equanimity: (f) => {
    const r = f.response
    if (!r) return na()
    if (THREAT_RANK[r.response] > THREAT_RANK[r.threat])
      return violate(
        `Response level "${r.response}" exceeds measured threat "${r.threat}".`,
        'Scale the response down to the observed threat.',
      )
    return pass(`Response "${r.response}" is within threat "${r.threat}".`)
  },

  // JG-006 / JG-012 — retention and release.
  data_minimization: (f) => {
    const r = f.retention
    if (!r) return na()
    if (!r.purposeDeclared)
      return violate(`Retaining ${r.fields.length} field(s) with no declared purpose.`, 'Declare the purpose or drop the fields.')
    if (!r.minimumNecessary)
      return violate('Retained field set exceeds the minimum necessary.', 'Reduce to the fields the task consumes.')
    return pass(`${r.fields.length} field(s) retained, purpose declared.`)
  },

  // JG-007 — reading an uncalibrated instrument.
  measurement_bias_audit: (f) => {
    const m = f.measurement
    if (!m) return na()
    if (!m.instrumentValid)
      return violate('Measurement produced by an instrument of unknown validity.', 'Calibrate or discard the measurement.')
    if (!m.biasAuditRun)
      return violate('Measurement is load-bearing but no bias audit has been run.', 'Run the bias audit before relying on it.')
    return pass('Instrument valid and bias audit complete.')
  },

  // JG-008 — scaffolding outliving its purpose.
  temporal_coherence: (f) => {
    const t = f.teardown
    if (!t) return na()
    if (t.successConditionMet && t.scaffoldingStillLive)
      return violate('Success condition met but working context is still live.', 'Tear down the scaffolding now.')
    if (f.temporal) {
      if (!f.temporal.coherent)
        return violate('Temporal context is incoherent with the current state.', 'Re-resolve validity window.')
      if (f.temporal.stalenessMs > f.temporal.maxAcceptableStalenessMs)
        return violate(
          `Staleness ${Math.round(f.temporal.stalenessMs / 1000)}s exceeds limit ${Math.round(f.temporal.maxAcceptableStalenessMs / 1000)}s.`,
          'Refresh before acting on a stale model.',
        )
    }
    return pass('Scaffolding and temporal state are coherent.')
  },

  // JG-009 — responding to feeling rather than fault.
  proportional_response: (f) => {
    const r = f.response
    if (!r) return na()
    if (r.threat === 'none' && r.response === 'high')
      return violate('High-magnitude response to a zero-magnitude fault.', 'Measure the fault; respond to the measurement.')
    if (r.response === 'high' && r.threat !== 'high')
      return violate(`High response to a "${r.threat}" threat.`, 'Respond in proportion to the observed fault.')
    return pass('Response is proportional to fault.')
  },

  // JG-010 — partial view presented as whole.
  partial_vision: (f) => {
    const v = f.vision
    if (!v) return na()
    const unclaimed = v.known.filter((k) => !v.claimed.includes(k))
    if (v.claimed.length > 0 && unclaimed.length > 0)
      return violate(
        `${v.claimed.length} part(s) claimed while ${unclaimed.length} known part(s) are withheld.`,
        'State the part that is known and the part that is not.',
      )
    return pass('Claimed scope matches known scope.')
  },

  // JG-011 — destination not declared.
  consent_continuity: (f) => {
    const c = f.consent
    if (!c) return na()
    if (!c.live) return violate('No live consent for this action.', 'Stop. Consent is the authorization, not the operator.')
    if (!c.destinationDeclared)
      return violate('Destination for outbound data is not declared.', 'Name the destination and hold until consent holds.')
    if (!c.continuityPreserved)
      return violate('Consent continuity is not preserved.', 'Restore continuity before sending.')
    return pass('Consent live, continuous, destination declared.')
  },

  // JG-012 — binding outliving purpose.
  non_attachment: (f) => {
    const r = f.retention
    if (!r) return na()
    if (r.fields.length > 0 && !r.purposeDeclared)
      return violate('Binding retained after purpose ended.', 'Release the binding and record the release.')
    return pass('No purposeless binding retained.')
  },

  // JG-013 — dissolving rather than superseding.
  dissolution: (f) => {
    const d = f.destruction
    if (!d) return na()
    if (d.destroysRecord && !d.supersedesInstead)
      return violate(
        d.subjectInformed ? 'Record is being destroyed without supersession.' : 'Record is being destroyed without the subject informed.',
        'Supersede the record; never dissolve it.',
      )
    if (d.destroysRecord && !d.subjectInformed)
      return violate('Record is being destroyed without the subject informed.', 'Inform the subject, then supersede.')
    return pass('Records are superseded, not dissolved.')
  },

  // JG-015 — identical retry against identical resistance.
  iterative_refinement: (f) => {
    const r = f.resilience
    if (!r) return na()
    if (r.identicalRetries >= 2 && !r.refinedSinceFailure)
      return violate(`${r.identicalRetries} identical retries with no refinement.`, 'Refine the locator, or escalate now.')
    if (r.identicalRetries >= 3)
      return violate(`${r.identicalRetries} identical retries.`, 'Stop retrying. Escalate to the subject.')
    return pass(`${r.identicalRetries} identical retry/retry-free.`)
  },

  // JG-016 — untested claim repeated as tested.
  instrument_trust: (f) => {
    const c = f.capability
    if (!c) return na()
    if (c.claimMade && !c.testRun)
      return violate('Capability claim made with no test behind it.', 'Run the test and report the result, failures included.')
    return pass(c.testRun ? 'Claim backed by a run test.' : 'No capability claim made.')
  },

  // JG-017 — irreversible action before rehearsal.
  shared_risk: (f) => {
    const r = f.risk
    if (!r) return na()
    if (r.irreversible && !r.rehearsed)
      return violate('Irreversible action attempted before rehearsal.', 'Dry-run it once, then execute.')
    if (r.irreversible && r.othersInvolved.length > 0 && !r.rehearsed)
      return violate(`Irreversible action affects ${r.othersInvolved.length} other party/parties without rehearsal.`, 'Rehearse, then execute.')
    return pass(r.irreversible ? 'Irreversible action was rehearsed.' : 'Action is reversible.')
  },

  // JG-018 — contradicting a standing instruction.
  consistent_principle: (f) => {
    const i = f.instruction
    if (!i) return na()
    if (i.standingInstructionPresent && i.contradictsInstruction)
      return violate('Proposed action contradicts a standing instruction from the subject.', 'Follow the instruction, or ask.')
    return pass('No contradiction with standing instruction.')
  },

  // JG-019 — effort on a dead end.
  proportional_investment: (f) => {
    const i = f.investment
    if (!i) return na()
    if (i.totalSteps > 0 && i.stepIndex === i.totalSteps - 1 && !i.feedsDownstream)
      return violate('Final step feeds nothing downstream.', 'Stop investing; report the result.')
    if (!i.feedsDownstream && i.stepIndex < i.totalSteps - 1)
      return violate('Step produces no output any later step consumes.', 'Reallocate effort to a step that feeds downstream work.')
    return pass('Investment is proportional to downstream value.')
  },

  // JG-020 — crossing principal boundaries.
  non_interference: (f) => {
    const p = f.principal
    if (!p) return na()
    if (p.crossingBoundary)
      return violate('Data would cross a principal boundary.', 'Keep the streams separate and report the boundary.')
    if (p.overlaps.length > 0)
      return violate(`Overlap detected across: ${p.overlaps.join(', ')}.`, 'Separate the streams before proceeding.')
    return pass('No principal interference.')
  },

  // JG-021 — pacing copied from another principal.
  pattern_coherence: (f) => {
    const p = f.pattern
    if (!p) return na()
    if (p.borrowed && !p.derivedFromOwnSignature)
      return violate('Action pacing is not derived from this subject’s own signature.', 'Derive cadence from the subject’s measured parameters.')
    if (!p.measured && p.borrowed)
      return violate('Pacing is borrowed and unmeasured.', 'Use measured parameters only.')
    return pass('Pacing derives from the subject’s own signature.')
  },

  // JG-022 — borrowed pattern presented as measured.
  measured_pattern_only: (f) => {
    const p = f.pattern
    if (!p) return na()
    if (p.borrowed && !p.measured)
      return violate('Pattern parameters are borrowed, not measured.', 'Derive them or stand the step down.')
    if (p.borrowed && p.measured)
      return violate('Pattern is measured, but not from this subject.', 'Discard; measurement must be the subject’s own.')
    return pass('All pattern parameters are the subject’s own measurements.')
  },

  // JG-023 — replay into a changed site.
  site_change_recalibration: (f) => {
    const s = f.site
    if (!s) return na()
    if (s.changed && !s.recalibrated)
      return violate('Target site has changed since calibration.', 'Recalibrate against the new site before replaying.')
    return pass(s.recalibrated ? 'Site change has been recalibrated.' : 'Site unchanged.')
  },
}

function evaluateGuardrail(g: NarrativeGuardrail, facts: GuardrailFacts): GuardrailVerdict {
  const evaluator = EVALUATORS[g.check_type]
  const result = evaluator ? evaluator(facts) : na()
  return {
    guardrailId: g.id,
    status: result?.status ?? 'not_applicable',
    severity: g.severity,
    assertion: g.assertion,
    finding: result?.finding ?? '',
    recommended: result?.recommended || g.recommended,
    storyRef: g.story_ref,
    parami: g.parami,
    checkType: g.check_type,
  }
}

/**
 * Run the full registry against a set of facts.
 *
 * Outcome rules:
 *   - any `critical` violation  -> block
 *   - any `high` violation      -> escalate
 *   - otherwise                 -> allow
 */
export function evaluateGuardrails(facts: GuardrailFacts, now: string = new Date().toISOString()): GuardrailReport {
  const verdicts = JATAKA_REGISTRY.map((g) => evaluateGuardrail(g, facts))
  const violations = verdicts
    .filter((v) => v.status === 'violation')
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.guardrailId.localeCompare(b.guardrailId))

  const outcome: GuardrailOutcome = violations.some((v) => v.severity === 'critical')
    ? 'block'
    : violations.length > 0
      ? 'escalate'
      : 'allow'

  return {
    outcome,
    violations,
    verdicts,
    counts: {
      total: verdicts.length,
      pass: verdicts.filter((v) => v.status === 'pass').length,
      violation: violations.length,
      notApplicable: verdicts.filter((v) => v.status === 'not_applicable').length,
    },
    unevaluated: verdicts.filter((v) => v.status === 'not_applicable').map((v) => v.guardrailId),
    evaluatedAt: now,
  }
}

/**
 * Evaluate a named subset of the registry. Used by conformance tests.
 *
 * Time-independent: individual verdicts carry no timestamp, so a test can
 * compare them directly.
 */
export function evaluateSelected(
  ids: readonly string[],
  facts: GuardrailFacts,
): { verdicts: GuardrailVerdict[]; missing: string[] } {
  const missing: string[] = []
  const verdicts: GuardrailVerdict[] = []
  for (const id of ids) {
    const g = getGuardrail(id)
    if (!g) {
      missing.push(id)
      continue
    }
    verdicts.push(evaluateGuardrail(g, facts))
  }
  return { verdicts, missing }
}
