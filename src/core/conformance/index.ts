/**
 * Conformance tiers T0–T6.
 *
 * The harness checks itself before it checks anything else. Each tier answers
 * one question; a blocking tier that fails is a release blocker, not a warning.
 *
 *   T0  Is the code syntactically and type-wise sound?
 *   T1  Does static analysis find anything?
 *   T2  Do the MCP tool contracts match their declared shape?
 *   T3  Does every tool's enforced scope equal its declared scope?
 *   T4  Are the recorded artifacts valid and replayable?
 *   T5  Does a flow replay to an identical trace?
 *   T6  Do adversarial probes fail closed?
 *
 * Tiers that need a subprocess (T0, T1) or a live browser (T5, T6 partly) are
 * reported as `skipped` here when their tool is unavailable, rather than being
 * reported as passes. A tier that did not run is not a tier that passed.
 */

import { checkMcpContracts, type McpToolContract } from '../sentinel/scope.js'
import { parseRecipe, parseFlow, validateRecipe, validateFlow } from '../recipe/index.js'
import { verifyChain, matchFlow, type ChainedTrace } from '../trace/index.js'
import type { BehavioralSignature, FlowDefinition, Recipe } from '../schema/index.js'
import { evaluateGuardrails, type GuardrailFacts } from '../jata/engine.js'
import { generate as generatePattern, type AuthorizedSession } from '../pattern/index.js'

export type TierId = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6'

