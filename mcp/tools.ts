/**
 * S-AI SoulBot — MCP tool surface, independent of transport.
 *
 * This module owns the *contract*: which tools exist, what they accept, and
 * what they return. `stdio.ts` and `api/mcp.ts` are transports that carry
 * JSON-RPC to and from `dispatch()` and add nothing of their own.
 *
 * That split is the point. A tool surface is duplicated per transport is a
 * surface that drifts — one transport grows a tool, or fixes a bug, and the
 * other keeps serving the old behaviour. There is exactly one catalog and one
 * dispatcher here, and every transport is a newline- or socket-shaped pipe
 * into it.
 *
 * Every tool is read-only and delegates to `../src/core` — the same pure
 * modules the Vercel API uses — so nothing here re-implements or diverges from
 * the repo semantics.
 */

import * as core from '../src/core/index.js'

export const MCP_SERVER_NAME = 'soulbot-mcp'
export const MCP_SERVER_VERSION = '3.0.0'
export const MCP_PROTOCOL_VERSION = '2024-11-05'

export type JsonRpcId = string | number | null

export interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolContent {
  type: 'text'
  text: string
}

export interface ToolResult {
  content: ToolContent[]
  isError: boolean
}

/** JSON-RPC error codes used by this server. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const

export const TOOLS: ToolDef[] = [
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
      'Read-only. Returns the Jātaka narrative-guardrail registry grouped by ' +
      'pāramī, with each guardrail id, assertion, trigger, prohibited action, ' +
      'recommendation, check type and severity.',
    inputSchema: {
      type: 'object',
      properties: {
        parami: {
          type: 'string',
          enum: [...core.Parami.options],
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

export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name)

/* -------------------------------------------------------------------------- */
/* Tool implementations                                                        */
/* -------------------------------------------------------------------------- */

function textResult(payload: unknown, isError = false): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError }
}

/** Shape a guardrail for a caller that wants the rule, not just the citation. */
function summariseGuardrail(g: core.NarrativeGuardrail) {
  return {
    id: g.id,
    parami: g.parami,
    assertion: g.assertion,
    trigger: g.trigger,
    prohibited: g.prohibited,
    recommended: g.recommended,
    check_type: g.check_type,
    severity: g.severity,
    story_ref: g.story_ref,
  }
}

function isParami(value: unknown): value is core.Parami {
  return typeof value === 'string' && (core.Parami.options as readonly string[]).includes(value)
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case 'soulbot_status': {
      return textResult({
        version: core.SOULBOT_VERSION,
        oneSentence: core.ONE_SENTENCE,
        invariants: core.INVARIANTS,
        registry: {
          guards: core.JATAKA_REGISTRY.length,
          paramis: core.PARAMIS.map((p) => ({
            parami: p.parami,
            category: p.category,
            guards: p.guardrails.length,
          })),
        },
      })
    }

    case 'soulbot_jataka': {
      const raw = args.parami
      if (raw !== undefined && !isParami(raw)) {
        return textResult(
          {
            error: 'invalid_parami',
            supplied: raw,
            allowed: [...core.Parami.options],
            message: 'Omit `parami` for the whole registry, or pass one of `allowed`.',
          },
          true,
        )
      }
      const guards = raw === undefined ? core.JATAKA_REGISTRY : core.guardrailsForParami(raw)
      return textResult({
        filter: raw ?? null,
        count: guards.length,
        guards: guards.map(summariseGuardrail),
      })
    }

    case 'soulbot_conformance': {
      const report = await core.runConformance({
        recipes: Array.isArray(args.recipes) ? args.recipes : [],
        flows: Array.isArray(args.flows) ? args.flows : [],
      })
      return textResult(report)
    }

    case 'soulbot_validate_recipe':
      return textResult(core.parseRecipe(args.recipe))

    case 'soulbot_validate_flow':
      return textResult(core.parseFlow(args.flow))

    default:
      return textResult(
        {
          error: 'unknown_tool',
          supplied: name,
          available: TOOL_NAMES,
        },
        true,
      )
  }
}

/* -------------------------------------------------------------------------- */
/* JSON-RPC dispatch                                                           */
/* -------------------------------------------------------------------------- */

export interface RpcResult {
  jsonrpc: '2.0'
  id: JsonRpcId
  result: unknown
}

export interface RpcError {
  jsonrpc: '2.0'
  id: JsonRpcId
  error: { code: number; message: string }
}

export type RpcResponse = RpcResult | RpcError

function normaliseId(raw: unknown): JsonRpcId {
  if (typeof raw === 'string' || typeof raw === 'number') return raw
  return null
}

/**
 * Handle one JSON-RPC message.
 *
 * Returns `null` for notifications, which per the spec take no response —
 * replying to one is a protocol error, not politeness.
 */
export async function dispatch(msg: Record<string, unknown>): Promise<RpcResponse | null> {
  const id = normaliseId(msg.id)
  const method = typeof msg.method === 'string' ? msg.method : ''
  const params = (msg.params ?? {}) as Record<string, unknown>

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        },
      }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } }

    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : ''
      const args = (params.arguments ?? {}) as Record<string, unknown>
      const result = await callTool(name, args)
      return { jsonrpc: '2.0', id, result }
    }

    default:
      return { jsonrpc: '2.0', id, error: { code: RPC.METHOD_NOT_FOUND, message: `Method not found: ${method}` } }
  }
}

/** Serialise a dispatch result for a newline-delimited stream. */
export function serialise(response: RpcResponse | null): string | null {
  return response === null ? null : JSON.stringify(response)
}
