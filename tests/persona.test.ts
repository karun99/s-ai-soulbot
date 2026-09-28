/** Persona Model — 8 tests. */

import { describe, expect, it } from 'vitest'
import {
  deriveLifecycle,
  personaMayAct,
  runIdentityGate,
  synthesize,
  type ContinuityLedgerEntry,
  type SynthesisInput,
} from '@core/index.js'
import { NOW, PERSONA } from './fixtures.js'

const synthesisInput = (overrides: Partial<SynthesisInput> = {}): SynthesisInput => ({
  personaId: 'pers_100',
  version: '3.0.0',
  snapshotId: 'snap_9001',
  name: 'Subject One',
  headline: 'Research engineer',
  anchors: [
    { name: 'employer', weight: 0.8, evidence: ['identity.employer'] },
    { name: 'ghost_anchor', weight: 0.5, evidence: [] },
  ],
  domains: [
    { name: 'distributed systems', confidence: 0.8, evidence: ['posts.text'] },
    { name: 'ungrounded_domain', confidence: 0.9, evidence: [] },
  ],
  style: { formality: 0.4, directness: 0.75, verbosity: 1.4 },
  validFrom: NOW,
  validUntil: null,
  trajectory: 'stable',
  validation: {
    information_handling: 0.78,
    neural_synthesis: 0.71,
    data_integration: 0.66,
    human_voice_index: 0.74,
  },
  ...overrides,
})

const ledger = (events: ContinuityLedgerEntry['event'][]): ContinuityLedgerEntry[] =>
  events.map((event, i) => ({ consentId: 'consent_001', version: i + 1, event, at: `2026-09-0${i + 1}T00:00:00.000Z` }))

describe('synthesis', () => {
  it('drops an anchor with no evidence field path, and says why', () => {
    const r = synthesize(synthesisInput())
    expect(r.droppedAnchors.map((a) => a.name)).toEqual(['ghost_anchor'])
    expect(r.droppedAnchors[0]?.reason).toContain('no evidence')
    expect(r.persona.identity.anchors.map((a) => a.name)).toEqual(['employer'])
  })

  it('drops a domain with no evidence field path', () => {
    const r = synthesize(synthesisInput())
    expect(r.droppedDomains.map((d) => d.name)).toEqual(['ungrounded_domain'])
    expect(r.persona.knowledge_domains.map((d) => d.name)).toEqual(['distributed systems'])
  })

  it('clamps a style index into 0–1 rather than emitting an out-of-range value', () => {
    const r = synthesize(synthesisInput())
    expect(r.persona.communication_style.verbosity).toBe(1)
  })

  it('warns when no evidenced anchor survives, because it cannot act', () => {
    const r = synthesize(synthesisInput({ anchors: [{ name: 'nothing', weight: 0.5, evidence: [] }] }))
    expect(r.warnings[0]).toContain('no evidenced identity anchors')
  })
})

describe('lifecycle', () => {
  it('reaches stable only with corroboration, maturity and guarded action', () => {
    expect(
      deriveLifecycle({ snapshotCount: 9, corroborationRate: 0.9, actedUnderGuard: true, domainMaturity: 0.7, validUntil: null }),
    ).toBe('stable')
  })

  it('stops at ignited when corroboration is thin', () => {
    expect(
      deriveLifecycle({ snapshotCount: 9, corroborationRate: 0.4, actedUnderGuard: true, domainMaturity: 0.7, validUntil: null }),
    ).toBe('ignited')
  })

  it('is provisional on a single snapshot', () => {
    expect(
      deriveLifecycle({ snapshotCount: 1, corroborationRate: 0.1, actedUnderGuard: false, domainMaturity: 0.1, validUntil: null }),
    ).toBe('provisional')
  })

  it('expires on the validity window, regardless of evidence', () => {
    expect(
      deriveLifecycle({
        snapshotCount: 9,
        corroborationRate: 0.9,
        actedUnderGuard: true,
        domainMaturity: 0.7,
        validUntil: '2026-01-01T00:00:00.000Z',
        now: new Date(NOW),
      }),
    ).toBe('expired')
  })
})

describe('identity gate', () => {
  it('reads a signal as a change when the anchors are intact', () => {
    const r = runIdentityGate(PERSONA, PERSONA, ledger(['granted']), null)
    expect(r.identityState).toBe('same_entity')
    expect(r.verdictInterpretation).toBe('change_signal')
  })

  it('reads a signal as a new baseline when evidence was reconstituted', () => {
    const r = runIdentityGate(PERSONA, PERSONA, ledger(['granted', 'evidence_invalidated', 'evidence_restored']), null)
    expect(r.identityState).toBe('reconstituted')
    expect(r.verdictInterpretation).toBe('new_baseline')
  })

  it('holds every verdict when identity is unresolved', () => {
    const r = runIdentityGate(PERSONA, PERSONA, ledger(['granted', 'evidence_invalidated']), null)
    expect(r.identityState).toBe('unresolved')
    expect(r.verdictInterpretation).toBe('held')
    expect(personaMayAct(PERSONA, r)).toBe(false)
  })

  it('blocks a self-sabotaging directive outright', () => {
    const r = runIdentityGate(PERSONA, PERSONA, ledger(['granted']), {
      proposedVerdict: 'subject is not competent to delegate',
      contradictsAuthorization: true,
    })
    const directive = r.checks.find((c) => c.name === 'directive')
    expect(directive?.status).toBe('fail')
    expect(directive?.detail).toContain('Self-sabotaging')
  })

  it('refuses to act for an expired or anchorless persona', () => {
    expect(personaMayAct({ ...PERSONA, lifecycle: 'expired' }, null)).toBe(false)
    expect(personaMayAct({ ...PERSONA, identity: { ...PERSONA.identity, anchors: [] } }, null)).toBe(false)
    expect(personaMayAct(PERSONA, null)).toBe(true)
  })
})
