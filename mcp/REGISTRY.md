# soulbot-mcp — registry listing

SoulBot's own MCP server: a thin stdio wrapper (`mcp/stdio.ts`, run with tsx)
over the **committed** core contracts in `src/core` — version/invariants,
the Jātaka narrative-guardrail registry, T0–T6 conformance, and T4/T5 recipe
& flow validation. Everything is read-only and delegates to the same pure
modules the Vercel API uses.

## Server

| Field | Value |
|---|---|
| name | `soulbot-mcp` |
| command | `npm run mcp:stdio` (i.e. `tsx mcp/stdio.ts`) |
| install | `npm ci` (Node >=20; tsx is a devDependency) |
| transport | stdio, JSON-RPC 2.0, protocol `2024-11-05` |
| tools | `soulbot_status`, `soulbot_jataka`, `soulbot_conformance`, `soulbot_validate_recipe`, `soulbot_validate_flow` |
| license | MIT (Sai Karun Nandipati) |
| author | Sai Karun Nandipati — github.com/karun99 |

## Verify by hand

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"soulbot_status","arguments":{}}}' \
  | npx tsx mcp/stdio.ts
```

Repo checks: `npm run typecheck` covers `mcp/stdio.ts` (tsc --noEmit).

## How it is seen in Glama

Glama builds every open-source server from the repo's `Dockerfile` in a sandbox,
then introspects it over MCP and scores the tools (TDQS). This repo ships a
`Dockerfile` (`node:20-slim`, `npm ci`, `CMD ["npm","run","mcp:stdio"]`) whose
endpoint is the stdio server, so the sandbox can run the handshake above and
register the five tools.

1. Sign in at glama.ai with GitHub (OAuth; must have write access to this repo).
2. "Add your server" → https://github.com/karun99/s-ai-soulbot.
3. Glama clones, builds the Dockerfile, introspects, and lists it under your
   account when the build succeeds (distribution is withheld otherwise).
4. Optional: also submit an entry to the Official MCP Registry (below) — Glama
   re-publishes the whole official registry.

## Official MCP Registry entry (PR to modelcontextprotocol/servers)

Suggested `mcp_servers.json` record (adapt field names to the registry schema
at the time of the PR):

```json
{
  "name": "soulbot-mcp",
  "description": "S-AI SoulBot: consent-gated companion core — Jātaka guardrail registry, Sentinel authorization, and T0-T6 conformance read-only over MCP.",
  "author": "karun99",
  "website": "https://github.com/karun99/s-ai-soulbot",
  "repository": "https://github.com/karun99/s-ai-soulbot",
  "github": "karun99/s-ai-soulbot",
  "package": "npm i s-ai-soulbot",
  "tags": ["consent", "guardrails", "trust", "browser-automation", "mcp"],
  "license": "MIT"
}
```

## Awesome-MCP-Servers entry (punkpeye/awesome-mcp-servers)

```md
- [soulbot-mcp](https://github.com/karun99/s-ai-soulbot) - Consent-gated companion core: Jātaka case-law guardrails, Sentinel authority, T0-T6 conformance as read-only MCP tools.
```