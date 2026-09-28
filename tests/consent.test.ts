/** Consent continuity — 8 tests. */

import { describe, expect, it } from 'vitest'
import {
  REVOCATION_PROPAGATION_MS,
  assessContinuity,
  checkConsent,
  fromConsentObject,
  revoke,
  type ConsentObject,
  type ContinuityLedgerEntry,
} from '@core/index.js'

const NOW = new Date('2026-09-26T12:00:00.000Z')

const CONSENT: ConsentObject = {
  consent_id: 'consent_001',
  subject_id: 'subj_001',
  granted_by: 'subject',
  granted_at: '2026-09-01T00:00:00.000Z',
  expires_at: '2026-12-01T00:00:00.000Z',
  revocable: true,
  connectors: [
    {
      connector: 'github',
      status: 'active',
      scopes: {
        'repos:read': { granted: true, purpose: ['diagnose a failing build'] },
        'repos:write': { granted: false, reason: 'never requested' },
      },
    },
  ],
  audit_log: 'audit/log.jsonl',
  revocation_webhook: 'https://example.test/revoke',
}

describe('consent check', () => {
  it('passes when the connector is live, the scope is granted, and the purpose is declared', () => {
    const c = checkConsent(
      fromConsentObject(CONSENT),
      { connector: 'github', requiredScopes: ['repos:read'], purpose: 'diagnose a failing build' },
      NOW,
    )
    expect(c.ok).toBe(true)
    expect(c.live).toBe(true)
    expect(c.continuityPreserved).toBe(true)
    expect(c.grantedScopes).toEqual(['repos:read'])
  })

  it('fails when a scope was never granted', () => {
    const c = checkConsent(
      fromConsentObject(CONSENT),
      { connector: 'github', requiredScopes: ['repos:write'], purpose: 'open a pull request' },
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.problems).toContain('scope_not_granted')
    expect(c.missingScopes).toEqual(['repos:write'])
  })

  it('fails when the purpose was never declared for that scope', () => {
    const c = checkConsent(
      fromConsentObject(CONSENT),
      { connector: 'github', requiredScopes: ['repos:read'], purpose: 'publish a release' },
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.problems).toContain('purpose_not_declared')
  })

  it('fails when the consent has expired', () => {
    const c = checkConsent(
      fromConsentObject({ ...CONSENT, expires_at: '2026-09-20T00:00:00.000Z' }),
      { connector: 'github', requiredScopes: ['repos:read'], purpose: 'diagnose a failing build' },
      NOW,
    )
    expect(c.problems).toContain('consent_expired')
    expect(c.live).toBe(false)
  })

  it('fails closed for an unknown connector rather than assuming a grant', () => {
    const c = checkConsent(
      fromConsentObject(CONSENT),
      { connector: 'bank', requiredScopes: ['accounts:read'], purpose: 'check a balance' },
      NOW,
    )
    expect(c.ok).toBe(false)
    expect(c.problems).toContain('no_consent')
    expect(c.grantedScopes).toEqual([])
  })
})

describe('revocation', () => {
  it('revokes a connector and names the personas that must be invalidated', () => {
    const r = revoke(fromConsentObject(CONSENT), { kind: 'connector', name: 'github' }, [
      { personaId: 'pers_001', connectors: ['github'], scopes: ['repos:read'] },
      { personaId: 'pers_002', connectors: ['slack'], scopes: [] },
    ])
    expect(r.state.connectors[0]?.status).toBe('revoked')
    expect(r.invalidatedPersonas).toEqual(['pers_001'])
    expect(r.withinWindow).toBe(true)
    expect(r.propagationMs).toBeLessThanOrEqual(REVOCATION_PROPAGATION_MS)
  })

  it('revokes every connector at once', () => {
    const r = revoke(fromConsentObject(CONSENT), { kind: 'all' })
    expect(r.state.connectors.every((c) => c.status === 'revoked')).toBe(true)
    expect(r.changes.length).toBeGreaterThan(0)
  })
})

describe('continuity ledger', () => {
  const entry = (version: number, event: ContinuityLedgerEntry['event'], at: string) => ({
    consentId: 'consent_001',
    version,
    event,
    at,
  })

  it('reports an intact trail', () => {
    const r = assessContinuity([entry(1, 'granted', '2026-09-01T00:00:00.000Z')])
    expect(r.state).toBe('intact')
    expect(r.version).toBe(1)
    expect(r.isNewBaseline).toBe(false)
  })

  it('reports invalidated evidence as discontinuous, so no derived verdict is held', () => {
    const r = assessContinuity([
      entry(1, 'granted', '2026-09-01T00:00:00.000Z'),
      entry(2, 'evidence_invalidated', '2026-09-02T00:00:00.000Z'),
    ])
    expect(r.state).toBe('discontinuous')
    expect(r.findings).toContain('evidence_invalidated_without_restore')
  })

  it('marks restored evidence as a new baseline rather than a change', () => {
    const r = assessContinuity([
      entry(1, 'granted', '2026-09-01T00:00:00.000Z'),
      entry(2, 'evidence_invalidated', '2026-09-02T00:00:00.000Z'),
      entry(3, 'evidence_restored', '2026-09-03T00:00:00.000Z'),
    ])
    expect(r.state).toBe('reconstituted')
    expect(r.isNewBaseline).toBe(true)
  })

  it('refuses to interpret a malformed ledger', () => {
    const r = assessContinuity([
      entry(1, 'granted', '2026-09-01T00:00:00.000Z'),
      entry(2, 'granted', '2026-09-01T12:00:00.000Z'),
    ])
    expect(r.state).toBe('unresolved')
    expect(r.findings).toContain('regrant_without_prior_revoke')
  })

  it('treats an empty ledger as unresolved, not as consent', () => {
    expect(assessContinuity([]).state).toBe('unresolved')
  })
})
