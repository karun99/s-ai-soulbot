/**
 * POST|GET|DELETE /api/mcp — MCP Streamable HTTP transport.
 *
 * The same tool surface as `mcp/stdio.ts`, reached over HTTP instead of a
 * subprocess pipe. Both transports call the single dispatcher in `mcp/tools.ts`;
 * this file adds transport concerns only — HTTP method handling, Accept
 * negotiation, Origin validation, rate limiting, and the JSON-RPC envelope.
 *
 * Why two transports at all: a stdio server can only be reached by a client
 * that can spawn a process, which rules out browser-based clients, remote
 * inspectors, and hosted registries. Those are exactly the consumers that
 * introspect `tools/list`. One catalog, two pipes.
 *
 * Spec: Streamable HTTP, protocol `2024-11-05` (`docs/MCP_TRANSPORT.md` records
 * the version choice and the three deliberate deviations below).
 *
 * Three deliberate limitations, each a consequence of a stateless serverless
 * runtime rather than an oversight:
 *
 *  1. `GET` returns 405, not an SSE stream. The spec allows either. A long-lived
 *     server-initiated stream does not survive a function freeze, so offering one
 *     would advertise a capability that silently drops.
 *  2. No `Mcp-Session-Id` is issued. This server keeps no cross-request state,
 *     so a session id would be a token for nothing. The spec makes it optional.
 *  3. Authentication is **optional and off by default** — set
 *     `SOULBOT_MCP_TOKEN` to require a bearer token. The default is a
 *     considered choice, not an omission: every tool here is read-only over
 *     committed data, and a mandatory secret would make the endpoint
 *     un-introspectable by exactly the registry clients it exists to serve.
 *     Set the token on any deployment that is not deliberately public.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard, methodNotAllowed, noStore, sendError } from './_lib/http.js'
import { publicConfig } from './_lib/config.js'
import { RPC, TOOLS, dispatch } from '../mcp/tools.js'

const JSON_TYPE = 'application/json'

/* -------------------------------------------------------------------------- */
/* Origin validation (STRIDE: DNS rebinding)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reject cross-origin requests.
 *
 * The Streamable HTTP spec makes this a MUST, and it is the control that stops a
 * malicious page in a browser from driving a loopback or intranet instance. The
 * allowance list is derived from the deployment's own host, so a normal client
 * and a same-origin fetch both pass, and a `null` origin (a sandboxed iframe or
 * a `file://` page) does not.
 */
function originAllowed(req: VercelRequest): boolean {
  const origin = req.headers.origin
  if (!origin) return true // non-browser client (curl, an MCP inspector, a CLI)

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false // an Origin that will not parse is not a trusted origin
  }

  const host = (req.headers.host as string | undefined) ?? ''
  if (originHost === host) return true

  // A preview deployment is served from a *.vercel-app.com host while the
  // console may be opened through the deployment's own alias. Both are this
  // deployment, so both are allowed; nothing else is.
  const configured = (process.env.SOULBOT_MCP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return configured.includes(origin)
}

/* -------------------------------------------------------------------------- */
/* Auth (optional)                                                              */
/* -------------------------------------------------------------------------- */

function authOk(req: VercelRequest): boolean {
  const expected = process.env.SOULBOT_MCP_TOKEN
  if (!expected) return true // unauthenticated by configuration

  const header = req.headers.authorization
  if (typeof header !== 'string') return false
  const [scheme, value] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && value === expected
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                      */
/* -------------------------------------------------------------------------- */

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)
    res.setHeader('X-Content-Type-Options', 'nosniff')

    if (!originAllowed(req)) {
      sendError(res, 403, { error: 'forbidden', code: 'forbidden', details: { reason: 'origin_not_allowed' } })
      return
    }

    if (!authOk(req)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="soulbot-mcp"')
      sendError(res, 401, { error: 'unauthorized', code: 'unauthorized' })
      return
    }

    // `?discovery` is a non-standard convenience, not part of MCP: it lets a
    // human or a crawler confirm the endpoint is live and see the tool count
    // without speaking JSON-RPC. The MCP path itself is the bare POST.
    if (req.method === 'GET' && req.query.discovery) {
      res.status(200).json({
        name: 'soulbot-mcp',
        transport: 'streamable-http',
        protocolVersion: '2024-11-05',
        tools: TOOLS.length,
        browserNode: 'external',
        hint: 'POST JSON-RPC 2.0 to this same URL. Accept: application/json, text/event-stream.',
      })
      return
    }

    if (req.method === 'DELETE') {
      // See limitation 2 in the header comment: no sessions exist, so there is
      // nothing to terminate. 405 is the spec's stated answer for this case.
      methodNotAllowed(res, ['POST'])
      return
    }

    if (req.method !== 'POST') {
      // See limitation 1 in the header comment. 405 on GET is explicitly
      // permitted and is more honest than a stream that would die on freeze.
      methodNotAllowed(res, ['POST'])
      return
    }

    const config = publicConfig()
    if (!config.browserNodeAvailable) {
      // Unconditional and honest: this server is the trust core only. The
      // browser node lives on the subject's machine and is never reachable here.
      res.setHeader('X-Soulbot-Browser-Node', 'external')
    }

    const body = req.body
    let msg: Record<string, unknown>
    if (typeof body === 'string' || body === undefined || body === null) {
      try {
        msg = JSON.parse(typeof body === 'string' ? body : '{}') as Record<string, unknown>
      } catch {
        res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: RPC.PARSE_ERROR, message: 'Parse error' } })
        return
      }
    } else {
      msg = body as Record<string, unknown>
    }

    // A notification or a response takes no reply. The spec asks for 202 with an
    // empty body, and that is also the only honest answer: sending one would
    // make the client wait for a response to something it did not ask for.
    const isNotification = typeof msg.method === 'string' && msg.method.startsWith('notifications/')
    if (isNotification || msg.method === undefined) {
      res.status(202).end()
      return
    }

    const out = await dispatch(msg)
    if (out === null) {
      res.status(202).end()
      return
    }

    res.setHeader('Content-Type', JSON_TYPE)
    res.status(200).json(out)
  })
}
