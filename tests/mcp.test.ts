/**
 * MCP tool surface and HTTP transport.
 *
 * The regression that motivates the first block: `soulbot_status` used to
 * report `guards: 0` for every pāramī and omit the pāramī name entirely, and
 * `soulbot_jataka` dropped the rule text while its own description promised it.
 * Both passed CI, because `mcp/` was not in the tsconfig include and the MCP
 * server had no tests at all. A tool that reports the wrong number is worse
 * than a tool that is missing, so these are asserted on values, not on shape.
 */

import { describe, expect, it } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import mcpHandler from '../api/mcp.js'
import { MCP_PROTOCOL_VERSION, TOOLS, TOOL_NAMES, callTool, dispatch } from '../mcp/tools.js'
import * as core from '@core/index.js'
import { VALID_FLOW, VALID_RECIPE } from './fixtures.js'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                      */
/* -------------------------------------------------------------------------- */

async function toolPayload(name: string, args: Record<string, unknown> = {}) {
  const res = await callTool(name, args)
  expect(res.isError, `${name} unexpectedly reported an error`).toBe(false)
  const text = res.content[0]?.text ?? '{}'
  return JSON.parse(text) as Record<string, unknown>
}

interface Stub {
  req: VercelRequest
  res: VercelResponse
  status: () => number
  body: () => unknown
  headers: () => Record<string, string>
  ended: () => boolean
}

function stub(method: string, body?: unknown, headers: Record<string, string> = {}): Stub {
  const out: {
    statusCode?: number
    payload?: unknown
    sent: Record<string, string>
    didEnd: boolean
  } = { sent: {}, didEnd: false }

  const res = {
    status(code: number) {
      out.statusCode = code
      return this
    },
    json(payload: unknown) {
      out.payload = payload
      return this
    },
    end() {
      out.didEnd = true
      return this
    },
    setHeader(name: string, value: string) {
      out.sent[name] = value
      return this
    },
    get headersSent() {
      return out.didEnd
    },
  } as unknown as VercelResponse

  const req = { method, body, headers, query: {} } as unknown as VercelRequest
  return {
    req,
    res,
    status: () => out.statusCode ?? 0,
    body: () => out.payload,
    headers: () => out.sent,
    ended: () => out.didEnd,
  }
}

async function post(msg: unknown, headers: Record<string, string> = {}): Promise<Stub> {
  const s = stub('POST', msg, headers)
  await mcpHandler(s.req, s.res)
  return s
}

/* -------------------------------------------------------------------------- */
/* soulbot_status — the counts that were wrong                                  */
/* -------------------------------------------------------------------------- */

describe('soulbot_status', () => {
  it('reports a non-zero guardrail count for every pāramī', async () => {
    const out = await toolPayload('soulbot_status')
    const registry = out.registry as { guards: number; paramis: { parami: string; guards: number }[] }

    expect(registry.guards).toBe(core.JATAKA_REGISTRY.length)
    expect(registry.paramis).toHaveLength(core.PARAMIS.length)

    // The regression: this used to be 0 for all ten, and `parami` was undefined.
    for (const p of registry.paramis) {
      expect(p.parami, 'a pāramī was reported with no name').toBeTruthy()
      expect(p.guards, `${p.parami} reported zero guardrails`).toBeGreaterThan(0)
    }
  })

  it('sums the per-pāramī counts to the registry total', async () => {
    const out = await toolPayload('soulbot_status')
    const registry = out.registry as { guards: number; paramis: { guards: number }[] }
    const sum = registry.paramis.reduce((acc, p) => acc + p.guards, 0)
    expect(sum).toBe(registry.guards)
  })

  it('reports the four invariants', async () => {
    const out = await toolPayload('soulbot_status')
    expect(out.invariants).toHaveLength(4)
  })
})

/* -------------------------------------------------------------------------- */
/* soulbot_jataka — the dropped rule text                                       */
/* -------------------------------------------------------------------------- */

