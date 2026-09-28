/**
 * T3 — scope equality.
 *
 * A tool declares the scopes it will use. The runtime enforces a set. If the
 * enforced set is not exactly the declared set — in either direction — the
 * declaration is a lie, and the call does not proceed. This is the single
 * check behind STRIDE E-001 (scope bypass) and invariant IV-4.
 *
 * Exact equality, not containment. A tool that declares two scopes and enforces
 * one is under-enforcing relative to its own contract; a tool that declares one
 * and enforces two is over-enforcing and has escalated without approval. Both
 * fail.
 */

import { SEVERITY_RANK } from '../schema/index.js'

export interface ScopeDeclaration {
  /** Server or tool declaring the scopes. */
  source: string
  /** Scopes the tool states it will use. */
  declared: readonly string[]
  /** Scopes the runtime will actually allow. */
  enforced: readonly string[]
}

export type ScopeEqualityFailure =
  | 'enforced_missing_declared'
  | 'enforced_exceeds_declared'
  | 'duplicate_declared'
  | 'empty_declared'

export interface ScopeEqualityResult {
  equal: boolean
  failures: ScopeEqualityFailure[]
  /** Scopes the declaration promised but the runtime would not permit. */
  underEnforced: string[]
  /** Scopes the runtime would permit that were never declared. */
  overEnforced: string[]
  severity: 'critical' | 'none'
  message: string
}

const SEVERITY_MESSAGE: Record<ScopeEqualityFailure, string> = {
  enforced_missing_declared: 'a declared scope would not be enforced',
  enforced_exceeds_declared: 'an undeclared scope would be enforced',
  duplicate_declared: 'the declaration contains duplicates',
  empty_declared: 'the declaration is empty',
}

export function checkScopeEquality(decl: ScopeDeclaration): ScopeEqualityResult {
  const failures: ScopeEqualityFailure[] = []
  const declaredSet = new Set(decl.declared)
  const enforcedSet = new Set(decl.enforced)

  if (declaredSet.size === 0) failures.push('empty_declared')
  if (declaredSet.size !== decl.declared.length) failures.push('duplicate_declared')

  const underEnforced = [...declaredSet].filter((s) => !enforcedSet.has(s)).sort()
  const overEnforced = [...enforcedSet].filter((s) => !declaredSet.has(s)).sort()

  if (underEnforced.length > 0) failures.push('enforced_missing_declared')
  if (overEnforced.length > 0) failures.push('enforced_exceeds_declared')

  const equal = failures.length === 0
  const severity = equal ? 'none' : 'critical'

  const message = equal
    ? `${decl.source}: declared scope equals enforced scope (${declaredSet.size}).`
    : `${decl.source}: scope equality violated — ${failures.map((f) => SEVERITY_MESSAGE[f]).join('; ')}.`

  return { equal, failures, underEnforced, overEnforced, severity, message }
}

export interface McpToolContract {
  server: string
  tool: string
  declaredScopes: readonly string[]
  enforcedScopes: readonly string[]
}

/** T3 over a batch of MCP tool contracts. */
export function checkMcpContracts(contracts: readonly McpToolContract[]): {
  passed: number
  failed: number
  results: ScopeEqualityResult[]
  ok: boolean
} {
  const results = contracts.map((c) =>
    checkScopeEquality({
      source: `${c.server}.${c.tool}`,
      declared: c.declaredScopes,
      enforced: c.enforcedScopes,
    }),
  )
  const failed = results.filter((r) => !r.equal).length
  return { passed: results.length - failed, failed, results, ok: failed === 0 }
}

/** Severity comparator re-exported so callers need one import for triage. */
export { SEVERITY_RANK }
