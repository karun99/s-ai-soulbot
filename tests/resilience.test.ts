/** Resilience — 8 tests. Covers provisional mode, grounding, and the Bridge Rule. */

import { describe, expect, it } from 'vitest'
import {
  BRIDGE_QUESTION,
  RELIANCE_PATTERN_THRESHOLD,
  evaluateBridgeRule,
  isValidPointer,
  validatePointers,
  checkCoherence,
  deriveSignature,
  generate,
  type AuthorizedSession,
} from '@core/index.js'
import {
  COMPLETE_SIGNATURE,
  HEAVY_BRIDGE,
  LIGHT_BRIDGE,
  PROVISIONAL_OBSERVATIONS,
  PROVISIONAL_SIGNATURE,
} from './fixtures.js'

const SESSION: AuthorizedSession = {
  authorized: true,
  authorizedBy: 'subj_001',
  subjectId: 'subj_001',
  authorizedAt: '2026-09-26T11:59:00.000Z',
  maxAgeMs: 3_600_000,
}

const NOW = new Date('2026-09-26T12:00:00.000Z')

describe('provisional mode', () => {
  it('marks a signature provisional below four usable parameters', () => {
    const { signature } = deriveSignature(
      { signatureId: 's1', subjectId: 'subj_001', derivedAt: '2026-09-26T12:00:00.000Z', observations: PROVISIONAL_OBSERVATIONS },
      '2026-09-26T12:00:00.000Z',
    )
    expect(signature.completeness).toBe(3)
    expect(signature.provisional_mode).toBe(true)
  })

  it('treats low-confidence observations as unmeasured', () => {
    const { signature, unmeasured } = deriveSignature({
      signatureId: 's2',
      subjectId: 'subj_001',
      derivedAt: '2026-09-26T12:00:00.000Z',
      observations: {
        decision_framing: { value: 'decisive', confidence: 0.2, evidence: 'probe:weak' },
      },
    })
    expect(signature.completeness).toBe(0)
    expect(unmeasured).toContain('decision_framing')
  })

  it('rejects an out-of-domain value and reports why', () => {
    const { rejected } = deriveSignature({
      signatureId: 's3',
      subjectId: 'subj_001',
      derivedAt: '2026-09-26T12:00:00.000Z',
      observations: { risk_posture: { value: 'reckless', confidence: 0.9, evidence: 'probe:x' } },
    })
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.parameter).toBe('risk_posture')
  })
})

describe('pattern generation gating', () => {
  it('refuses an unauthorized session', () => {
    const result = generate({
      signature: COMPLETE_SIGNATURE,
      session: { ...SESSION, authorized: false },
      operation: 'click',
      now: NOW,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failures).toContain('session_not_authorized')
  })

  it('refuses an expired session and a subject mismatch', () => {
    const expired = generate({
      signature: COMPLETE_SIGNATURE,
      session: { ...SESSION, authorizedAt: '2026-01-01T00:00:00.000Z', maxAgeMs: 1000 },
      operation: 'click',
      now: NOW,
    })
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.failures).toContain('session_expired')

    const mismatch = generate({
      signature: COMPLETE_SIGNATURE,
      session: { ...SESSION, subjectId: 'subj_other' },
      operation: 'click',
      now: NOW,
    })
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) expect(mismatch.failures).toContain('subject_mismatch')
  })

  it('refuses a provisional signature, so measured-only holds under stress', () => {
    const result = generate({ signature: PROVISIONAL_SIGNATURE, session: SESSION, operation: 'click', now: NOW })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failures).toContain('signature_provisional')
      expect(result.message).toMatch(/signature/i)
    }
  })

  it('produces bounded parameters for an authorized complete session', () => {
    const result = generate({ signature: COMPLETE_SIGNATURE, session: SESSION, operation: 'fill', now: NOW })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parameters.mouse_path_type).toBe('bezier')
      expect(result.parameters.keystroke_delay_mean_ms).toBeGreaterThanOrEqual(55)
      expect(result.parameters.keystroke_delay_mean_ms).toBeLessThanOrEqual(320)
      expect(result.derivation).toContain('measured')
    }
  })
})

describe('signature coherence', () => {
  it('accepts a coherent complete signature and drives automation', () => {
    const c = checkCoherence(COMPLETE_SIGNATURE)
    expect(c.ok).toBe(true)
    expect(c.drivesAutomation).toBe(true)
  })

  it('catches a completeness claim that the parameters do not support', () => {
    const lying = { ...COMPLETE_SIGNATURE, completeness: 6, subject_id: '' }
    const c = checkCoherence({ ...lying, parameters: { ...COMPLETE_SIGNATURE.parameters, risk_posture: { value: 'bold', confidence: 0 } } })
    expect(c.ok).toBe(false)
    expect(c.issues.join(' ')).toContain('does not match')
  })
})

describe('the Bridge Rule', () => {
  it('asks its question always, and passes a light step', () => {
    const v = evaluateBridgeRule(LIGHT_BRIDGE, '2026-09-26T12:00:00.000Z')
    expect(v.question).toBe(BRIDGE_QUESTION)
    expect(v.verdict).toBe('clear')
  })

  it('refuses a dependence risk even though the step is heavy', () => {
    const v = evaluateBridgeRule(HEAVY_BRIDGE, '2026-09-26T12:00:00.000Z')
    expect(v.verdict).toBe('dependence_risk')
    expect(v.pointerRequired).not.toBe('')
  })

  it('asks for a pointer on a heavy moment with no dependence risk', () => {
    const v = evaluateBridgeRule({ ...LIGHT_BRIDGE, irreversible: true, sensitiveDomain: 'financial' })
    expect(v.verdict).toBe('pointer_required')
    expect(v.pointerRequired).toContain('financial adviser')
  })

  it('treats a reliance pattern as a dependence risk', () => {
    const v = evaluateBridgeRule({
      ...LIGHT_BRIDGE,
      actionClass: 'send_message',
      affectsOthers: true,
      relianceCount: RELIANCE_PATTERN_THRESHOLD,
      displacesSubject: true,
    })
    expect(v.verdict).toBe('dependence_risk')
  })

  it('rejects a pointer that is a URL, a bot, or a placeholder', () => {
    expect(isValidPointer('https://example.test/crisis')).toBe(false)
    expect(isValidPointer('the AI')).toBe(false)
    expect(isValidPointer('someone')).toBe(false)
    expect(isValidPointer('Priya, my sister')).toBe(true)
    expect(validatePointers(['Priya', 'the bot', 'https://x.test']).rejected).toHaveLength(2)
  })

  it('passes a heavy moment once a real person is named', () => {
    const v = evaluateBridgeRule({ ...HEAVY_BRIDGE, connectionPointers: ['Priya, my sister'] })
    expect(v.verdict).toBe('pointer_present')
  })
})
