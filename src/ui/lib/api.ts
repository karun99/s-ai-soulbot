/**
 * Typed client for the serverless API.
 *
 * Every call returns a discriminated result rather than throwing, so a panel can
 * render a validation failure, a rate limit, and a network error without
 * guessing which happened. The distinction matters: "the Sentinel refused" and
 * "the console could not reach the Sentinel" are not the same message to a
 * subject, and collapsing them would misrepresent what the system did.
 */

import type {
  BehavioralSignature,
  ConsentObject,
  FlowDefinition,
  GuardrailFacts,
  NarrativeGuardrail,
  Parami,
  Recipe,
  TierId,
} from '@core/index.js'

const BASE = ''

export type Result<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code: string; details?: unknown }

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      return { ok: false, status: res.status, error: 'malformed_response', code: 'internal_error' }
    }
    if (!res.ok) {
      const e = parsed as { error?: string; code?: string; details?: unknown }
      return {
        ok: false,
        status: res.status,
        error: e.error ?? `http_${res.status}`,
        code: e.code ?? 'internal_error',
        ...(e.details !== undefined ? { details: e.details } : {}),
      }
    }
    return { ok: true, status: res.status, data: parsed as T }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'network_error',
      code: 'network_error',
    }
  }
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body) })

/* -------------------------------------------------------------------------- */

export interface PublicConfigResponse {
  config: {
    soulbotVersion: string
    deploymentName: string
    environment: 'development' | 'preview' | 'production'
    persistence: 'durable' | 'ephemeral'
    defaults: { maxTokens: number; maxCostUsd: number }
    browserNodeAvailable: false
    vaultMode: 'reference_only'
    rateLimit: { requests: number; windowMs: number }
    conformanceTiers: string[]
    notes: string[]
  }
  secretsPresent: Record<string, boolean>
  version: string
  invariants: { id: string; statement: string; detail: string }[]
  oneSentence: string
}

export interface RegistryResponse {
  count: number
  registry: NarrativeGuardrail[]
  paramis: { parami: Parami; category: string; guardrails: string[] }[]
}

export type { BehavioralSignature, ConsentObject, FlowDefinition, GuardrailFacts, Recipe, TierId }

export const api = {
  health: () => call<{ status: string; version: string; persistence: string; store: string }>('/api/health'),
  config: () => call<PublicConfigResponse>('/api/config'),

  registry: () => call<RegistryResponse>('/api/guardrails'),

  evaluateGuardrails: (facts: GuardrailFacts) =>
    post<{ report: GuardrailReportResponse }>('/api/guardrails', { facts }),

  bridgeRule: (context: unknown) =>
    post<{ verdict: BridgeVerdictResponse; question: string }>('/api/bridge-rule', { context }),

  signatureDomains: () =>
    call<{
      parameters: string[]
      domains: Record<string, string[]>
      thresholds: { usableConfidence: number; provisionalCompleteness: number }
    }>('/api/signature'),

  deriveSignature: (body: {
    signatureId: string
    subjectId: string
    observations: Record<string, { value: string; confidence: number; evidence: string }>
  }) => post<SignatureResponse>('/api/signature', { mode: 'derive', ...body }),

  authorize: (body: unknown) => post<{ decision: AuthorizeResponse }>('/api/authorize', body),

  checkConsent: (consent: ConsentObject, query: unknown) =>
    post<{ result: ConsentCheckResponse }>('/api/consent', { mode: 'check', consent, query }),

  consentContinuity: (ledger: unknown[]) =>
    post<{ continuity: ContinuityResponse }>('/api/consent', { mode: 'continuity', ledger }),

  revokeConsent: (body: unknown) =>
    post<{
      changes: string[]
      invalidatedPersonas: string[]
      withinWindow: boolean
      propagationMs: number
      propagationWindowMs: number
    }>('/api/consent', { mode: 'revoke', ...(body as object) }),

  runConformance: (body: unknown) => post<{ report: ConformanceResponse }>('/api/conformance', body),

  validateArtifacts: (body: { recipes?: unknown[]; flows?: unknown[] }) =>
    post<{ ok: boolean; recipes: unknown[]; flows: unknown[] }>('/api/validate', body),

  readTrace: (flowId: string) =>
    call<{ flowId: string; count: number; records: unknown[]; verification: VerifyResponse }>(
      `/api/trace?flow_id=${encodeURIComponent(flowId)}`,
    ),

  appendTrace: (trace: unknown) =>
    post<{ ok: boolean; record: unknown; verification: VerifyResponse }>('/api/trace', { trace }),
}

/* -------------------------------------------------------------------------- */
/* Response shapes used by the console                                         */
/* -------------------------------------------------------------------------- */

export interface GuardrailVerdictResponse {
  guardrailId: string
  status: 'pass' | 'violation' | 'not_applicable'
  severity: 'critical' | 'high' | 'moderate' | 'low'
  assertion: string
  finding: string
  recommended: string
  storyRef: string
  parami: string
  checkType: string
}

export interface GuardrailReportResponse {
  outcome: 'allow' | 'escalate' | 'block'
  violations: GuardrailVerdictResponse[]
  verdicts: GuardrailVerdictResponse[]
  counts: { total: number; pass: number; violation: number; notApplicable: number }
  unevaluated: string[]
  evaluatedAt: string
}

export interface BridgeVerdictResponse {
  verdict: 'clear' | 'pointer_present' | 'pointer_required' | 'dependence_risk'
  message: string
  question: string
  pointerRequired: string
  basis: string[]
  heavyMoment: boolean
  evaluatedAt: string
}

export interface AuthorizeResponse {
  requestId: string
  decision: 'allow' | 'deny' | 'ask_user'
  reasons: string[]
  decidedBy: string
  guardrails: GuardrailReportResponse | null
  bridge: BridgeVerdictResponse | null
  question?: string
  decidedAt: string
  permitted: boolean
}

export interface SignatureResponse {
  signature: BehavioralSignature
  completeness: string
  usable: string[]
  unmeasured: string[]
  rejected: { parameter: string; reason: string }[]
  coherence: { ok: boolean; issues: string[]; drivesAutomation: boolean; message: string }
}

export interface ConsentCheckResponse {
  ok: boolean
  problems: string[]
  live: boolean
  continuityPreserved: boolean
  grantedScopes: string[]
  missingScopes: string[]
  message: string
}

export interface ContinuityResponse {
  state: 'intact' | 'reconstituted' | 'discontinuous' | 'unresolved'
  version: number
  isNewBaseline: boolean
  findings: string[]
  message: string
}

export interface ConformanceResponse {
  tiers: {
    tier: string
    name: string
    blocking: boolean
    status: 'pass' | 'fail' | 'skipped'
    checks: { name: string; ok: boolean; detail: string }[]
    failures: string[]
    durationMs: number
    message: string
  }[]
  passed: number
  failed: number
  skipped: number
  ok: boolean
  blockingFailures: string[]
  generatedAt: string
  message: string
}

export interface VerifyResponse {
  valid: boolean
  count: number
  brokenAt: number
  problems: { index: number; problem: string; hash: string }[]
  message: string
}
