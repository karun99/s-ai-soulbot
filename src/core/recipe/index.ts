/**
 * Recipe and flow validation — conformance tiers T4 and T5.
 *
 * A Recipe is a recorded task: an ordered set of steps, each with several
 * locators, plus a condition that decides whether the run succeeded. It is
 * designed to replay with zero model calls, which is only true if the artifact
 * is complete and unambiguous. T4 is the check that it is.
 */

import {
  FlowDefinition,
  Recipe,
  type Locator,
  type Recipe as RecipeType,
  type RecipeStep,
} from '../schema/index.js'
import { classOf, isGuarded, type ActionClass } from '../sentinel/actions.js'

export type T4Problem =
  | 'step_operation_unknown'
  | 'executable_step_without_locator'
  | 'navigate_without_url'
  | 'success_condition_unparseable'
  | 'locator_strategy_unsupported'
  | 'css_locator_too_broad'
  | 'only_one_locator'
  | 'step_numbers_not_contiguous'

export interface T4Result {
  ok: boolean
  problems: { problem: T4Problem; step?: number; detail: string }[]
  locatorCount: number
  /** Steps with more than one locator, which is what makes healing possible. */
  healableSteps: number[]
  message: string
}

/** Steps that address an element and therefore need a locator. */
const NEEDS_LOCATOR = new Set(['click', 'fill', 'select', 'scroll'])

/** A bare `*` or `#` CSS selector matches everything and is never intentional. */
function isTooBroadCss(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === '*' || trimmed === '#' || trimmed === 'div' || trimmed === 'body' || trimmed === ''
}

/**
 * Success conditions are a small, closed grammar. Parsing them is what lets a
 * replay decide pass or fail without a model in the loop.
 *
 *   url_contains:<fragment>   — current URL contains the fragment
 *   selector_present:<css>    — selector matches at least one node
 *   steps_complete            — every step ran
 *   trace_matches             — the observed trace matches the flow
 */
export function parseSuccessCondition(condition: string):
  | { kind: 'url_contains'; fragment: string }
  | { kind: 'selector_present'; selector: string }
  | { kind: 'steps_complete' }
  | { kind: 'trace_matches' }
  | null {
  const trimmed = condition.trim()
  if (trimmed === 'steps_complete') return { kind: 'steps_complete' }
  if (trimmed === 'trace_matches') return { kind: 'trace_matches' }
  if (trimmed.startsWith('url_contains:')) {
    const fragment = trimmed.slice('url_contains:'.length)
    return fragment.length > 0 ? { kind: 'url_contains', fragment } : null
  }
  if (trimmed.startsWith('selector_present:')) {
    const selector = trimmed.slice('selector_present:'.length)
    return selector.length > 0 ? { kind: 'selector_present', selector } : null
  }
  return null
}

export function validateRecipe(recipe: RecipeType): T4Result {
  const problems: T4Result['problems'] = []
  let locatorCount = 0
  const healableSteps: number[] = []

  for (const step of recipe.steps) {
    if (!classOf(step.operation)) {
      problems.push({
        problem: 'step_operation_unknown',
        step: step.step,
        detail: `operation "${step.operation}" is not a traceable operation.`,
      })
    }

    if (NEEDS_LOCATOR.has(step.operation) && step.locators.length === 0) {
      problems.push({
        problem: 'executable_step_without_locator',
        step: step.step,
        detail: `"${step.operation}" addresses an element but has no locator.`,
      })
    }

    if (step.operation === 'navigate' && !step.url) {
      problems.push({
        problem: 'navigate_without_url',
        step: step.step,
        detail: 'navigate step has no url.',
      })
    }

    locatorCount += step.locators.length
    if (step.locators.length > 1) healableSteps.push(step.step)

    if (step.locators.length === 1) {
      problems.push({
        problem: 'only_one_locator',
        step: step.step,
        detail: 'a single locator cannot be healed when the site changes.',
      })
    }

    for (const loc of step.locators) {
      if (loc.strategy === 'css' && isTooBroadCss(loc.value)) {
        problems.push({
          problem: 'css_locator_too_broad',
          step: step.step,
          detail: `css selector "${loc.value}" matches the whole document.`,
        })
      }
      if (loc.strategy === 'role_name' && loc.name.trim() === '') {
        problems.push({
          problem: 'locator_strategy_unsupported',
          step: step.step,
          detail: 'role_name locator has an empty accessible name.',
        })
      }
    }
  }

  const numbers = recipe.steps.map((s) => s.step)
  const contiguous = numbers.every((n, i) => n === i + 1)
  if (!contiguous) {
    problems.push({
      problem: 'step_numbers_not_contiguous',
      detail: `expected 1..${numbers.length}, got ${numbers.join(', ')}.`,
    })
  }

  if (!parseSuccessCondition(recipe.verification.success_condition)) {
    problems.push({
      problem: 'success_condition_unparseable',
      detail: `"${recipe.verification.success_condition}" is outside the supported grammar.`,
    })
  }

  const ok = problems.length === 0
  return {
    ok,
    problems,
    locatorCount,
    healableSteps,
    message: ok
      ? `Recipe "${recipe.recipe_id}" is valid: ${recipe.steps.length} step(s), ${locatorCount} locator(s), ${healableSteps.length} healable.`
      : `Recipe "${recipe.recipe_id}" has ${problems.length} problem(s): ${problems.map((p) => p.problem).join(', ')}.`,
  }
}

/**
 * Parse and validate in one step. Rejects rather than repairs: a malformed
 * artifact should fail loudly, not be silently coerced.
 */