describe('soulbot_jataka', () => {
  it('returns the whole registry with the rule text present on every entry', async () => {
    const out = await toolPayload('soulbot_jataka')
    const guards = out.guards as Record<string, string>[]

    expect(out.count).toBe(core.JATAKA_REGISTRY.length)
    for (const g of guards) {
      // The regression: `rule` was read from a field that does not exist, so
      // every entry shipped without the text its description promised.
      for (const field of ['id', 'parami', 'assertion', 'trigger', 'prohibited', 'recommended', 'check_type', 'severity']) {
        expect(g[field], `${g.id} is missing ${field}`).toBeTruthy()
      }
    }
  })

  it('filters to a single pāramī', async () => {
    const out = await toolPayload('soulbot_jataka', { parami: 'Sacca' })
    expect(out.filter).toBe('Sacca')
    const guards = out.guards as { parami: string }[]
    expect(guards.length).toBeGreaterThan(0)
    expect(guards.every((g) => g.parami === 'Sacca')).toBe(true)
  })

  it('rejects an unknown pāramī instead of silently returning everything', async () => {
    const res = await callTool('soulbot_jataka', { parami: 'NotAParami' })
    expect(res.isError).toBe(true)
    const out = JSON.parse(res.content[0]!.text) as { error: string; allowed: string[] }
    expect(out.error).toBe('invalid_parami')
    expect(out.allowed.length).toBe(core.Parami.options.length)
  })
})

/* -------------------------------------------------------------------------- */
/* Validation + conformance tools                                               */
/* -------------------------------------------------------------------------- */

describe('soulbot_validate_recipe / soulbot_validate_flow', () => {
  it('validates a good recipe and a good flow', async () => {
    const recipe = await toolPayload('soulbot_validate_recipe', { recipe: VALID_RECIPE })
    const flow = await toolPayload('soulbot_validate_flow', { flow: VALID_FLOW })
    expect(recipe.ok).toBe(true)
    expect(flow.ok).toBe(true)
  })

  it('rejects a malformed artifact rather than throwing', async () => {
    const out = await toolPayload('soulbot_validate_recipe', { recipe: { nope: true } })
    expect(out.ok).toBe(false)
  })

  it('reports conformance honestly — a skipped tier is never a pass', async () => {
    const out = await toolPayload('soulbot_conformance')
    const report = out as { ok: boolean; tiers: { tier: string; status: string }[] }
    expect(report.tiers.length).toBeGreaterThan(0)
    // T0 needs the build pipeline, so it must not report a pass in-process.
    const t0 = report.tiers.find((t) => t.tier === 'T0')
    if (t0) expect(t0.status).not.toBe('pass')
  })
})

describe('unknown tools', () => {
  it('is an error, and names what is available', async () => {
    const res = await callTool('soulbot_nope', {})
    expect(res.isError).toBe(true)
    const out = JSON.parse(res.content[0]!.text) as { available: string[] }
    expect(out.available).toEqual([...TOOL_NAMES])
  })
})

/* -------------------------------------------------------------------------- */
/* JSON-RPC dispatch                                                            */
/* -------------------------------------------------------------------------- */

describe('JSON-RPC dispatch', () => {
  it('answers initialize with the protocol version and server identity', async () => {
    const out = await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    const result = (out as { result: Record<string, unknown> }).result
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION)
    expect((result.serverInfo as { name: string }).name).toBe('soulbot-mcp')
  })

  it('lists every tool and each name is unique', async () => {
    const out = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = (out as { result: { tools: { name: string }[] } }).result.tools
    expect(tools).toHaveLength(TOOLS.length)
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length)
  })

  it('returns no response for a notification', async () => {
    expect(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    expect(await dispatch({ jsonrpc: '2.0', method: 'notifications/cancelled' })).toBeNull()
  })

  it('reports an unknown method as METHOD_NOT_FOUND rather than crashing', async () => {
    const out = await dispatch({ jsonrpc: '2.0', id: 3, method: 'nope/nope' })
    expect((out as { error: { code: number } }).error.code).toBe(-32601)
  })

  it('answers ping', async () => {
    const out = await dispatch({ jsonrpc: '2.0', id: 4, method: 'ping' })
    expect((out as { result: object }).result).toEqual({})
  })
})

/* -------------------------------------------------------------------------- */
/* HTTP transport                                                               */
/* -------------------------------------------------------------------------- */