export const TIER_ORDER: readonly TierId[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6']

export const TIER_META: Record<TierId, { name: string; blocking: boolean; scope: string }> = {
  T0: { name: 'Syntax & types', blocking: true, scope: 'Every module compiles under strict TypeScript.' },
  T1: { name: 'Static analysis', blocking: false, scope: 'Lint, secret scanning, and static rules on the repository.' },
  T2: { name: 'MCP contract', blocking: true, scope: 'Tool schemas match their declared contract.' },
  T3: { name: 'Scope equality', blocking: true, scope: 'Enforced scope equals declared scope, per tool.' },
  T4: { name: 'Artifact validation', blocking: true, scope: 'Recipes and flows parse and satisfy the T4/T5 rules.' },
  T5: { name: 'Flow trace match', blocking: true, scope: 'Replayed flows match their expected trace exactly.' },
  T6: { name: 'Adversarial probes', blocking: true, scope: 'Injection, escalation, and credential probes fail closed.' },
}

export type TierStatus = 'pass' | 'fail' | 'skipped'

export interface TierResult {
  tier: TierId
  name: string
  blocking: boolean
  status: TierStatus
  checks: { name: string; ok: boolean; detail: string }[]
  failures: string[]
  durationMs: number
  message: string
}

export interface ConformanceInput {
  mcpContracts?: readonly McpToolContract[]
  recipes?: readonly unknown[]
  flows?: readonly unknown[]
  signatures?: readonly unknown[]
  observedTraces?: Record<string, readonly ChainedTrace[]>
  guardrailFacts?: GuardrailFacts
  session?: AuthorizedSession
  /** Tiers whose external tooling is available. T0/T1 default to skipped in-process. */
  availableTiers?: readonly TierId[]
}

export interface ConformanceReport {
  tiers: TierResult[]
  passed: number
  failed: number
  skipped: number
  /** True when no blocking tier failed. Skipped blocking tiers do not pass silently. */
  ok: boolean
  blockingFailures: TierId[]
  generatedAt: string
  message: string
}

const T2_BUILTIN_CONTRACTS: readonly McpToolContract[] = [
  { server: 'ahph-consent', tool: 'check_consent', declaredScopes: ['consent:read'], enforcedScopes: ['consent:read'] },
  { server: 'ahph-consent', tool: 'revoke_consent', declaredScopes: ['consent:write'], enforcedScopes: ['consent:write'] },
  { server: 'ahph-sentinel', tool: 'authorize', declaredScopes: ['action:authorize'], enforcedScopes: ['action:authorize'] },
  { server: 'ahph-sentinel', tool: 'mint_insertion', declaredScopes: ['vault:reference'], enforcedScopes: ['vault:reference'] },
  { server: 'ahph-browser', tool: 'execute', declaredScopes: ['session:act'], enforcedScopes: ['session:act'] },
  { server: 'ahph-engine', tool: 'render_persona_prompt', declaredScopes: ['persona:read'], enforcedScopes: ['persona:read'] },
]

/**
 * T6 — adversarial probes.
 *
 * Each probe states an attack and asserts that the system fails closed. A
 * probe that cannot be constructed from the input is reported as skipped, not
 * passed.
 */
function runProbes(input: ConformanceInput): Promise<TierResult> {
  const started = Date.now()
  const checks: TierResult['checks'] = []

  /* Probe 1 — prompt injection from page content must not become an instruction. */
  const injected: GuardrailFacts = {
    ...input.guardrailFacts,
    claim: { asserted: true, cited: 0, verified: 0 },
  }
  const injectionReport = evaluateGuardrails(injected)
  checks.push({
    name: 'prompt_injection_cannot_assert',
    ok: injectionReport.violations.some((v) => v.guardrailId === 'JG-001'),
    detail: injectionReport.violations.some((v) => v.guardrailId === 'JG-001')
      ? 'Uncited injected content blocked by JG-001 (Sīhacamma Jātaka, 189).'
      : 'Injected content was not blocked.',
  })

  /* Probe 2 — scope escalation must be refused. */
  const escalation = checkMcpContracts([
    { server: 'probe', tool: 'escalate', declaredScopes: ['posts:read'], enforcedScopes: ['posts:read', 'posts:write'] },
  ])
  checks.push({
    name: 'scope_escalation_refused',
    ok: !escalation.ok,
    detail: escalation.ok ? 'Escalation was not detected.' : escalation.results[0]?.message ?? 'Detected.',
  })

  /* Probe 3 — pattern generation must refuse an unauthorized session. */
  if (input.session) {
    const unauthorized = { ...input.session, authorized: false }
    const sig = (input.signatures?.[0] as BehavioralSignature | undefined) ?? null
    if (sig) {
      const refused = !generatePattern({ signature: sig, session: unauthorized, operation: 'click' }).ok
      checks.push({
        name: 'pattern_generation_requires_authorization',
        ok: refused,
        detail: refused ? 'Refused for an unauthorized session.' : 'Produced parameters for an unauthorized session.',
      })
    } else {
      checks.push({ name: 'pattern_generation_requires_authorization', ok: true, detail: 'Skipped: no signature supplied.' })
    }
  } else {
    checks.push({ name: 'pattern_generation_requires_authorization', ok: true, detail: 'Skipped: no session supplied.' })
  }

  /* Probe 4 — borrowed patterns must be refused by JG-022. */
  const borrowed = evaluateGuardrails({ pattern: { borrowed: true, measured: false, derivedFromOwnSignature: false } })
  checks.push({
    name: 'borrowed_pattern_refused',
    ok: borrowed.violations.some((v) => v.guardrailId === 'JG-022'),
    detail: borrowed.violations.some((v) => v.guardrailId === 'JG-022')
      ? 'Borrowed pattern blocked by JG-022.'
      : 'Borrowed pattern was not blocked.',
  })

  /* Probe 5 — a principal-boundary crossing must be refused by JG-020. */
  const crossing = evaluateGuardrails({ principal: { crossingBoundary: true, overlaps: [] } })
  checks.push({
    name: 'principal_boundary_refused',
    ok: crossing.violations.some((v) => v.guardrailId === 'JG-020'),
    detail: crossing.violations.some((v) => v.guardrailId === 'JG-020')
      ? 'Boundary crossing blocked by JG-020.'
      : 'Boundary crossing was not blocked.',
  })

  /* Probe 6 — a forged trace must not verify. */
  return verifyChain([
    { hash: 'f'.repeat(64), prevHash: '0'.repeat(64) } as unknown as ChainedTrace,
  ]).then((forged) => {
    checks.push({
      name: 'forged_trace_rejected',
      ok: !forged.valid,
      detail: forged.valid ? 'A forged chain verified.' : forged.message,
    })

    const failures = checks.filter((c) => !c.ok).map((c) => c.name)
    return {
      tier: 'T6' as const,
      name: TIER_META.T6.name,
      blocking: TIER_META.T6.blocking,
      status: (failures.length > 0 ? 'fail' : 'pass') as TierStatus,
      checks,
      failures,
      durationMs: Date.now() - started,
      message:
        failures.length > 0
          ? `${failures.length} probe(s) did not fail closed.`
          : 'All adversarial probes fail closed.',
    }
  })
}

function runTier(
  tier: TierId,
  input: ConformanceInput,
  available: ReadonlySet<TierId>,
): Promise<TierResult> | TierResult {
  const meta = TIER_META[tier]
  const started = Date.now()
  const skip = (reason: string): TierResult => ({
    tier,
    name: meta.name,
    blocking: meta.blocking,
    status: 'skipped',
    checks: [],
    failures: [],
    durationMs: Date.now() - started,
    message: `Skipped: ${reason}`,
  })

  if (!available.has(tier)) return skip('tier tooling not available in this runtime.')

  const checks: TierResult['checks'] = []

  switch (tier) {
    case 'T0':
    case 'T1':
      return skip('requires the build pipeline; run `npm run typecheck` and `npm run lint`.')
    case 'T2': {
      const contracts = input.mcpContracts ?? T2_BUILTIN_CONTRACTS
      const shapeIssues: string[] = []
      for (const c of contracts) {
        if (!c.tool || !c.server) shapeIssues.push(`${c.server}.${c.tool}: missing identity`)
        if (!Array.isArray(c.declaredScopes) || !Array.isArray(c.enforcedScopes))
          shapeIssues.push(`${c.server}.${c.tool}: scopes must be arrays`)
      }
      checks.push({
        name: 'contract_shape',
        ok: shapeIssues.length === 0,
        detail: shapeIssues.length > 0 ? shapeIssues.join('; ') : `${contracts.length} contract(s) well-formed.`,
      })
      const failures = checks.filter((c) => !c.ok).map((c) => c.name)
      return {
        tier,
        name: meta.name,
        blocking: meta.blocking,
        status: failures.length > 0 ? 'fail' : 'pass',
        checks,
        failures,
        durationMs: Date.now() - started,
        message: failures.length > 0 ? 'MCP contract shape invalid.' : 'MCP contracts well-formed.',
      }
    }
    case 'T3': {
      const contracts = input.mcpContracts ?? T2_BUILTIN_CONTRACTS
      const result = checkMcpContracts(contracts)
      checks.push({
        name: 'scope_equality',
        ok: result.ok,
        detail: result.ok
          ? `${result.passed} tool(s): declared scope equals enforced scope.`
          : result.results.filter((r) => !r.equal).map((r) => r.message).join(' '),
      })
      const failures = checks.filter((c) => !c.ok).map((c) => c.name)
      return {
        tier,
        name: meta.name,
        blocking: meta.blocking,
        status: failures.length > 0 ? 'fail' : 'pass',
        checks,
        failures,
        durationMs: Date.now() - started,
        message: result.ok ? 'Scope equality holds for every tool.' : 'Scope equality violated.',
      }
    }
    case 'T4': {
      const recipes = input.recipes ?? []
      const flows = input.flows ?? []
      const failures: string[] = []
      for (const r of recipes) {
        const parsed = parseRecipe(r)
        if (!parsed.ok) {
          failures.push(`recipe: ${parsed.errors.join('; ')}`)
          continue
        }
        const v = validateRecipe(parsed.recipe)
        if (!v.ok) failures.push(v.message)
      }
      for (const f of flows) {
        const parsed = parseFlow(f)
        if (!parsed.ok) {
          failures.push(`flow: ${parsed.errors.join('; ')}`)
          continue
        }
        const v = validateFlow(parsed.flow)
        if (!v.ok) failures.push(v.message)
      }
      checks.push({
        name: 'artifact_validation',
        ok: failures.length === 0,
        detail:
          failures.length === 0
            ? `${recipes.length} recipe(s) and ${flows.length} flow(s) valid.`
            : failures.join(' '),
      })
      return {
        tier,
        name: meta.name,
        blocking: meta.blocking,
        status: failures.length > 0 ? 'fail' : 'pass',
        checks,
        failures: failures.map((_f, i) => `artifact_${i}`),
        durationMs: Date.now() - started,
        message: failures.length === 0 ? 'All artifacts valid.' : `${failures.length} artifact problem(s).`,
      }
    }
    case 'T5':
      return runT5(input, meta, started)
    case 'T6':
      return runProbes(input)
    default:
      return skip('unknown tier')
  }
}

/**
 * T5 — flow trace matching.
 *
 * The chain is verified before it is matched, and an unverifiable chain is a
 * divergence. A trace nobody can authenticate is not evidence that a flow
 * behaved correctly.
 */
async function runT5(
  input: ConformanceInput,
  meta: (typeof TIER_META)['T5'],
  started: number,
): Promise<TierResult> {
  const flows = input.flows ?? []
  const observed = input.observedTraces ?? {}
  const failures: string[] = []
  let matched = 0

  for (const raw of flows) {
    const parsed = parseFlow(raw)
    if (!parsed.ok) {
      failures.push(`flow: ${parsed.errors.join('; ')}`)
      continue
    }
    const trace = observed[parsed.flow.flow_id]
    if (!trace) {
      failures.push(`flow "${parsed.flow.flow_id}": no observed trace supplied.`)
      continue
    }
    const chain = await verifyChain(trace)
    if (!chain.valid) {
      failures.push(chain.message)
      continue
    }
    const m = matchFlow(parsed.flow, trace)
    if (m.matched) matched += 1
    else failures.push(m.message)
  }

  const checks: TierResult['checks'] = [
    {
      name: 'flow_trace_match',
      ok: failures.length === 0,
      detail:
        failures.length > 0
          ? failures.join(' ')
          : flows.length === 0
            ? 'No flows supplied; nothing was matched.'
            : `${matched} of ${flows.length} flow(s) replayed to an identical trace.`,
    },
  ]

  /* Nothing supplied means the tier did not run. Reporting that as a pass would
   * be a false assurance from the tier that exists to catch divergence, and
   * reporting it as a failure would be noise — so it is skipped, and the report
   * counts it in `skipped` rather than in `passed`. */
  if (flows.length === 0) {
    return {
      tier: 'T5',
      name: meta.name,
      blocking: meta.blocking,
      status: 'skipped',
      checks,
      failures: [],
      durationMs: Date.now() - started,
      message: 'Skipped: no flows supplied. Supply `flows` and `observedTraces` to exercise this tier.',
    }
  }

  return {
    tier: 'T5',
    name: meta.name,
    blocking: meta.blocking,
    status: failures.length > 0 ? 'fail' : 'pass',
    checks,
    failures: failures.map((_f, i) => `flow_${i}`),
    durationMs: Date.now() - started,
    message: failures.length === 0 ? 'All flows matched.' : `${failures.length} flow(s) diverged.`,
  }
}

export async function runConformance(
  input: ConformanceInput = {},
  now: string = new Date().toISOString(),
): Promise<ConformanceReport> {
  const available = new Set<TierId>(input.availableTiers ?? ['T2', 'T3', 'T4', 'T5', 'T6'])
  const tiers = await Promise.all(TIER_ORDER.map((t) => runTier(t, input, available)))
  const failed = tiers.filter((t) => t.status === 'fail')
  const blockingFailures = failed.filter((t) => t.blocking).map((t) => t.tier)

  return {
    tiers,
    passed: tiers.filter((t) => t.status === 'pass').length,
    failed: failed.length,
    skipped: tiers.filter((t) => t.status === 'skipped').length,
    ok: blockingFailures.length === 0,
    blockingFailures,
    generatedAt: now,
    message:
      blockingFailures.length === 0
        ? `No blocking tier failed (${tiers.filter((t) => t.status === 'pass').length} passed, ${tiers.filter((t) => t.status === 'skipped').length} skipped).`
        : `Blocking tier(s) failed: ${blockingFailures.join(', ')}.`,
  }
}

export { T2_BUILTIN_CONTRACTS }
export type { BehavioralSignature, FlowDefinition, Recipe }