export function parseRecipe(input: unknown): { ok: true; recipe: RecipeType; t4: T4Result } | { ok: false; errors: string[] } {
  const parsed = Recipe.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`) }
  }
  const t4 = validateRecipe(parsed.data)
  if (!t4.ok) return { ok: false, errors: t4.problems.map((p) => (p.step ? `step ${p.step}: ${p.detail}` : p.detail)) }
  return { ok: true, recipe: parsed.data, t4 }
}

/* -------------------------------------------------------------------------- */
/* Flow validation                                                             */
/* -------------------------------------------------------------------------- */

export type T5Problem =
  | 'budget_missing'
  | 'no_sentinel_authorization'
  | 'no_success_condition'
  | 'guarded_action_unguarded_by_sentinel'
  | 'empty_expected_trace'

export interface T5Result {
  ok: boolean
  problems: { problem: T5Problem; detail: string }[]
  /** Guarded operations the flow declares. */
  guardedSteps: number
  message: string
}

/**
 * Validate a flow definition.
 *
 * The substantive check is that a flow containing a guarded action must also
 * declare a Sentinel authorization step for it. A flow that submits a form
 * without routing through the Sentinel is not a valid flow, regardless of
 * whether its expected trace would pass a naive matcher.
 */
export function validateFlow(flow: FlowDefinition): T5Result {
  const problems: T5Result['problems'] = []

  if (flow.max_tokens <= 0 || flow.max_cost_usd <= 0)
    problems.push({ problem: 'budget_missing', detail: 'flow must declare a positive token and cost ceiling.' })

  if (flow.expected_trace.length === 0)
    problems.push({ problem: 'empty_expected_trace', detail: 'flow declares no expected trace.' })

  if (!parseSuccessCondition(flow.success_condition))
    problems.push({ problem: 'no_success_condition', detail: `"${flow.success_condition}" is outside the supported grammar.'` })

  const sentinelSteps = flow.expected_trace.filter((s) => s.tool.endsWith('.authorize'))
  if (sentinelSteps.length === 0) {
    problems.push({
      problem: 'no_sentinel_authorization',
      detail: 'flow contains no Sentinel authorization step; the Sentinel is the sole authority.',
    })
  }

  const declaredActionClasses = new Set(
    sentinelSteps.map((s) => (typeof s.args.action_class === 'string' ? s.args.action_class : '')).filter(Boolean),
  )

  let guardedSteps = 0
  for (const step of flow.expected_trace) {
    if (!step.tool.endsWith('.execute')) continue
    /* A step may declare the action class it needs directly. Falling back to the
     * raw operation is not enough: `click` and `fill` are ungated primitives,
     * while the same click on a submit button is `submit_form`. The step that
     * knows the difference has to say so. */
    const declared = typeof step.args.action_class === 'string' ? step.args.action_class : ''
    const op = typeof step.args.operation === 'string' ? step.args.operation : ''
    const actionClass = declared || classOf(op)
    if (!actionClass) continue
    if (!isGuarded(actionClass as ActionClass)) continue
    guardedSteps += 1
    if (!declaredActionClasses.has(actionClass)) {
      problems.push({
        problem: 'guarded_action_unguarded_by_sentinel',
        detail: `flow performs guarded "${actionClass}" but declares no Sentinel authorization for action class "${actionClass}".`,
      })
    }
  }

  const ok = problems.length === 0
  return {
    ok,
    problems,
    guardedSteps,
    message: ok
      ? `Flow "${flow.flow_id}" is valid: ${flow.expected_trace.length} expected step(s), ${guardedSteps} guarded.`
      : `Flow "${flow.flow_id}" has ${problems.length} problem(s): ${problems.map((p) => p.problem).join(', ')}.`,
  }
}

export function parseFlow(input: unknown): { ok: true; flow: FlowDefinition; t5: T5Result } | { ok: false; errors: string[] } {
  const parsed = FlowDefinition.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`) }
  }
  const t5 = validateFlow(parsed.data)
  if (!t5.ok) return { ok: false, errors: t5.problems.map((p) => p.detail) }
  return { ok: true, flow: parsed.data, t5 }
}

/* -------------------------------------------------------------------------- */
/* Replay accounting                                                           */
/* -------------------------------------------------------------------------- */

export interface ReplayStatsUpdate {
  runs: number
  successes: number
  successRate: number
  healEvents: number
  /** Below this, the recipe should be re-derived rather than replayed. */
  trustworthy: boolean
  message: string
}

/** Trust floor. A recipe that fails more than a third of its runs is not replayed. */
export const REPLAY_TRUST_FLOOR = 0.67

export function replayStats(stats: { runs: number; successes: number; heal_events: number }): ReplayStatsUpdate {
  const rate = stats.runs === 0 ? 0 : stats.successes / stats.runs
  /* Zero runs is not a perfect record. It is no record, so it is not trusted. */
  const trustworthy = stats.runs > 0 && rate >= REPLAY_TRUST_FLOOR
  return {
    runs: stats.runs,
    successes: stats.successes,
    successRate: Number(rate.toFixed(4)),
    healEvents: stats.heal_events,
    trustworthy,
    message: stats.runs === 0
      ? 'Never replayed. Not yet trustworthy.'
      : trustworthy
        ? `${stats.successes}/${stats.runs} replays succeeded (${(rate * 100).toFixed(1)}%).`
        : `Only ${(rate * 100).toFixed(1)}% of ${stats.runs} replays succeeded. Re-derive before replaying.`,
  }
}

export type { Locator, RecipeStep }
