/**
 * S-AI SoulBot — MCP stdio transport.
 *
 * Newline-delimited JSON-RPC 2.0 over stdin/stdout. This file does three
 * things and no more: read a line, hand it to the shared dispatcher in
 * `./tools.ts`, write the answer. The tool catalog, the tool implementations
 * and the protocol details all live in `./tools.ts`, so this transport and the
 * HTTP transport cannot serve different behaviour.
 *
 * Tools exposed (see ./tools.ts and ./REGISTRY.md):
 *
 *   soulbot_status            version, invariants, registry sizes
 *   soulbot_jataka            the Jātaka narrative-guardrail registry
 *   soulbot_conformance       run T0–T6 conformance tiers
 *   soulbot_validate_recipe   validate a recipe artifact (T4)
 *   soulbot_validate_flow     validate a flow artifact (T5)
 *
 * Run: npm run mcp:stdio   (tsx mcp/stdio.ts)
 */

import { createInterface } from 'node:readline'
import { RPC, dispatch, serialise } from './tools.js'

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of rl) {
  const trimmed = line.trim()
  if (!trimmed) continue

  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    // Drift on the stream: answer per spec and keep serving. Staying silent
    // here would leave the client waiting on a parse error forever.
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: RPC.PARSE_ERROR, message: 'Parse error: line is not valid JSON' },
      }) + '\n',
    )
    continue
  }

  try {
    const out = serialise(await dispatch(msg))
    if (out !== null) process.stdout.write(out + '\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const id = typeof msg.id === 'string' || typeof msg.id === 'number' ? msg.id : null
    process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id, error: { code: RPC.INTERNAL, message } }) + '\n',
    )
  }
}
