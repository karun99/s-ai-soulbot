/** Sentinel — 8 tests. */

import { describe, expect, it } from 'vitest'
import {
  authorize,
  assertDelegation,
  checkScopeEquality,
  checkMcpContracts,
  createMemoryVault,
  evaluateBudget,
  isGuarded,
  isIrreversible,
  needsCredential,
  type AuthorizationRequest,
} from '@core/index.js'
import { HEAVY_BRIDGE, LIGHT_BRIDGE } from './fixtures.js'

const base = (overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest => ({
  requestId: 'req_1',
  principalId: 'subj_001',
  actionClass: 'read',
  targetDescription: 'public changelog',
  requestedScopes: [],
  consent: { consentId: 'c1', live: true, continuityPreserved: true, grantedScopes: [] },
  subjectAvailable: true,
  ...overrides,
})

describe('action classification', () => {
  it('marks submit, pay, upload and message as guarded', () => {
    for (const a of ['submit_form', 'pay', 'upload', 'send_message'] as const) {
      expect(isGuarded(a)).toBe(true)
    }
    expect(isGuarded('read')).toBe(false)
  })

  it('separates irreversible and credential-bearing classes', () => {
    expect(isIrreversible('transfer_funds')).toBe(true)
    expect(needsCredential('pay')).toBe(true)
    expect(needsCredential('read')).toBe(false)
  })
})

describe('scope equality (T3)', () => {
  it('accepts exact equality and rejects both directions of drift', () => {
    expect(checkScopeEquality({ source: 't', declared: ['a:read'], enforced: ['a:read'] }).equal).toBe(true)

    const under = checkScopeEquality({ source: 't', declared: ['a:read', 'a:write'], enforced: ['a:read'] })
    expect(under.equal).toBe(false)
    expect(under.failures).toContain('enforced_missing_declared')
    expect(under.severity).toBe('critical')

    const over = checkScopeEquality({ source: 't', declared: ['a:read'], enforced: ['a:read', 'a:write'] })
    expect(over.failures).toContain('enforced_exceeds_declared')
  })

  it('fails a batch when any tool lies about its scope', () => {
    const result = checkMcpContracts([
      { server: 'a', tool: 'ok', declaredScopes: ['x:read'], enforcedScopes: ['x:read'] },
      { server: 'b', tool: 'liar', declaredScopes: ['x:read'], enforcedScopes: ['x:read', 'x:write'] },
    ])
    expect(result.ok).toBe(false)
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(1)
  })
})

describe('Sentinel authorization', () => {
  it('denies before evaluating anything else when a tool lies about scope', () => {
    const d = authorize(
      base({
        contracts: [{ server: 'a', tool: 'liar', declaredScopes: ['x:read'], enforcedScopes: ['x:read', 'x:write'] }],
        consent: { consentId: 'c1', live: false, continuityPreserved: false, grantedScopes: [] },
      }),
    )
    expect(d.decision).toBe('deny')
    expect(d.decidedBy).toBe('scope_equality')
  })

  it('denies when consent is not live, and when continuity is broken', () => {
    expect(authorize(base({ consent: { consentId: 'c', live: false, continuityPreserved: true, grantedScopes: [] } })).decidedBy).toBe('consent_continuity')
    expect(authorize(base({ consent: { consentId: 'c', live: true, continuityPreserved: false, grantedScopes: [] } })).decidedBy).toBe('consent_continuity')
  })

  it('denies scope that was requested but never granted', () => {
    const d = authorize(
      base({ requestedScopes: ['posts:write'], consent: { consentId: 'c', live: true, continuityPreserved: true, grantedScopes: ['posts:read'] } }),
    )
    expect(d.decision).toBe('deny')
    expect(d.reasons.join(' ')).toContain('posts:write')
  })

  it('asks the subject for a guarded action and allows an unguarded one', () => {
    const guarded = authorize(base({ actionClass: 'submit_form', requestedScopes: [] }))
    expect(guarded.decision).toBe('ask_user')
    expect(guarded.decidedBy).toBe('guarded_action')
    expect(guarded.permitted).toBe(false)

    expect(authorize(base()).decision).toBe('allow')
  })

  it('refuses a Bridge Rule dependence risk and asks when only a pointer is missing', () => {
    const risk = authorize(base({ bridge: HEAVY_BRIDGE }))
    expect(risk.decision).toBe('deny')
    expect(risk.decidedBy).toBe('bridge_rule')

    const pointerNeeded = authorize(base({ bridge: { ...LIGHT_BRIDGE, irreversible: true } }))
    expect(pointerNeeded.decision).toBe('ask_user')
    expect(pointerNeeded.decidedBy).toBe('bridge_rule')
    expect(pointerNeeded.question).toContain('real person')
  })
})

describe('budget and vault', () => {
  it('stops at the ceiling rather than reporting a near-miss', () => {
    expect(evaluateBudget({ maxTokens: 100, maxCostUsd: 1 }, { tokens: 99, costUsd: 0.1 }).ok).toBe(true)
    const over = evaluateBudget({ maxTokens: 100, maxCostUsd: 1 }, { tokens: 101, costUsd: 0.1 })
    expect(over.ok).toBe(false)
    expect(over.bindingConstraint).toBe('tokens')
  })

  it('never returns a secret, only a just-in-time insertion', async () => {
    const vault = createMemoryVault()
    const ref = await vault.register({ accountHint: 'subj_001', connector: 'bank', value: 'hunter2' })
    const insertion = await vault.mintInsertion(ref, 'password')
    expect(insertion.ephemeral).toBe(true)
    expect(JSON.stringify(insertion)).not.toContain('hunter2')
    expect(await vault.isLive(ref)).toBe(true)
    await vault.revoke(ref.ref)
    expect(await vault.isLive(ref)).toBe(false)
  })
})

describe('delegation model', () => {
  it('permits "for" and refuses "as"', () => {
    expect(() => assertDelegation('for', 'for')).not.toThrow()
    expect(() => assertDelegation('for', 'as')).toThrow(/delegation_violation/)
  })
})
