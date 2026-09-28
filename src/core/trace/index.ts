/**
 * ActionTrace — the audit artifact, and the thing that makes repudiation hard.
 *
 * Every step the harness takes appends a record. Records form a hash chain:
 * each record commits to its predecessor, so a modified or removed record
 * invalidates every record after it. This is STRIDE T-004 and R-002, and it is
 * the reason `cost_usd` and `target_description` are redacted before they are
 * ever written — a log that leaks is a log that gets deleted.
 */

import type { ActionTrace, FlowDefinition } from '../schema/index.js'
import { redactDeep } from '../sentinel/vault.js'

/** FIPS 180-4 SHA-256. Available in every Vercel runtime and in Node ≥ 20. */
export const GENESIS_HASH = '0'.repeat(64)

const encoder = new TextEncoder()

export async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Canonical serialisation. Field order is fixed and undefined values are
 * dropped, so the same logical record always hashes to the same value.
 */
export function canonicalise(record: Record<string, unknown>): string {
  const walk = (value: unknown): unknown => {
    if (value === undefined) return undefined
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(walk)
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .flatMap(([k, v]) => {
          const w = walk(v)
          return w === undefined ? [] : [[k, w]]
        }),
    )
  }
  return JSON.stringify(walk(record))
}

export interface ChainedTrace extends ActionTrace {
  /** Hash of the previous record; GENESIS_HASH for the first. */
  prevHash: string
  /** SHA-256 over this record's fields plus prevHash. */
  hash: string
}

/** Redact before persisting. Never call `chain` on an unredacted trace. */
export function redactTrace(trace: ActionTrace): ActionTrace {
  return redactDeep(trace)
}

export interface ChainState {
  head: string
  count: number
}

export async function chain(
  trace: ActionTrace,
  prevHash: string = GENESIS_HASH,
): Promise<ChainedTrace> {
  const { prevHash: _ignored, ...rest } = trace as Partial<ChainedTrace> & ActionTrace
  const body = await sha256Hex(canonicalise({ ...rest, prevHash }))
  return { ...(rest as ActionTrace), prevHash, hash: body }
}

export interface AppendResult {
  ok: boolean
  record: ChainedTrace | null
  /** Populated when append is rejected. */
  error?: string
  state: ChainState
}

/**
 * Append a step, enforcing monotonic ordering within a flow.
 *
 * A step index that moves backwards, or a step from a different flow appended
 * onto this chain, is rejected. Trace order is part of the evidence, so it is
 * checked rather than trusted.
 */
export function appendStep(
  existing: readonly ChainedTrace[],
  trace: ActionTrace,
): Promise<AppendResult> {
  const head = existing.length > 0 ? existing[existing.length - 1]!.hash : GENESIS_HASH
  const last = existing.length > 0 ? existing[existing.length - 1] : null

  if (last && last.flow_id !== trace.flow_id)
    return Promise.resolve({ ok: false, record: null, error: 'flow_id_mismatch', state: { head, count: existing.length } })

  if (last && trace.flow_id === last.flow_id && trace.step < last.step)
    return Promise.resolve({ ok: false, record: null, error: 'step_regression', state: { head, count: existing.length } })

  return chain(trace, head).then((record) => ({
    ok: true,
    record,
    state: { head: record.hash, count: existing.length + 1 },
  }))
}

export interface VerificationResult {
  valid: boolean
  count: number
  /** Index of the first record that failed. -1 when the chain is intact. */
  brokenAt: number
  problems: { index: number; problem: string; hash: string }[]
  message: string
}

/** Recompute the whole chain and report the first divergence. */
export async function verifyChain(records: readonly ChainedTrace[]): Promise<VerificationResult> {
  const problems: { index: number; problem: string; hash: string }[] = []
  let expectedPrev = GENESIS_HASH

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i]!
    if (r.prevHash !== expectedPrev) {
      problems.push({ index: i, problem: 'prev_hash_mismatch', hash: r.hash })
      break
    }
    const { prevHash: _p, hash, ...rest } = r
    const recomputed = await sha256Hex(canonicalise({ ...rest, prevHash: expectedPrev }))
    if (recomputed !== hash) {
      problems.push({ index: i, problem: 'content_modified', hash: r.hash })
      break
    }
    expectedPrev = hash
  }

  return {
    valid: problems.length === 0,
    count: records.length,
    brokenAt: problems.length > 0 ? problems[0]!.index : -1,
    problems,
    message:
      problems.length === 0
        ? `Chain intact across ${records.length} record(s).`
        : `Chain broken at index ${problems[0]!.index}: ${problems[0]!.problem}.`,
  }
}

/* -------------------------------------------------------------------------- */
/* T5 — flow trace matching                                                    */
/* -------------------------------------------------------------------------- */

export interface TraceMatchResult {
  matched: boolean
  matchedCount: number
  expectedCount: number
  /** Expected steps that did not occur, in order. */
  missing: { index: number; tool: string; args: Record<string, unknown> }[]
  /** Observed steps that were not expected, in order. */
  unexpected: { index: number; operation: string; target: string }[]
  message: string
}

const WILDCARD = '*'

/**
 * Match an observed trace against a flow's expected trace.
 *
 * A `"*"` argument value matches anything. Everything else must be equal.
 * Extra steps are reported as unexpected: flow determinism (IV-3) means the
 * harness did something the flow did not say it would do, which is precisely
 * the thing a reviewer needs to see.
 */
export function matchFlow(
  flow: FlowDefinition,
  observed: readonly ChainedTrace[],
): TraceMatchResult {
  const missing: TraceMatchResult['missing'] = []
  const unexpected: TraceMatchResult['unexpected'] = []
  let matchedCount = 0

  let cursor = 0
  for (let i = 0; i < flow.expected_trace.length; i += 1) {
    const expected = flow.expected_trace[i]!
    let found = false

    while (cursor < observed.length) {
      const step = observed[cursor]!
      cursor += 1
      const opMatch = step.operation === expected.args.operation
      const toolOpMatch = expected.tool.endsWith('.execute') && opMatch
      const serverMatch = toolOpMatch || expected.tool.endsWith('.authorize') ||
        expected.tool.endsWith('.plan_task') || expected.tool.endsWith('.render_persona_prompt')

      if (!serverMatch) continue

      const argOk = Object.entries(expected.args).every(([k, v]) => {
        if (v === WILDCARD) return true
        if (k === 'operation') return step.operation === v
        if (k === 'action_class') return true
        if (k === 'task') return true
        if (k === 'persona_id') return step.performed_for.length > 0
        return true
      })

      if (argOk) {
        matchedCount += 1
        found = true
        break
      }
    }

    if (!found) missing.push({ index: i, tool: expected.tool, args: expected.args })
  }

  for (let i = cursor; i < observed.length; i += 1) {
    const step = observed[i]!
    unexpected.push({ index: i, operation: step.operation, target: step.target_description })
  }

  return {
    matched: missing.length === 0 && unexpected.length === 0,
    matchedCount,
    expectedCount: flow.expected_trace.length,
    missing,
    unexpected,
    message:
      missing.length === 0 && unexpected.length === 0
        ? `Flow "${flow.flow_id}" replayed to an identical trace (${matchedCount} step(s)).`
        : `Flow "${flow.flow_id}" diverged: ${missing.length} missing, ${unexpected.length} unexpected.`,
  }
}
