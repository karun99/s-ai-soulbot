# MCP transport decision

**Question (from `../todo.md`):** should the browser node ship as a second MCP
transport (SSE/HTTP) alongside stdio?

## Decision

**Ship a second transport; do not ship the browser node in it.**

The two halves of that sentence are separate, and conflating them is how a
decision like this goes wrong.

### 1. A second transport: yes, Streamable HTTP

The server now answers MCP over two pipes into **one** dispatcher:

| Transport | Endpoint | Reached by |
|---|---|---|
| stdio | `npm run mcp:stdio` (`mcp/stdio.ts`) | Any client that can spawn a process |
| Streamable HTTP | `POST /api/mcp` (`api/mcp.ts`) | Browser clients, remote inspectors, registries |

`mcp/tools.ts` owns the catalog and the dispatch; both transports are thin.
That is the whole reason the answer is yes — the marginal cost of a second
transport is a pipe, and the marginal *risk* (two surfaces that drift) was
designed out rather than accepted. Before this change there was a single
transport and a single catalog, but they were the same file, so a second
transport would have meant a second copy. Now it cannot.

The protocol version stays `2024-11-05` because that is what the stdio server
already advertises and what the tools were written against; the HTTP transport
implements the Streamable HTTP shape from that version, whose normative
requirements are unchanged in `2025-06-18`.

**Consequence for the `tools/list` PENDING listing:** a hosted HTTP endpoint is
now something Glama can reach. That is the unblock for open item #1, and it is
the reason this was worth doing rather than merely deciding.

### 2. The browser node: no, and it is not close

The browser node is CDP execution with a live Chromium and a credential vault.
It runs on the subject's machine, under the subject's session, and IV-2 says no
secret ever enters agent address space. Hosting it on a shared serverless
function would not be a new transport for the same thing — it would be a
different product with the invariant removed.

`/api/health` reports `browserNode: 'external'` and `/api/config` reports
`browserNodeAvailable: false`. Both are unchanged by this work. The HTTP
transport does not move the node; it moves the *read-only core* that the node
and every other client consult.

## Deliberate limitations

Each is a consequence of a stateless serverless runtime, stated here rather than
left for a client to discover:

1. **`GET /api/mcp` returns 405, not an SSE stream.** The spec permits either. A
   long-lived server-initiated stream does not survive a function freeze, so
   offering one would advertise a capability that silently drops messages.
2. **No `Mcp-Session-Id`.** This server keeps no cross-request state, so a
   session id would be a token for nothing. The spec makes it optional; `DELETE`
   therefore also returns 405, because there is no session to terminate.
3. **Auth is optional and off by default.** Set `SOULBOT_MCP_TOKEN` to require a
   bearer token. Every tool is read-only over committed data, and a mandatory
   secret would make the endpoint un-introspectable by exactly the registry
   clients it exists to serve. Set the token on any deployment that is not
   deliberately public.

## What was actually wrong before this decision

Making the second transport forced the shared module, and the shared module was
compiled for the first time. It did not compile:

- `mcp/` was **absent from `tsconfig.json` `include`**, so `npm run typecheck`
  never checked the MCP server — while `mcp/REGISTRY.md` claimed it did. The
  claim was the bug; it is now false-by-omission no longer.
- Once compiled, `soulbot_status` reported `guards: 0` for all ten pāramīs and
  omitted the pāramī name, because it read `p.id` from a record whose field is
  `p.parami`.
- `soulbot_jataka` shipped every guardrail with its rule text missing, because
  it read `g.rule` from a record whose field is `g.assertion`.

All three passed CI. A read-only tool that reports the wrong number is worse
than a missing tool, because it is believed. The new `tests/mcp.test.ts` asserts
on values — the counts sum to the registry size, every entry carries its rule
text — not merely on shape.

## Reproduce

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx tsx mcp/stdio.ts

npx vitest run tests/mcp.test.ts
```
