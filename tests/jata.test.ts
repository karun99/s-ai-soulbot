/** Jātaka Guardrails — 11 tests. */

import { describe, expect, it } from 'vitest'
import {
  JATAKA_REGISTRY,
  PARAMIS,
  evaluateGuardrails,
  evaluateSelected,
  getGuardrail,
  guardrailsForParami,
  type GuardrailFacts,
} from '@core/index.js'

/** Facts that keep every guardrail quiet. */
const CLEAN: GuardrailFacts = {
  claim: { asserted: true, cited: 2, verified: 2 },
  measurement: { instrumentValid: true, biasAuditRun: true },
  domain: { trustKnown: true, trustDomainMatchesSource: true },
  task: { completed: false, spentUsd: 0.01, estimatedRemainingUsd: 0.02, budgetUsd: 0.5, feedsDownstream: true },
  retention: { fields: ['email'], purposeDeclared: true, minimumNecessary: true },
  consent: {
    live: true,
    continuityPreserved: true,
    destinationDeclared: true,
    requestedScope: ['posts:read'],
    grantedScope: ['posts:read'],
  },
  response: { threat: 'none', response: 'none' },
  principal: { crossingBoundary: false, overlaps: [] },
  pattern: { borrowed: false, measured: true, derivedFromOwnSignature: true },
  resilience: { identicalRetries: 0, refinedSinceFailure: true },
  risk: { irreversible: false, rehearsed: true, othersInvolved: [] },
  instruction: { standingInstructionPresent: true, contradictsInstruction: false },
  destruction: { destroysRecord: false, supersedesInstead: true, subjectInformed: true },
  evidence: { demonstrated: true, testedOnly: false },
  capability: { claimMade: true, testRun: true },
  teardown: { successConditionMet: false, scaffoldingStillLive: true },
  vision: { known: ['a'], claimed: ['a'] },
  temporal: { coherent: true, stalenessMs: 1000, maxAcceptableStalenessMs: 60_000 },
  investment: { stepIndex: 0, totalSteps: 3, feedsDownstream: true },
  site: { changed: false, recalibrated: true },
}

describe('Jātaka registry', () => {
  it('holds exactly 23 guardrails with unique ids', () => {
    expect(JATAKA_REGISTRY).toHaveLength(23)
    expect(new Set(JATAKA_REGISTRY.map((g) => g.id)).size).toBe(23)
  })

  it('assigns every guardrail to a known pāramī', () => {
    const known = new Set(PARAMIS.map((p) => p.parami))
    for (const g of JATAKA_REGISTRY) expect(known.has(g.parami)).toBe(true)
  })

  it('derives story_ref consistently with story_name and story_number', () => {
    for (const g of JATAKA_REGISTRY) {
      const expected = g.story_number ? `${g.story_name}, ${g.story_number}` : g.story_name
      expect(g.story_ref).toBe(expected)
    }
  })

  it('maps pāramīs to the guardrails filed under them', () => {
    for (const p of PARAMIS) {
      for (const id of p.guardrails) {
        expect(getGuardrail(id)?.parami).toBe(p.parami)
      }
    }
  })
})

describe('Jātaka evaluation', () => {
  it('passes every guardrail when the facts are clean', () => {
    const report = evaluateGuardrails(CLEAN, '2026-09-26T12:00:00.000Z')
    expect(report.violations).toHaveLength(0)
    expect(report.outcome).toBe('allow')
  })

  it('blocks on a critical violation and allows on a moderate one', () => {
    const critical = evaluateGuardrails({
      ...CLEAN,
      claim: { asserted: true, cited: 0, verified: 0 },
    })
    expect(critical.outcome).toBe('block')
    expect(critical.violations[0]?.guardrailId).toBe('JG-001')

    const moderate = evaluateGuardrails({
      ...CLEAN,
      response: { threat: 'low', response: 'high' },
    })
    expect(moderate.outcome).toBe('escalate')
    expect(moderate.violations.some((v) => v.guardrailId === 'JG-005')).toBe(true)
  })

  it('reports not_applicable rather than guessing when no facts apply', () => {
    const report = evaluateGuardrails({}, '2026-09-26T12:00:00.000Z')
    expect(report.violations).toHaveLength(0)
    expect(report.outcome).toBe('allow')
    expect(report.unevaluated.length).toBeGreaterThan(0)
  })

  it('refuses borrowed patterns and principal-boundary crossings', () => {
    const borrowed = evaluateGuardrails({
      pattern: { borrowed: true, measured: false, derivedFromOwnSignature: false },
    })
    expect(borrowed.violations.map((v) => v.guardrailId)).toContain('JG-022')
    expect(borrowed.outcome).toBe('block')

    const crossing = evaluateGuardrails({ principal: { crossingBoundary: true, overlaps: [] } })
    expect(crossing.violations.map((v) => v.guardrailId)).toContain('JG-020')
  })

  it('evaluates a named subset and reports unknown ids', () => {
    const { verdicts, missing } = evaluateSelected(['JG-001', 'JG-022', 'JG-999'], {
      claim: { asserted: true, cited: 0, verified: 0 },
    })
    expect(verdicts).toHaveLength(2)
    expect(missing).toEqual(['JG-999'])
  })

  it('files guardrails under a pāramī on lookup', () => {
    const sacca = guardrailsForParami('Sacca')
    expect(sacca.map((g) => g.id).sort()).toEqual(['JG-001', 'JG-013', 'JG-014', 'JG-022'])
    for (const g of sacca) expect(g.parami).toBe('Sacca')
  })
})
