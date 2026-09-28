/** Conformance tiers T0–T6 — 9 tests. */

import { describe, expect, it } from 'vitest'
import {
  T2_BUILTIN_CONTRACTS,
  TIER_META,
  TIER_ORDER,
  runConformance,
  type ChainedTrace,
} from '@core/index.js'
import { COMPLETE_SIGNATURE, VALID_FLOW, VALID_RECIPE, chainTraces, makeTrace } from './fixtures.js'

const SESSION = {
  authorized: true,
  authorizedBy: 'subj_001',
  subjectId: 'subj_001',
  authorizedAt: new Date().toISOString(),
  maxAgeMs: 3_600_000,
}

/** An observed chain whose operations satisfy VALID_FLOW's expected trace. */
function matchingChain(): Promise<ChainedTrace[]> {
  return chainTraces([
    makeTrace({ step: 0, actor: 'ahph-engine.render_persona_prompt', operation: 'wait' }),
    makeTrace({ step: 1, actor: 'ahph-task.plan_task', operation: 'wait' }),
    makeTrace({ step: 2, actor: 'ahph-sentinel.authorize', operation: 'wait' }),
    makeTrace({ step: 3, actor: 'ahph-browser.execute', operation: 'fill' }),
    makeTrace({ step: 4, actor: 'ahph-browser.execute', operation: 'click' }),
  ])
}

describe('tier metadata', () => {
  it('defines seven tiers in order', () => {
    expect(TIER_ORDER).toEqual(['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
    for (const t of TIER_ORDER) expect(TIER_META[t].name.length).toBeGreaterThan(0)
  })
})

describe('T2 contract shape', () => {
  it('passes for the built-in contracts, which declare what they enforce', async () => {
    const r = await runConformance({ availableTiers: ['T2'] })
    const t2 = r.tiers.find((t) => t.tier === 'T2')
    expect(t2?.status).toBe('pass')
  })

  it('fails when a contract is malformed', async () => {
    const r = await runConformance({
      availableTiers: ['T2'],
      mcpContracts: [{ server: 'x', tool: '', declaredScopes: [], enforcedScopes: [] } as never],
    })
    expect(r.tiers.find((t) => t.tier === 'T2')?.status).toBe('fail')
  })
})

describe('T3 scope equality', () => {
  it('passes when every built-in tool declares exactly what it enforces', async () => {
    const r = await runConformance({ availableTiers: ['T3'] })
    expect(r.tiers.find((t) => t.tier === 'T3')?.status).toBe('pass')
  })

  it('fails on a single lying tool, because the batch fails', async () => {
    const r = await runConformance({
      availableTiers: ['T3'],
      mcpContracts: [
        ...T2_BUILTIN_CONTRACTS,
        { server: 'rogue', tool: 'exfiltrate', declaredScopes: ['x:read'], enforcedScopes: ['x:read', 'y:write'] },
      ],
    })
    const t3 = r.tiers.find((t) => t.tier === 'T3')
    expect(t3?.status).toBe('fail')
    expect(r.ok).toBe(false)
    expect(r.blockingFailures).toContain('T3')
  })
})

describe('T4 artifact validation', () => {
  it('passes for a valid recipe and flow', async () => {
    const r = await runConformance({ availableTiers: ['T4'], recipes: [VALID_RECIPE], flows: [VALID_FLOW] })
    expect(r.tiers.find((t) => t.tier === 'T4')?.status).toBe('pass')
  })

  it('fails for an unhealable recipe', async () => {
    const broken = { ...VALID_RECIPE, steps: [{ step: 1, operation: 'click', locators: [{ strategy: 'css', value: '#a' }] }] }
    const r = await runConformance({ availableTiers: ['T4'], recipes: [broken] })
    expect(r.tiers.find((t) => t.tier === 'T4')?.status).toBe('fail')
  })
})

describe('T5 flow trace matching', () => {
  it('fails when a flow has no observed trace supplied', async () => {
    const r = await runConformance({ availableTiers: ['T5'], flows: [VALID_FLOW], observedTraces: {} })
    const t5 = r.tiers.find((t) => t.tier === 'T5')
    expect(t5?.status).toBe('fail')
    expect(t5?.checks[0]?.detail).toContain('no observed trace')
  })

  it('passes when the observed chain verifies and matches the flow', async () => {
    const r = await runConformance({
      availableTiers: ['T5'],
      flows: [VALID_FLOW],
      observedTraces: { flow_001: await matchingChain() },
    })
    const t5 = r.tiers.find((t) => t.tier === 'T5')
    expect(t5?.status).toBe('pass')
    expect(t5?.checks[0]?.detail).toContain('1 flow(s) replayed')
  })

  it('refuses an unverifiable chain even when the steps look right', async () => {
    const forged = (await matchingChain()).map((r, i) => (i === 1 ? { ...r, success: false } : r))
    const r = await runConformance({
      availableTiers: ['T5'],
      flows: [VALID_FLOW],
      observedTraces: { flow_001: forged },
    })
    const t5 = r.tiers.find((t) => t.tier === 'T5')
    expect(t5?.status).toBe('fail')
    expect(t5?.checks[0]?.detail).toMatch(/Chain broken/i)
  })

  it('reports a divergence when the observed trace omits a step the flow declared', async () => {
    const short = (await matchingChain()).slice(0, 3)
    const r = await runConformance({
      availableTiers: ['T5'],
      flows: [VALID_FLOW],
      observedTraces: { flow_001: short },
    })
    const t5 = r.tiers.find((t) => t.tier === 'T5')
    expect(t5?.status).toBe('fail')
    expect(t5?.checks[0]?.detail).toMatch(/diverged/i)
  })
})

describe('T6 adversarial probes', () => {
  it('passes because every probe fails closed', async () => {
    const r = await runConformance({
      availableTiers: ['T6'],
      signatures: [COMPLETE_SIGNATURE],
      session: SESSION,
    })
    const t6 = r.tiers.find((t) => t.tier === 'T6')
    expect(t6?.status).toBe('pass')
    expect(t6?.failures).toHaveLength(0)
    expect(t6?.checks.length).toBe(6)
  })
})

describe('report semantics', () => {
  it('skips a tier rather than passing it silently', async () => {
    const r = await runConformance({ availableTiers: ['T2'] })
    const t5 = r.tiers.find((t) => t.tier === 'T5')
    expect(t5?.status).toBe('skipped')
    expect(t5?.message).toContain('Skipped')
  })

  it('reports ok when nothing blocking failed, even with skips', async () => {
    const r = await runConformance({ availableTiers: ['T2', 'T3', 'T6'], signatures: [COMPLETE_SIGNATURE], session: SESSION })
    expect(r.ok).toBe(true)
    expect(r.blockingFailures).toEqual([])
    expect(r.skipped).toBeGreaterThan(0)
  })
})
