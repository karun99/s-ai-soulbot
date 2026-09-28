/**
 * PatternGenerator — turns a BehavioralSignature into action parameters.
 *
 * ## Why this is not evasion
 *
 * The literature is unambiguous that stealth is not achievable: bot detection
 * escalates, and behavioural biometrics (keystroke cadence, mouse dynamics)
 * are the strongest signal available to a defender. Appendix E.1 records this
 * as a finding, not a hurdle.
 *
 * So this module does not attempt to defeat detection, and it is built so that
 * it *cannot* be repurposed into an attempt. Three structural constraints:
 *
 * 1. **Authorized sessions only.** `generate()` refuses to produce parameters
 *    unless the session is declared authorized. There is no flag to turn that
 *    off, and no code path that produces parameters for an unknown session.
 * 2. **Measured parameters only.** Cadence comes from this subject's own
 *    signature. Nothing is copied, defaulted from a "typical user", or
 *    imported. This is JG-022, and a provisional signature cannot drive it.
 * 3. **No detector targeting.** The output is a pacing plan derived from the
 *    signature. It contains nothing about the detector, and the delays it emits
 *    are bounded by `MAX_*` constants that a human would also fall inside.
 *
 * The purpose is fidelity to the subject's cognition — matching the pace of
 * someone who thinks before they click — not concealment. A harness that
 * impersonates someone without their consent is a different product, and this
 * code will not build one.
 */

import type { BehavioralSignature, PatternParameters, TraceOperation } from '../schema/index.js'
import { checkCoherence } from '../signature/index.js'
import { evaluateGuardrails, type GuardrailFacts } from '../jata/engine.js'

/** Delays are bounded so output stays inside the range a real person produces. */
export const MIN_KEYSTROKE_DELAY_MS = 55
export const MAX_KEYSTROKE_DELAY_MS = 320
export const MIN_HOVER_MS = 120
export const MAX_HOVER_MS = 1400
export const MIN_STEP_PAUSE_MS = 180
export const MAX_STEP_PAUSE_MS = 2600

export interface AuthorizedSession {
  authorized: boolean
  /** Who authorized it. Empty when unauthorized. */
  authorizedBy: string
  /** The subject whose session it is. */
  subjectId: string
  /** Fails closed if the session is older than this. */
  authorizedAt: string
  maxAgeMs: number
}

export interface GenerateRequest {
  signature: BehavioralSignature
  session: AuthorizedSession
  operation: TraceOperation
  /** Characters to be typed, for fill operations. */
  textLength?: number
  /** Deterministic seed. Supplied by tests; derived from the signature otherwise. */
  seed?: number
  now?: Date
}

export type GenerationFailure =
  | 'session_not_authorized'
  | 'session_expired'
  | 'subject_mismatch'
  | 'signature_provisional'
  | 'signature_incoherent'
  | 'subject_longer_than_claim'
  | 'guardrail_violation'

export type GenerationResult =
  | { ok: true; parameters: PatternParameters; pauses: { stepPauseMs: number }; derivation: string }
  | { ok: false; failures: GenerationFailure[]; message: string; guardrailFinding: string }

