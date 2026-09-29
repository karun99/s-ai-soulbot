/**
 * MCP smoke test — spawns the real stdio server and asserts the handshake.
 *
 * The unit suite calls `dispatch()` in-process. This goes one level out: it
 * starts `mcp/stdio.ts` as a child process the way a client does, writes
 * newline-delimited JSON-RPC to its stdin, and reads the answers from stdout.
 * That is the path Glama, an MCP Inspector, or a `.mcp.json` client takes, and
 * it is the only check that would catch a transport that stops reading stdin or
 * pollutes stdout with something that is not a JSON-RPC message.
 *
 * Run: npm run mcp:smoke
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const server = join(here, '..', 'mcp', 'stdio.ts')

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'soulbot_status', arguments: {} } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'soulbot_jataka', arguments: { parami: 'Sacca' } } },
]

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
}

const child = spawn('npx', ['tsx', server], { stdio: ['pipe', 'pipe', 'inherit'] })

let buffer = ''
const responses: Record<string, Record<string, unknown>> = {}

child.stdout.on('data', (chunk: Buffer) => {
  buffer += chunk.toString('utf8')
  let newline: number
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line) as { id?: number }
      if (typeof msg.id === 'number') responses[String(msg.id)] = msg as Record<string, unknown>
    } catch {
      console.error(`FAIL: stdout carried a non-JSON-RPC line: ${line.slice(0, 120)}`)
      process.exit(1)
    }
  }
})

child.stdin.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n')
child.stdin.end()

const timer = setTimeout(() => {
  console.error('FAIL: no complete response set within 30s')
  child.kill('SIGKILL')
  process.exit(1)
}, 30_000)

child.on('close', () => {
  clearTimeout(timer)

  const init = responses['1']?.result as { protocolVersion?: string; serverInfo?: { name?: string } } | undefined
  check(init?.protocolVersion === '2024-11-05', `initialize protocolVersion was ${String(init?.protocolVersion)}`)
  check(init?.serverInfo?.name === 'soulbot-mcp', 'initialize serverInfo.name is wrong')

  const list = responses['2']?.result as { tools?: { name: string }[] } | undefined
  const names = (list?.tools ?? []).map((t) => t.name)
  check(names.length === 5, `tools/list returned ${names.length} tools, expected 5`)
  check(names.includes('soulbot_status'), 'soulbot_status is missing from tools/list')

  const status = JSON.parse(
    ((responses['3']?.result as { content: { text: string }[] })?.content?.[0]?.text ?? '{}') as string,
  ) as { registry?: { guards?: number; paramis?: { parami?: string; guards?: number }[] } }
  const paramis = status.registry?.paramis ?? []
  check(status.registry?.guards === 23, `soulbot_status reported ${String(status.registry?.guards)} guardrails, expected 23`)
  check(paramis.length === 10, `soulbot_status reported ${paramis.length} pāramīs, expected 10`)
  check(
    paramis.every((p) => typeof p.parami === 'string' && (p.guards ?? 0) > 0),
    'soulbot_status reported an unnamed pāramī or a zero guardrail count',
  )

  const jataka = JSON.parse(
    ((responses['4']?.result as { content: { text: string }[] })?.content?.[0]?.text ?? '{}') as string,
  ) as { count?: number; guards?: { assertion?: string }[] }
  check((jataka.count ?? 0) > 0, 'soulbot_jataka returned no guardrails for Sacca')
  check(
    (jataka.guards ?? []).every((g) => typeof g.assertion === 'string' && g.assertion.length > 0),
    'a guardrail was returned without its assertion text',
  )

  console.log('MCP smoke test passed: initialize, tools/list (5 tools), soulbot_status, soulbot_jataka.')
  process.exit(0)
})
