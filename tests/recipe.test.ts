/** Recipe and Flow validation — 11 tests (T4 + T5). */

import { describe, expect, it } from 'vitest'
import {
  REPLAY_TRUST_FLOOR,
  parseRecipe,
  parseSuccessCondition,
  replayStats,
  validateFlow,
  validateRecipe,
  type Recipe,
} from '@core/index.js'
import { VALID_FLOW, VALID_RECIPE } from './fixtures.js'

const problems = (r: { problems: { problem: string }[] }) => r.problems.map((p) => p.problem)

describe('success condition grammar', () => {
  it('parses the four supported forms and rejects anything else', () => {
    expect(parseSuccessCondition('url_contains:/confirmation')).toEqual({ kind: 'url_contains', fragment: '/confirmation' })
    expect(parseSuccessCondition('selector_present:#done')).toEqual({ kind: 'selector_present', selector: '#done' })
    expect(parseSuccessCondition('steps_complete')).toEqual({ kind: 'steps_complete' })
    expect(parseSuccessCondition('trace_matches')).toEqual({ kind: 'trace_matches' })
    expect(parseSuccessCondition('the page felt right')).toBeNull()
  })
})

describe('T4 recipe validation', () => {
  it('accepts a healable recipe and reports which steps can be healed', () => {
    const r = validateRecipe(VALID_RECIPE)
    expect(r.ok).toBe(true)
    expect(r.healableSteps).toEqual([2, 3])
    expect(r.locatorCount).toBe(4)
  })

  it('rejects a single-locator step, because it cannot be healed', () => {
    const broken: Recipe = {
      ...VALID_RECIPE,
      steps: [
        { step: 1, operation: 'navigate', url: 'https://example.test', locators: [] },
        { step: 2, operation: 'click', locators: [{ strategy: 'css', value: '#confirm' }] },
      ],
    }
    const r = validateRecipe(broken)
    expect(r.ok).toBe(false)
    expect(problems(r)).toContain('only_one_locator')
  })

  it('rejects an element-addressing step with no locator', () => {
    const broken: Recipe = { ...VALID_RECIPE, steps: [{ step: 1, operation: 'click', locators: [] }] }
    expect(problems(validateRecipe(broken))).toContain('executable_step_without_locator')
  })

  it('rejects a document-wide CSS selector', () => {
    const broken: Recipe = {
      ...VALID_RECIPE,
      steps: [
        { step: 1, operation: 'click', locators: [{ strategy: 'css', value: 'body' }, { strategy: 'css', value: '#c' }] },
      ],
    }
    expect(problems(validateRecipe(broken))).toContain('css_locator_too_broad')
  })

  it('rejects non-contiguous step numbers', () => {
    const broken: Recipe = {
      ...VALID_RECIPE,
      steps: [
        { step: 1, operation: 'navigate', url: 'https://example.test', locators: [] },
        { step: 3, operation: 'click', locators: [{ strategy: 'css', value: '#a' }, { strategy: 'css', value: '#b' }] },
      ],
    }
    expect(problems(validateRecipe(broken))).toContain('step_numbers_not_contiguous')
  })

  it('rejects a navigate step with no url, and an untraceable operation', () => {
    const broken: Recipe = {
      ...VALID_RECIPE,
      steps: [
        { step: 1, operation: 'navigate', locators: [] },
        {
          step: 2,
          /* Deliberately not a traceable operation; the literal type cannot
           * express it, which is the point — it has to survive a cast to reach
           * the validator. */
          operation: 'teleport' as Recipe['steps'][number]['operation'],
          locators: [
            { strategy: 'css', value: '#a' },
            { strategy: 'css', value: '#b' },
          ],
        },
      ],
    }
    const found = problems(validateRecipe(broken))
    expect(found).toContain('navigate_without_url')
    expect(found).toContain('step_operation_unknown')
  })

  it('rejects a recipe that fails the schema, before T4 ever runs', () => {
    const r = parseRecipe({ ...VALID_RECIPE, recipe_id: '' })
    expect(r.ok).toBe(false)
  })
})

describe('T5 flow validation', () => {
  it('accepts a flow that routes its guarded action through the Sentinel', () => {
    const r = validateFlow(VALID_FLOW)
    expect(r.ok).toBe(true)
    expect(r.guardedSteps).toBe(1)
  })

  it('rejects a flow with no Sentinel step at all', () => {
    const r = validateFlow({ ...VALID_FLOW, expected_trace: [{ tool: 'ahph-browser.execute', args: { operation: 'read' } }] })
    expect(problems(r)).toContain('no_sentinel_authorization')
  })

  it('rejects a flow that performs a guarded action the Sentinel did not authorize', () => {
    const r = validateFlow({
      ...VALID_FLOW,
      expected_trace: [
        { tool: 'ahph-sentinel.authorize', args: { action_class: 'read' } },
        { tool: 'ahph-browser.execute', args: { operation: 'click', action_class: 'submit_form' } },
      ],
    })
    const found = problems(r)
    expect(found).toContain('guarded_action_unguarded_by_sentinel')
    expect(r.guardedSteps).toBe(1)
  })

  it('rejects a flow with no budget and an unparseable success condition', () => {
    const r = validateFlow({ ...VALID_FLOW, max_tokens: 0, max_cost_usd: 0, success_condition: 'looked fine' })
    const found = problems(r)
    expect(found).toContain('budget_missing')
    expect(found).toContain('no_success_condition')
  })
})

describe('replay trust', () => {
  it('does not replay a recipe that fails more than a third of its runs', () => {
    const u = replayStats({ runs: 10, successes: 4, heal_events: 3 })
    expect(u.successRate).toBeLessThan(REPLAY_TRUST_FLOOR)
    expect(u.trustworthy).toBe(false)
  })

  it('marks a well-replayed recipe as trustworthy', () => {
    const u = replayStats({ runs: 20, successes: 19, heal_events: 4 })
    expect(u.successRate).toBeGreaterThan(REPLAY_TRUST_FLOOR)
    expect(u.trustworthy).toBe(true)
  })

  it('treats a never-replayed recipe as untrustworthy rather than perfect', () => {
    expect(replayStats({ runs: 0, successes: 0, heal_events: 0 }).trustworthy).toBe(false)
  })
})
