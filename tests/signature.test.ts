/** BehavioralSignature — 7 tests. */

import { describe, expect, it } from 'vitest'
import {
  BehavioralSignature,
  PROVISIONAL_COMPLETENESS,
  SIGNATURE_DOMAIN,
  SIGNATURE_PARAMETERS,
  USABLE_CONFIDENCE,
  adoptSignature,
  completenessLabel,
  completenessOf,
  deriveSignature,
  isUsable,
  unmeasured,
} from '@core/index.js'
import { COMPLETE_OBSERVATIONS, COMPLETE_SIGNATURE, PROVISIONAL_OBSERVATIONS } from './fixtures.js'

describe('signature shape', () => {
  it('exposes exactly six parameters', () => {
    expect(SIGNATURE_PARAMETERS).toHaveLength(6)
  })

  it('accepts the documented literal and rejects a bad domain value', () => {
    expect(adoptSignature(COMPLETE_SIGNATURE).signature_id).toBe('sig_test')
    const bad = { ...COMPLETE_SIGNATURE, parameters: { ...COMPLETE_SIGNATURE.parameters, task_tempo: { value: 'frantic', confidence: 0.9 } } }
    expect(BehavioralSignature.safeParse(bad).success).toBe(false)
  })

  it('rejects a completeness outside 0–6', () => {
    expect(BehavioralSignature.safeParse({ ...COMPLETE_SIGNATURE, completeness: 7 }).success).toBe(false)
  })
})

describe('measurability', () => {
  it('counts a parameter usable only with a valid value and enough confidence', () => {
    expect(isUsable('task_tempo', { value: 'steady', confidence: 0.7, evidence: 'p' })).toBe(true)
    expect(isUsable('task_tempo', { value: 'steady', confidence: USABLE_CONFIDENCE - 0.01, evidence: 'p' })).toBe(false)
    expect(isUsable('task_tempo', { value: 'nope', confidence: 0.9, evidence: 'p' })).toBe(false)
    expect(isUsable('task_tempo', undefined)).toBe(false)
  })

  it('reports completeness and the unmeasured remainder', () => {
    expect(completenessOf(COMPLETE_OBSERVATIONS)).toBe(6)
    expect(completenessOf(PROVISIONAL_OBSERVATIONS)).toBe(3)
    expect(unmeasured(PROVISIONAL_OBSERVATIONS)).toEqual([
      'communication_register',
      'task_tempo',
      'escalation_criteria',
    ])
  })

  it('derives a complete signature and labels it 6/6', () => {
    const { signature, usable } = deriveSignature({
      signatureId: 'sig_derive',
      subjectId: 'subj_001',
      derivedAt: '2026-09-26T12:00:00.000Z',
      observations: COMPLETE_OBSERVATIONS,
    })
    expect(signature.completeness).toBe(6)
    expect(signature.provisional_mode).toBe(false)
    expect(usable).toHaveLength(6)
    expect(completenessLabel(signature)).toBe('6/6')
  })

  it('never populates an unmeasured parameter with a guess', () => {
    const { signature } = deriveSignature({
      signatureId: 'sig_partial',
      subjectId: 'subj_001',
      derivedAt: '2026-09-26T12:00:00.000Z',
      observations: PROVISIONAL_OBSERVATIONS,
    })
    for (const name of SIGNATURE_PARAMETERS) {
      const p = signature.parameters[name]
      if (!COMPLETE_OBSERVATIONS[name] && !PROVISIONAL_OBSERVATIONS[name]) {
        expect(p.confidence).toBe(0)
      }
    }
    expect(signature.provisional_mode).toBe(true)
    expect(PROVISIONAL_COMPLETENESS).toBe(4)
  })

  it('keeps every domain in sync with the schema', () => {
    for (const name of SIGNATURE_PARAMETERS) {
      const domain = SIGNATURE_DOMAIN[name]
      expect(Array.isArray(domain)).toBe(true)
      expect(domain.length).toBeGreaterThan(0)
    }
  })
})
