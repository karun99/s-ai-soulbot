/**
 * S-AI SoulBot — harness core.
 *
 * Framework-agnostic, dependency-light, and pure where it can be. The browser
 * UI, the Vercel serverless functions, and the test suite all import from here,
 * so this module is the single place where the system's rules are written down
 * in code.
 *
 * Two centres:
 *   - Bridge Rule (ethical)       "Who is one real person you could tell this to?"
 *   - Delegation model (operational)  Acts for the subject, never as the subject
 *
 * Four invariants:
 *   IV-1  Consent continuity    — no connector action without a live consent check
 *   IV-2  Credential non-exposure — no secret in agent address space
 *   IV-3  Flow determinism      — a flow replays to an identical trace or fails loudly
 *   IV-4  Scope tightness       — enforced scope equals declared scope
 */

export const SOULBOT_VERSION = '3.0.0'
export const INVARIANTS = [
  { id: 'IV-1', statement: 'Consent continuity', detail: 'No connector action without a live consent check.' },
  { id: 'IV-2', statement: 'Credential non-exposure', detail: 'No secret ever enters agent address space.' },
  { id: 'IV-3', statement: 'Flow determinism', detail: 'Every flow replays to an identical trace or fails loudly.' },
  { id: 'IV-4', statement: 'Scope tightness', detail: "Every tool's enforced scope equals its declared scope." },
] as const

export const ONE_SENTENCE =
  'SoulBot is a trust and resilience system that performs browser tasks at the subject’s cognitive level, ' +
  'in the subject’s own pattern, within the subject’s authorized session — and knows when to stop, and who to point to.'

export * from './schema/index.js'
export * from './jata/registry.js'
export * from './jata/engine.js'
export * from './bridge/rule.js'
export * from './sentinel/actions.js'
export * from './sentinel/scope.js'
export * from './sentinel/budget.js'
export * from './sentinel/vault.js'
export * from './sentinel/index.js'
export * from './signature/index.js'
export * from './consent/index.js'
export * from './persona/index.js'
export * from './trace/index.js'
export * from './recipe/index.js'
export * from './pattern/index.js'
export * from './conformance/index.js'
