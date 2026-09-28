/** ActionTrace — 9 tests. */

import { describe, expect, it } from 'vitest'
import {
  GENESIS_HASH,
  appendStep,
  canonicalise,
  matchFlow,
  redactTrace,
  sha256Hex,
  verifyChain,
} from '@core/index.js'
import { VALID_FLOW, chainTraces, makeTrace } from './fixtures.js'

describe('canonicalisation and hashing', () => {
  it('produces identical output regardless of key order', () => {
    expect(canonicalise({ b: 2, a: 1 })).toBe(canonicalise({ a: 1, b: 2 }))
  })

  it('produces a 64-character lowercase digest', async () => {
    const h = await sha256Hex('soulbot')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('chain construction', () => {
  it('links the first record to the genesis hash', async () => {
    const [first] = await chainTraces([makeTrace()])
    expect(first?.prevHash).toBe(GENESIS_HASH)
  })

  it('links each record to its predecessor', async () => {
    const records = await chainTraces([makeTrace({ step: 0 }), makeTrace({ step: 1 })])
    expect(records[1]?.prevHash).toBe(records[0]?.hash)
  })

  it('rejects a step that moves backwards within a flow', async () => {
    const first = await appendStep([], makeTrace({ step: 3 }))
    expect(first.ok).toBe(true)
    const backwards = await appendStep(first.record ? [first.record] : [], makeTrace({ step: 1 }))
    expect(backwards.ok).toBe(false)
    expect(backwards.error).toBe('step_regression')
  })

  it('rejects a record from a different flow', async () => {
    const first = await appendStep([], makeTrace({ flow_id: 'flow_001' }))
    const other = await appendStep(first.record ? [first.record] : [], makeTrace({ flow_id: 'flow_002', step: 9 }))
    expect(other.ok).toBe(false)
    expect(other.error).toBe('flow_id_mismatch')
  })
})

describe('verification', () => {
  it('verifies an intact chain', async () => {
    const records = await chainTraces([0, 1, 2, 3].map((step) => makeTrace({ step })))
    const v = await verifyChain(records)
    expect(v.valid).toBe(true)
    expect(v.count).toBe(4)
    expect(v.brokenAt).toBe(-1)
  })

  it('catches a modified record and names the index', async () => {
    const records = await chainTraces([0, 1, 2].map((step) => makeTrace({ step })))
    const tampered = records.map((r, i) => (i === 1 ? { ...r, success: !r.success, cost_usd: 99 } : r))
    const v = await verifyChain(tampered)
    expect(v.valid).toBe(false)
    expect(v.brokenAt).toBe(1)
    expect(v.problems[0]?.problem).toBe('content_modified')
  })

  it('catches a removed record, because the link no longer resolves', async () => {
    const records = await chainTraces([0, 1, 2].map((step) => makeTrace({ step })))
    const v = await verifyChain([records[0]!, records[2]!])
    expect(v.valid).toBe(false)
    expect(v.brokenAt).toBe(1)
  })

  it('redacts secrets before persistence without inverting a value', () => {
    const redacted = redactTrace(makeTrace({ target_description: 'password=hunter2' }))
    expect(redacted.target_description).toContain('[redacted]')
    expect(redacted.target_description).not.toContain('hunter2')
  })
})

describe('flow matching (T5)', () => {
  const observedSteps = () =>
    chainTraces([
      makeTrace({ step: 0, actor: 'ahph-engine.render_persona_prompt', operation: 'wait' }),
      makeTrace({ step: 1, actor: 'ahph-task.plan_task', operation: 'wait' }),
      makeTrace({ step: 2, actor: 'ahph-sentinel.authorize', operation: 'wait' }),
      makeTrace({ step: 3, actor: 'ahph-browser.execute', operation: 'fill' }),
      makeTrace({ step: 4, actor: 'ahph-browser.execute', operation: 'click' }),
    ])

  it('matches a flow whose expected steps all occurred', async () => {
    const m = matchFlow(VALID_FLOW, await observedSteps())
    expect(m.missing).toHaveLength(0)
    expect(m.unexpected).toHaveLength(0)
    expect(m.matched).toBe(true)
  })

  it('reports an expected step that never happened', async () => {
    const records = await chainTraces([makeTrace({ step: 0, actor: 'ahph-engine.render_persona_prompt' })])
    const m = matchFlow(VALID_FLOW, records)
    expect(m.matched).toBe(false)
    expect(m.missing[0]?.tool).toBe('ahph-task.plan_task')
  })

  it('reports an unexpected step, because determinism is a requirement', async () => {
    /* A full match, plus one step the flow never declared. */
    const records = await chainTraces([
      makeTrace({ step: 0, actor: 'ahph-engine.render_persona_prompt', operation: 'wait' }),
      makeTrace({ step: 1, actor: 'ahph-task.plan_task', operation: 'wait' }),
      makeTrace({ step: 2, actor: 'ahph-sentinel.authorize', operation: 'wait' }),
      makeTrace({ step: 3, actor: 'ahph-browser.execute', operation: 'fill' }),
      makeTrace({ step: 4, actor: 'ahph-browser.execute', operation: 'click' }),
      makeTrace({ step: 5, actor: 'ahph-browser.execute', operation: 'scroll', target_description: 'an extra step' }),
    ])
    const m = matchFlow(VALID_FLOW, records)
    expect(m.unexpected).toHaveLength(1)
    expect(m.unexpected[0]?.target).toBe('an extra step')
    expect(m.matched).toBe(false)
  })
})
