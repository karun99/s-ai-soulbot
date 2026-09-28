/** API handlers — 10 tests. Handlers are called directly with stub req/res. */

import { describe, expect, it } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import configHandler from '../api/config.js'
import guardrailsHandler from '../api/guardrails.js'
import conformanceHandler from '../api/conformance.js'
import validateHandler from '../api/validate.js'
import { isDurableStoreConfigured, publicConfig, secretConfig } from '../api/_lib/config.js'
import { rateLimit, readJson } from '../api/_lib/http.js'
import { VALID_FLOW, VALID_RECIPE } from './fixtures.js'

interface GuardrailBody {
  report: { outcome: string; violations: { guardrailId: string }[] }
}

interface Stub {
  req: VercelRequest
  res: VercelResponse
  status: () => number
  body: <T = Record<string, unknown>>() => T
  headers: () => Record<string, string>
}

function stub(method: string, body?: unknown, headers: Record<string, string> = {}): Stub {
  const out: { statusCode?: number; payload?: unknown; sent: Record<string, string> } = {
    sent: {},
  }
  const res = {
    status(code: number) {
      out.statusCode = code
      return this
    },
    json(payload: unknown) {
      out.payload = payload
      return this
    },
    setHeader(name: string, value: string) {
      out.sent[name] = value
      return this
    },
    get headersSent() {
      return false
    },
  } as unknown as VercelResponse

  const req = { method, body, headers, query: {} } as unknown as VercelRequest
  return {
    req,
    res,
    status: () => out.statusCode ?? 0,
    body: <T = Record<string, unknown>>() => out.payload as T,
    headers: () => out.sent,
  }
}

describe('GET /api/config', () => {
  it('exposes the public config and the secret-presence flags', async () => {
    const s = stub('GET')
    await configHandler(s.req, s.res)
    expect(s.status()).toBe(200)
    expect(s.body<{ config: { soulbotVersion: string } }>().config.soulbotVersion).toBe('3.0.0')
    expect(s.body<{ secretsPresent: Record<string, boolean> }>().secretsPresent.KV_REST_API_TOKEN).toBe(false)
  })

  it('never includes a secret value in the response body', async () => {
    process.env.KV_REST_API_TOKEN = 'super-secret-token'
    process.env.KV_REST_API_URL = 'https://kv.example.test'
    const s = stub('GET')
    await configHandler(s.req, s.res)
    expect(JSON.stringify(s.body())).not.toContain('super-secret-token')
    expect(s.body<{ secretsPresent: Record<string, boolean> }>().secretsPresent.KV_REST_API_TOKEN).toBe(true)
    delete process.env.KV_REST_API_TOKEN
    delete process.env.KV_REST_API_URL
  })

  it('rejects a non-GET method', async () => {
    const s = stub('POST')
    await configHandler(s.req, s.res)
    expect(s.status()).toBe(405)
    expect(s.body<{ code: string }>().code).toBe('method_not_allowed')
  })
})

describe('GET/POST /api/guardrails', () => {
  it('returns the registry on GET', async () => {
    const s = stub('GET')
    await guardrailsHandler(s.req, s.res)
    expect(s.body<{ count: number }>().count).toBe(23)
  })

  it('evaluates supplied facts and reports a violation', async () => {
    const s = stub('POST', { facts: { claim: { asserted: true, cited: 0, verified: 0 } } })
    await guardrailsHandler(s.req, s.res)
    expect(s.status()).toBe(200)
    expect(s.body<GuardrailBody>().report.outcome).toBe('block')
    expect(s.body<GuardrailBody>().report.violations[0]?.guardrailId).toBe('JG-001')
  })

  it('derives the verdict from the facts, ignoring any verdict the caller sent', async () => {
    const s = stub('POST', {
      facts: { claim: { asserted: true, cited: 0, verified: 0 } },
      verdict: 'allow',
      outcome: 'allow',
      decision: 'allow',
    })
    await guardrailsHandler(s.req, s.res)
    expect(s.status()).toBe(200)
    expect(s.body<GuardrailBody>().report.outcome).toBe('block')
    expect(s.body<GuardrailBody>().report).not.toHaveProperty('verdict')
  })
})

