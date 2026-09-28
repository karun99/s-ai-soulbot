/**
 * BehavioralSignature — the six-parameter profile of how the subject works.
 *
 * Two rules govern everything in this module.
 *
 * 1. **Measured only.** A parameter may be filled only from observation of this
 *    subject. There is no default population path, no "typical user" fallback,
 *    and no import. A parameter without a measurement is absent, and the
 *    signature reports a lower completeness. This is JG-022.
 *
 * 2. **Provisional is a real state.** When fewer than the required number of
 *    parameters carry a usable confidence, the signature enters provisional
 *    mode and downstream consumers must not treat it as a description of the
 *    subject. Automation proceeds under explicit defaults, and says so.
 */

import {
  BehavioralSignature,
  SIGNATURE_DOMAIN,
  SIGNATURE_PARAMETERS,
  type SignatureParameterName,
} from '../schema/index.js'

/** Below this confidence a parameter is treated as unmeasured. */
export const USABLE_CONFIDENCE = 0.5

/** Below this completeness the signature is provisional. */
export const PROVISIONAL_COMPLETENESS = 4

export interface ParameterObservation {
  value: string
  confidence: number
  /** Where the measurement came from, for audit. Never a synthetic default. */
  evidence: string
}

export interface DeriveInput {
  signatureId: string
  subjectId: string
  derivedAt?: string
  observations: Partial<Record<SignatureParameterName, ParameterObservation>>
}

/** A parameter is usable when it is valid for its domain and confident enough. */
export function isUsable(
  name: SignatureParameterName,
  observation: ParameterObservation | undefined,
): boolean {
  if (!observation) return false
  if (observation.confidence < USABLE_CONFIDENCE) return false
  return (SIGNATURE_DOMAIN[name] as readonly string[]).includes(observation.value)
}

export function completenessOf(observations: Partial<Record<SignatureParameterName, ParameterObservation>>): number {
  return SIGNATURE_PARAMETERS.filter((n) => isUsable(n, observations[n])).length
}

/** Parameters the subject has no measurement for. */
export function unmeasured(observations: Partial<Record<SignatureParameterName, ParameterObservation>>): SignatureParameterName[] {
  return SIGNATURE_PARAMETERS.filter((n) => !isUsable(n, observations[n]))
}

export interface DeriveResult {
  signature: BehavioralSignature
  usable: SignatureParameterName[]
  unmeasured: SignatureParameterName[]
  /** Set when observations were present but failed validation. Never silently dropped. */
  rejected: { parameter: SignatureParameterName; reason: string }[]
}

/** First value of a parameter's domain, guaranteed defined. */
function defaultValueFor(name: SignatureParameterName): string {
  const domain = SIGNATURE_DOMAIN[name] as readonly string[]
  return domain[0]!
}

export function deriveSignature(input: DeriveInput, now: string = new Date().toISOString()): DeriveResult {
  const rejected: { parameter: SignatureParameterName; reason: string }[] = []
  const params = {} as BehavioralSignature['parameters']

  for (const name of SIGNATURE_PARAMETERS) {
    const obs = input.observations[name]
    if (!obs) {
      /* Unmeasured parameters are emitted with zero confidence, not guessed. */
      params[name] = { value: defaultValueFor(name), confidence: 0 }
      continue
    }
    const domain = SIGNATURE_DOMAIN[name] as readonly string[]
    if (!domain.includes(obs.value)) {
      rejected.push({
        parameter: name,
        reason: `"${obs.value}" is not in the domain [${domain.join('|')}].`,
      })
      params[name] = { value: defaultValueFor(name), confidence: 0 }
      continue
    }
    params[name] = { value: obs.value, confidence: obs.confidence }
  }

  const usable = SIGNATURE_PARAMETERS.filter((n) => isUsable(n, input.observations[n]))
  const missing = unmeasured(input.observations)
  const completeness = usable.length

  const signature: BehavioralSignature = {
    signature_id: input.signatureId,
    subject_id: input.subjectId,
    derived_at: input.derivedAt ?? now,
    source: 'probe_derived',
    completeness,
    parameters: params,
    provisional_mode: completeness < PROVISIONAL_COMPLETENESS,
  }

  return { signature, usable, unmeasured: missing, rejected }
}

/** Build a signature directly from an already-validated literal. Validates on the way in. */
export function adoptSignature(input: BehavioralSignature): BehavioralSignature {
  return BehavioralSignature.parse(input)
}

export interface SignatureCoherence {
  ok: boolean
  issues: string[]
  /** True when the signature may not drive pattern parameters. */
  drivesAutomation: boolean
  message: string
}

/**
 * Coherence check: is this signature internally consistent and strong enough to
 * drive human-pattern automation?
 *
 * A signature that claims completeness it does not have, or that carries a
 * provisional marker at full completeness, is incoherent. So is a signature
 * driving automation while still provisional.
 */
export function checkCoherence(signature: BehavioralSignature): SignatureCoherence {
  const issues: string[] = []

  let usable = 0
  for (const name of SIGNATURE_PARAMETERS) {
    const p = signature.parameters[name]
    if (!p) {
      issues.push(`${name}: missing.`)
      continue
    }
    const domain = SIGNATURE_DOMAIN[name] as readonly string[]
    if (!domain.includes(p.value)) issues.push(`${name}: "${p.value}" outside domain.`)
    if (p.confidence < 0 || p.confidence > 1) issues.push(`${name}: confidence out of range.`)
    if (p.confidence >= USABLE_CONFIDENCE) usable += 1
  }

  if (signature.completeness !== usable)
    issues.push(`completeness ${signature.completeness} does not match ${usable} usable parameters.`)

  if (signature.completeness > SIGNATURE_PARAMETERS.length)
    issues.push(`completeness ${signature.completeness} exceeds the six parameters.`)

  const shouldBeProvisional = usable < PROVISIONAL_COMPLETENESS
  if (signature.provisional_mode !== shouldBeProvisional)
    issues.push(
      `provisional_mode is ${signature.provisional_mode} but ${usable} parameters are usable (threshold ${PROVISIONAL_COMPLETENESS}).`,
    )

  if (signature.subject_id.trim().length === 0) issues.push('subject_id is empty.')

  const drivesAutomation = !signature.provisional_mode && issues.length === 0
  return {
    ok: issues.length === 0,
    issues,
    drivesAutomation,
    message:
      issues.length === 0
        ? signature.provisional_mode
          ? `Coherent but provisional (${usable}/6). Automation runs on declared defaults, not on the subject's pattern.`
          : `Coherent and complete (${usable}/6).`
        : `Incoherent: ${issues.join(' ')}`,
  }
}

/** Human-readable completeness, e.g. "4/6". */
export function completenessLabel(signature: BehavioralSignature): string {
  return `${signature.completeness}/${SIGNATURE_PARAMETERS.length}`
}