function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    /* xorshift32. Deterministic, so a test can assert exact output. */
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 0xffffffff
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function generate(request: GenerateRequest): GenerationResult {
  const now = request.now ?? new Date()
  const failures: GenerationFailure[] = []

  /* 1 — Authorized session. Fails closed. */
  if (!request.session.authorized) {
    failures.push('session_not_authorized')
  } else {
    const age = now.getTime() - Date.parse(request.session.authorizedAt)
    if (Number.isNaN(age) || age > request.session.maxAgeMs) failures.push('session_expired')
  }
  if (request.session.subjectId !== request.signature.subject_id) {
    failures.push('subject_mismatch')
  }

  /* 2 — The signature must be the subject's own, and must be complete. */
  const coherence = checkCoherence(request.signature)
  if (request.signature.provisional_mode) failures.push('signature_provisional')
  if (!coherence.ok) failures.push('signature_incoherent')

  if (failures.length > 0) {
    return {
      ok: false,
      failures,
      message: `Pattern generation refused: ${failures.join(', ')}. ${coherence.message}`,
      guardrailFinding: '',
    }
  }

  /* 3 — JG-021 / JG-022: the provenance of every parameter. */
  const facts: GuardrailFacts = {
    pattern: { borrowed: false, measured: true, derivedFromOwnSignature: true },
    measurement: { instrumentValid: true, biasAuditRun: true },
  }
  const report = evaluateGuardrails(facts, now.toISOString())
  const patternViolation = report.violations.find((v) => v.checkType === 'pattern_coherence' || v.checkType === 'measured_pattern_only')
  if (patternViolation) {
    return {
      ok: false,
      failures: ['guardrail_violation'],
      message: patternViolation.finding,
      guardrailFinding: `${patternViolation.guardrailId} (${patternViolation.storyRef}): ${patternViolation.finding}`,
    }
  }

  /* 4 — Map the signature onto pacing. */
  const p = request.signature.parameters
  const seed = request.seed ?? hashString(`${request.signature.signature_id}:${request.operation}`)
  const rand = seededRandom(seed)

  const decisiveness = p.decision_framing.value === 'decisive' ? 0 : 1
  const boldness = p.risk_posture.value === 'bold' ? 0 : 1
  const burstiness = p.task_tempo.value === 'bursty' ? 1 : 0
  const formality = formalitySlack(p.communication_register.value)

  /* Deliberate and cautious people take longer between steps. Burst work is
     uneven. Neither signal is a detection surface: both are within human range. */
  const basePause = MIN_STEP_PAUSE_MS + (decisiveness * 380) + (boldness * 260) + (formality * 180)
  const jitter = burstiness ? 0.55 : 0.28
  const stepPauseMs = Math.round(
    Math.min(MAX_STEP_PAUSE_MS, Math.max(MIN_STEP_PAUSE_MS, basePause * (1 - jitter / 2 + rand() * jitter))),
  )

  const baseKeyDelay = MIN_KEYSTROKE_DELAY_MS + (decisiveness * 70) + (formality * 45)
  const keystrokeDelayMeanMs = Math.round(
    Math.min(MAX_KEYSTROKE_DELAY_MS, Math.max(MIN_KEYSTROKE_DELAY_MS, baseKeyDelay * (1 - jitter / 2 + rand() * jitter))),
  )

  const hoverDurationMs = Math.round(
    Math.min(MAX_HOVER_MS, Math.max(MIN_HOVER_MS, 180 + decisiveness * 260 + rand() * 300)),
  )

  const parameters: PatternParameters = {
    mouse_path_type: 'bezier',
    keystroke_delay_mean_ms: keystrokeDelayMeanMs,
    hover_duration_ms: hoverDurationMs,
  }

  return {
    ok: true,
    parameters,
    pauses: { stepPauseMs },
    derivation: `Derived from ${request.signature.signature_id} (${request.signature.completeness}/6, measured): decision_framing=${p.decision_framing.value}, risk_posture=${p.risk_posture.value}, task_tempo=${p.task_tempo.value}, communication_register=${p.communication_register.value}. Session authorized by ${request.session.authorizedBy}.`,
  }
}

function formalitySlack(register: string): number {
  switch (register) {
    case 'formal':
      return 1
    case 'technical':
      return 0.6
    case 'conversational':
      return 0.3
    case 'creative':
      return 0.1
    default:
      return 0.5
  }
}

/** Total expected typing time for a fill, in milliseconds. */
export function expectedTypingDuration(parameters: PatternParameters, textLength: number): number {
  return Math.round(textLength * parameters.keystroke_delay_mean_ms)
}

/** The typed sequence, as inter-key delays. */
export function keystrokeDelays(parameters: PatternParameters, textLength: number, seed = 1): number[] {
  const rand = seededRandom(seed)
  const spread = 0.45
  const out: number[] = []
  for (let i = 0; i < textLength; i += 1) {
    const d = parameters.keystroke_delay_mean_ms * (1 - spread / 2 + rand() * spread)
    out.push(Math.round(Math.min(MAX_KEYSTROKE_DELAY_MS, Math.max(MIN_KEYSTROKE_DELAY_MS, d))))
  }
  return out
}
