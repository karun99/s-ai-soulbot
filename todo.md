# SoulBot — task ledger

Status legend: `[x]` done and verified in this repo, with the artifact linked ·
`[~]` engineered here, but the final step needs your account or the passage of
time · `[ ]` open · `[-]` de-scoped, reason given inline.

A tick is honest only if the artifact it points at exists. Where an item needs a
Glama account, the work up to the handoff is `[~]`, not `[x]`.

## Shipped: MCP server

- [x] `mcp/tools.ts` — one tool catalog and one JSON-RPC dispatcher, shared by
      every transport
- [x] `mcp/stdio.ts` — stdio transport, newline-delimited JSON-RPC 2.0,
      protocol `2024-11-05`
- [x] `api/mcp.ts` — MCP **Streamable HTTP** transport at `POST /api/mcp`,
      Origin validation, optional bearer auth, 405-not-SSE and no-"session" by
      design (`docs/MCP_TRANSPORT.md`)
- [x] Tools: `soulbot_status`, `soulbot_jataka`, `soulbot_conformance`,
      `soulbot_validate_recipe`, `soulbot_validate_flow`
- [x] Register `soulbot-mcp` in `.mcp.json` (`npx tsx mcp/stdio.ts`)
- [x] `npm run mcp:stdio` script
- [x] `npm run mcp:smoke` — spawns the real stdio server and drives the
      handshake a client would; wired into CI
- [x] `Dockerfile` for the Glama/introspection build phase — non-root, runs the
      handshake at build time so a broken image fails the build, `.dockerignore`
      added; a CI job builds it and asserts `tools/list`
- [x] `mcp/REGISTRY.md` — tool catalogue, both transports, guardrail mapping
- [x] End-to-end handshake verified over **stdio and HTTP**:
      `initialize` → `tools/list` → `tools/call`
- [x] `npm run verify` green: lint, typecheck, **166 tests across 12 suites**,
      MCP smoke, build

### Bugs fixed while making the transport shareable

Making the second transport forced the catalog into a shared module, and the
shared module was compiled and tested for the first time. It did not compile.
All three defects passed CI because `mcp/` was absent from `tsconfig.json`
`include`:

- [x] `mcp/` added to `tsconfig.json` `include` — `npm run typecheck` now really
      covers the MCP server. `mcp/REGISTRY.md` previously claimed this coverage
      that did not exist.
- [x] `soulbot_status` reported `guards: 0` for all ten pāramīs and omitted the
      pāramī name (read `p.id` where the field is `p.parami`). Now reports
      1/4/3/5/2/1/4/2/1/1 = 23, asserted in `tests/mcp.test.ts`.
- [x] `soulbot_jataka` dropped every guardrail's rule text (read `g.rule` where
      the fields are `assertion`/`trigger`/`prohibited`/`recommended`). Now
      returns all four, asserted on value.

## Open

- [~] **Publish the container image so Glama can introspect `tools/list`.**
      Everything this repository can do is done: the `Dockerfile` is written,
      and the hosted `/api/mcp` endpoint answers the same handshake with no
      build at all — both verified locally, 30 tests in `tests/mcp.test.ts`.
      The remaining step is the Glama submission itself, which needs your
      account — sign in at glama.ai with GitHub, "Add your server" →
      `https://github.com/karun99/s-ai-soulbot`. Steps in `mcp/REGISTRY.md`.
      *(The listing is PENDING for want of a submission, not for want of an
      endpoint.)*
      **One caveat, stated rather than buried:** there is no Docker daemon in
      this environment, so the image has never actually been built here. The
      build-time handshake is real code and the equivalent handshake is proven
      against the stdio and HTTP paths, and a `docker` job in CI builds the
      image and greps for `tools` on first push — but until that job has run
      green, "the image builds" is a prediction, not a measurement. I am not
      willing to write it down as verified.
- [x] **Decide whether the browser node ships as a second MCP transport
      (SSE/HTTP) alongside stdio.** Decided and implemented: a second
      *transport*, yes — Streamable HTTP at `/api/mcp`; the *browser node*, no —
      it stays external forever, because hosting CDP execution with a live
      credential vault on a shared function would break IV-2 rather than move a
      transport. Full reasoning, including the three deliberate HTTP
      limitations, in [`docs/MCP_TRANSPORT.md`](docs/MCP_TRANSPORT.md).

## What remains is not code

Two of the original open items needed a human. One is now closed by engineering
(a hosted endpoint exists). The other needs your Glama login and nothing else —
no source-code work stands between this repo and the listing.
