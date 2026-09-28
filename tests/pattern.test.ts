/** Pattern Generator — 8 tests. */

import { describe, expect, it } from 'vitest'
import {
  MAX_HOVER_MS,
  MAX_KEYSTROKE_DELAY_MS,
  MIN_KEYSTROKE_DELAY_MS,
  expectedTypingDuration,
  generate,
  keystrokeDelays,
  type AuthorizedSession,
} from '@core/index.js'
import { COMPLETE_SIGNATURE } from './fixtures.js'

const SESSION: AuthorizedSession = {
  authorized: true,
  authorizedBy: 'subj_001',
  subjectId: 'subj_001',
  authorizedAt: '2026-09-26T11:59:00.000Z',
  maxAgeMs: 3_600_000,
}

const NOW = new Date('2026-09-26T12:00:00.000Z')
const params = () => {
  const r = generate({ signature: COMPLETE_SIGNATURE, session: SESSION, operation: 'fill', now: NOW, seed: 7 })
  if (!r.ok) throw new Error('expected success')
  return r
}

describe('parameter derivation', () => {
  it('emits a bezier path for pointer movement', () => {
    expect(params().parameters.mouse_path_type).toBe('bezier')
  })

  it('keeps keystroke delay inside the human band', () => {
    const d = params().parameters.keystroke_delay_mean_ms
    expect(d).toBeGreaterThanOrEqual(MIN_KEYSTROKE_DELAY_MS)
    expect(d).toBeLessThanOrEqual(MAX_KEYSTROKE_DELAY_MS)
  })

  it('keeps hover duration inside the human band', () => {
    const h = params().parameters.hover_duration_ms
    expect(h).toBeGreaterThanOrEqual(120)
    expect(h).toBeLessThanOrEqual(MAX_HOVER_MS)
  })
})

describe('determinism and variation', () => {
  it('is deterministic for a fixed seed', () => {
    const a = params().parameters
    const b = params().parameters
    expect(a).toEqual(b)
  })

  it('varies with the seed, so repeated steps are not identical', () => {
    const a = generate({ signature: COMPLETE_SIGNATURE, session: SESSION, operation: 'fill', now: NOW, seed: 1 })
    const b = generate({ signature: COMPLETE_SIGNATURE, session: SESSION, operation: 'fill', now: NOW, seed: 2 })
    if (a.ok && b.ok) expect(a.parameters.keystroke_delay_mean_ms).not.toBe(b.parameters.keystroke_delay_mean_ms)
  })

  it('paces a deliberate subject more slowly than a decisive one', () => {
    const deliberate = generate({ signature: COMPLETE_SIGNATURE, session: SESSION, operation: 'click', now: NOW, seed: 3 })
    const decisive = generate({
      signature: {
        ...COMPLETE_SIGNATURE,
        parameters: { ...COMPLETE_SIGNATURE.parameters, decision_framing: { value: 'decisive', confidence: 0.9 } },
      },
      session: SESSION,
      operation: 'click',
      now: NOW,
      seed: 3,
    })
    if (deliberate.ok && decisive.ok) {
      expect(deliberate.pauses.stepPauseMs).toBeGreaterThan(decisive.pauses.stepPauseMs)
    }
  })
})

describe('typing', () => {
  it('produces one delay per character, all in band', () => {
    const p = params().parameters
    const delays = keystrokeDelays(p, 12, 5)
    expect(delays).toHaveLength(12)
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(MIN_KEYSTROKE_DELAY_MS)
      expect(d).toBeLessThanOrEqual(MAX_KEYSTROKE_DELAY_MS)
    }
  })

  it('estimates typing duration from the mean delay', () => {
    const p = params().parameters
    expect(expectedTypingDuration(p, 20)).toBe(20 * p.keystroke_delay_mean_ms)
  })
})