describe('POST /api/mcp', () => {
  it('completes a full initialize → tools/list → tools/call round trip', async () => {
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(init.status()).toBe(200)
    expect((init.body() as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      MCP_PROTOCOL_VERSION,
    )

    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = (list.body() as { result: { tools: unknown[] } }).result.tools
    expect(tools).toHaveLength(TOOLS.length)

    const call = await post({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'soulbot_status', arguments: {} },
    })
    const content = (call.body() as { result: { content: { text: string }[] } }).result.content
    const payload = JSON.parse(content[0]!.text) as { registry: { paramis: { guards: number }[] } }
    // The same bug class as above, now over the wire.
    expect(payload.registry.paramis.every((p) => p.guards > 0)).toBe(true)
  })

  it('serves exactly the same catalog as the stdio transport', async () => {
    const list = await post({ jsonrpc: '2.0', id: 9, method: 'tools/list' })
    const tools = (list.body() as { result: { tools: { name: string }[] } }).result.tools
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name))
  })

  it('accepts a JSON string body as well as a parsed object', async () => {
    const s = await post(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' }))
    expect(s.status()).toBe(200)
  })

  it('answers a notification with 202 and an empty body', async () => {
    const s = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(s.status()).toBe(202)
    expect(s.ended()).toBe(true)
  })

  it('rejects unparseable JSON with a JSON-RPC parse error', async () => {
    const s = await post('{not json')
    expect(s.status()).toBe(400)
    expect((s.body() as { error: { code: number } }).error.code).toBe(-32700)
  })

  it('is never cacheable', async () => {
    const s = await post({ jsonrpc: '2.0', id: 6, method: 'ping' })
    expect(s.headers()['Cache-Control']).toContain('no-store')
  })

  it('reports the browser node as external', async () => {
    const s = await post({ jsonrpc: '2.0', id: 7, method: 'ping' })
    expect(s.headers()['X-Soulbot-Browser-Node']).toBe('external')
  })
})

describe('GET/DELETE /api/mcp', () => {
  it('returns 405 on GET — a serverless freeze cannot hold an SSE stream open', async () => {
    const s = stub('GET')
    await mcpHandler(s.req, s.res)
    expect(s.status()).toBe(405)
    expect(s.headers().Allow).toBe('POST')
  })

  it('returns 405 on DELETE — no sessions exist to terminate', async () => {
    const s = stub('DELETE')
    await mcpHandler(s.req, s.res)
    expect(s.status()).toBe(405)
  })

  it('serves a discovery document on ?discovery', async () => {
    const s = stub('GET')
    s.req.query = { discovery: '1' }
    await mcpHandler(s.req, s.res)
    expect(s.status()).toBe(200)
    const body = s.body() as { tools: number; browserNode: string }
    expect(body.tools).toBe(TOOLS.length)
    expect(body.browserNode).toBe('external')
  })
})

describe('HTTP transport security', () => {
  it('allows a same-origin request', async () => {
    const s = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { host: 'soulbot.example', origin: 'https://soulbot.example' })
    expect(s.status()).toBe(200)
  })

  it('refuses a cross-origin request — the DNS-rebinding control', async () => {
    const s = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { host: 'localhost:3000', origin: 'https://evil.example' })
    expect(s.status()).toBe(403)
  })

  it('refuses a null origin, which is what a sandboxed iframe sends', async () => {
    const s = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { host: 'localhost:3000', origin: 'null' })
    expect(s.status()).toBe(403)
  })

  it('allows a non-browser client that sends no Origin at all', async () => {
    const s = await post({ jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(s.status()).toBe(200)
  })

  it('requires a bearer token once SOULBOT_MCP_TOKEN is configured', async () => {
    process.env.SOULBOT_MCP_TOKEN = 'test-token'
    try {
      const denied = await post({ jsonrpc: '2.0', id: 1, method: 'ping' })
      expect(denied.status()).toBe(401)
      expect(denied.headers()['WWW-Authenticate']).toContain('Bearer')

      const wrong = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { authorization: 'Bearer nope' })
      expect(wrong.status()).toBe(401)

      const ok = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { authorization: 'Bearer test-token' })
      expect(ok.status()).toBe(200)
    } finally {
      delete process.env.SOULBOT_MCP_TOKEN
    }
  })
})
