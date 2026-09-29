# SoulBot — task ledger

Status legend: `[x]` done · `[ ]` open · `[~]` in progress

## Shipped: MCP server

- [x] `mcp/stdio.ts` — stdio JSON-RPC 2.0 server, protocol `2024-11-05`
- [x] Tools: `soulbot_status`, `soulbot_jataka`, `soulbot_conformance`,
      `soulbot_validate_recipe`, `soulbot_validate_flow`
- [x] Register `soulbot-mcp` in `.mcp.json` (`npx tsx mcp/stdio.ts`)
- [x] `npm run mcp:stdio` script
- [x] `Dockerfile` for the Glama/introspection build phase
- [x] `mcp/REGISTRY.md` — tool catalogue and guardrail mapping
- [x] End-to-end handshake verified: `initialize` → `tools/list` → `tools/call`
- [x] `npm run verify` green: lint, typecheck, 136 tests, build

## Open

- [ ] Publish the container image so Glama can introspect `tools/list`
      (listing currently returns PENDING — no hosted endpoint yet)
- [ ] Decide whether the browser node ships as a second MCP transport
      (SSE/HTTP) alongside stdio
