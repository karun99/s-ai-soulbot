/**
 * S-AI SoulBot — MCP stdio server.
 *
 * Standard MCP (JSON-RPC 2.0 over stdin/stdout, newline-delimited) exposing
 * the *committed* core contracts of SoulBot as read-only tools. Every tool
 * delegates to `../src/core` — the same pure modules the Vercel API uses — so
 * nothing here re-implements or diverges from the repo semantics.
 *
 * Tools exposed:
 *
 *   soulbot_status            version, invariants, registry sizes
 *   soulbot_jataka            the Jātaka narrative-guardrail registry
 *   soulbot_conformance       run T0–T6 conformance tiers
 *   soulbot_validate_recipe   validate a recipe artifact (T4)
 *   soulbot_validate_flow     validate a flow artifact (T5)
 *
 * Run: npm run mcp:stdio   (tsx mcp/stdio.ts)
 */

import * as core from '../src/core/index.js'

const SERVER_NAME = 'soulbot-mcp'
const SERVER_VERSION = '3.0.0'
const PROTOCOL_VERSION = '2024-11-05'

type Id = string | number | null

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  {
    name: 'soulbot_status',
    description:
      'Read-only. Reports SoulBot version, the four INVARIANTS (consent ' +
      'continuity, credential non-exposure, flow determinism, scope ' +
      'tightness), and the Jātaka registry / pāramī sizes.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'soulbot_jataka',
    description:
      'Read-only. Returns the full Jātaka narrative-guardrail registry ' +
      'grouped by pāramī, with each guardrail id, rule, and severity.',
    inputSchema: {
      type: 'object',
      properties: {
        parami: {
          type: 'string',
          description: 'optional pāramī to filter to (e.g. Sacca, Metta)',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'soulbot_conformance',
    description:
      'Read-only. Runs the T0–T6 conformance tiers against supplied ' +
      'artifacts. Tiers whose tooling is absent are reported as skipped, ' +
      'never as pass. With no artifacts supplied, the report reflects the ' +
      'baseline tier statuses.',
    inputSchema: {
      type: 'object',
      properties: {
        recipes: { type: 'array', items: {}, description: 'recipe artifacts' },
        flows: { type: 'array', items: {}, description: 'flow artifacts' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'soulbot_validate_recipe',
    description:
      'Read-only. Parse and validate one recipe artifact (T4 gates). ' +
      'Returns ok + t4 when valid, or a list of problems when not. ' +
      'Accepts the cookie-json recipe shape; never executes anything.',
    inputSchema: {
      type: 'object',
      properties: { recipe: { description: 'the recipe artifact (JSON)' } },
      required: ['recipe'],
      additionalProperties: false,
    },
  },
  {
    name: 'soulbot_validate_flow',
    description:
      'Read-only. Parse and validate one flow artifact (T5 gates: replay ' +
      'safety, determinism, secret handling). Returns ok + t5 or a list of ' +
      'problems. Never executes the flow.',
    inputSchema: {
      type: 'object',
      properties: { flow: { description: 'the flow artifact (JSON)' } },
      required: ['flow'],
      additionalProperties: false,
    },
  },
]

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------

function reply(id: Id, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function error(id: Id, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

function text(textValue: string): unknown {
  return { content: [{ type: 'text', text: textValue }], isError: false }
}

async function callTool(name: string, args: Record<string, unknown>, id: Id): Promise<string> {
  switch (name) {
    case 'soulbot_status': {
      const byParami = core.PARAMIS.map((p) => ({
        parami: p.id,
        guards: core.guardrailsForParami(p.id).length,
      }))
      return reply(id, text(JSON.stringify({
        version: core.SOULBOT_VERSION,
        oneSentence: core.ONE_SENTENCE,
        invariants: core.INVARIANTS,
        registry: { guards: core.JATAKA_REGISTRY.length, paramis: byParami },
      }, null, 2)))
    }

    case 'soulbot_jataka': {
      const filter = typeof args.parami === 'string' ? args.parami : undefined
      const guards = filter
        ? core.guardrailsForParami(filter)
        : core.JATAKA_REGISTRY
      return reply(id, text(JSON.stringify({
        filter: filter ?? null,
        count: guards.length,
        guards: guards.map((g) => ({
          id: g.id, parami: g.parami, rule: g.rule, severity: g.severity,
        })),
      }, null, 2)))
    }

    case 'soulbot_conformance': {
      const report = await core.runConformance({
        recipes: Array.isArray(args.recipes) ? args.recipes : [],
        flows: Array.isArray(args.flows) ? args.flows : [],
      })
      return reply(id, text(JSON.stringify(report, null, 2)))
    }

    case 'soulbot_validate_recipe': {
      const out = core.parseRecipe(args.recipe)
      return reply(id, text(JSON.stringify(out, null, 2)))
    }

    case 'soulbot_validate_flow': {
      const out = core.parseFlow(args.flow)
      return reply(id, text(JSON.stringify(out, null, 2)))
    }

    default:
      return reply(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true })
  }
}

async function handle(msg: Record<string, unknown>): Promise<string | null> {
  const method = msg.method
  const id = (msg.id ?? null) as Id
  const params = (msg.params ?? {}) as Record<string, unknown>

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    })
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null
  }
  if (method === 'ping') return reply(id, {})
  if (method === 'tools/list') return reply(id, { tools: TOOLS })
  if (method === 'tools/call') {
    return callTool(String(params.name ?? ''), (params.arguments ?? {}) as Record<string, unknown>, id)
  }
  return error(id, -32601, `Method not found: ${String(method)}`)
}

// ---------------------------------------------------------------------------
// stdio loop
// ---------------------------------------------------------------------------

import { createInterface } from 'node:readline'

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of rl) {
  const trimmed = line.trim()
  if (!trimmed) continue
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(trimmed)
  } catch {
    continue // drift on the stream; keep serving
  }
  try {
    const out = await handle(msg)
    if (out !== null) process.stdout.write(out + '\n')
  } catch (err) {
    process.stdout.write(error(msg.id ?? null, -32603, String(err)) + '\n')
  }
  process.stdout.flush?.()
}