describe('POST /api/conformance', () => {
  it('returns 200 with the report even when a blocking tier fails', async () => {
    const s = stub('POST', {
      tiers: ['T3'],
      mcpContracts: [{ server: 'rogue', tool: 'x', declaredScopes: ['a:read'], enforcedScopes: ['a:read', 'b:write'] }],
    })
    await conformanceHandler(s.req, s.res)
    expect(s.status()).toBe(200)
    expect(s.body<{ report: { ok: boolean; blockingFailures: string[] } }>().report.ok).toBe(false)
    expect(s.body<{ report: { ok: boolean; blockingFailures: string[] } }>().report.blockingFailures).toContain('T3')
  })

  it('reports ok when nothing blocking failed', async () => {
    const s = stub('POST', { tiers: ['T4'], recipes: [VALID_RECIPE], flows: [VALID_FLOW] })
    await conformanceHandler(s.req, s.res)
    expect(s.status()).toBe(200)
    expect(s.body<{ report: { ok: boolean } }>().report.ok).toBe(true)
  })

  it('lists the tier metadata on GET', async () => {
    const s = stub('GET')
    await conformanceHandler(s.req, s.res)
    expect(s.body<{ tiers: string[] }>().tiers).toEqual(['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
  })
})

describe('POST /api/validate', () => {
  it('reports per-artifact results', async () => {
    const s = stub('POST', { recipes: [VALID_RECIPE], flows: [VALID_FLOW] })
    await validateHandler(s.req, s.res)
    expect(s.status()).toBe(200)
    expect(s.body<{ ok: boolean }>().ok).toBe(true)
  })
})

describe('http helpers', () => {
  it('reads an object body, a JSON string, and an empty body', async () => {
    expect((await readJson(stub('POST', { a: 1 }).req)).ok).toBe(true)
    expect((await readJson(stub('POST', '{"a":1}').req)).ok).toBe(true)
    const empty = await readJson(stub('POST', undefined).req)
    expect(empty.ok && (empty.body as Record<string, unknown>)).toEqual({})
  })

  it('rejects a malformed JSON body rather than throwing', async () => {
    const r = await readJson(stub('POST', '{not json').req)
    expect(r.ok).toBe(false)
  })

  it('counts a client against a fixed window and then refuses', () => {
    const s = stub('POST', undefined, { 'x-forwarded-for': '203.0.113.9' })
    const first = rateLimit(s.req, 2, 60_000)
    expect(first.allowed).toBe(true)
    expect(rateLimit(s.req, 2, 60_000).allowed).toBe(true)
    expect(rateLimit(s.req, 2, 60_000).allowed).toBe(false)
  })
})

describe('configuration', () => {
  it('falls back to conservative defaults when nothing is configured', () => {
    const c = publicConfig()
    expect(c.defaults.maxTokens).toBeGreaterThan(0)
    expect(c.defaults.maxCostUsd).toBeGreaterThan(0)
    expect(c.browserNodeAvailable).toBe(false)
    expect(c.vaultMode).toBe('reference_only')
  })

  it('reports ephemeral persistence unless a store is attached', () => {
    expect(isDurableStoreConfigured()).toBe(false)
    expect(publicConfig().persistence).toBe('ephemeral')
  })

  it('never returns a secret value from secretConfig', () => {
    process.env.SENTINEL_SIGNING_KEY = 'sign-me-not'
    const flags = secretConfig()
    expect(flags.SENTINEL_SIGNING_KEY).toBe(true)
    expect(JSON.stringify(flags)).not.toContain('sign-me-not')
    delete process.env.SENTINEL_SIGNING_KEY
  })
})
