# Appendix H — Deployment Guide

**S-AI SoulBot v3.0.0**

This guide describes deploying the shipped harness core (this repository) to Vercel.
The **browser node is external**: CDP execution, Chromium, and the credential vault
run on the subject-controlled machine; this deployment serves the trust and
resilience core only, and reports `browserNodeAvailable: false` honestly.

## H.1 Prerequisites

| Component | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Browser (execution node) | Chromium 120+ within an authorized session, on the subject-controlled machine |
| MCP client | Claude Desktop / Cursor (for the MCP servers of Appendix H.3 on the subject side) |

## H.2 Local installation

```bash
git clone https://github.com/karun99/s-ai-soulbot.git
cd s-ai-soulbot
npm install

npm run dev          # Vite dev server on :5173, /api proxied to :3000
npm run dev:vercel   # the real runtime, including the serverless handlers
```

Requires Node ≥ 20. Only three runtime dependencies: `react`, `react-dom`, `zod`.

### Verify

```bash
npm run verify       # lint + typecheck + test + build
npm run conformance  # T0–T6 from the CLI
```

## H.3 Subject-side MCP server configuration (client config)

The Sentinel and the browser node are invoked by the subject's MCP client. The
Sentinel is deployable from this repository (Vercel), the browser node runs
ssh-adjacent — on the subject's machine — and speaks `stdio`:

```json
{
  "mcpServers": {
    "ahph-consent": {
      "url": "https://<your-app>.vercel.app/mcp/consent",
      "transport": "streamable-http"
    },
    "ahph-linkedin": {
      "url": "https://<your-app>.vercel.app/mcp/linkedin",
      "transport": "streamable-http"
    },
    "ahph-sentinel": {
      "url": "https://<your-app>.vercel.app/api/authorize",
      "transport": "streamable-http"
    },
    "ahph-browser": {
      "command": "your-browser-node",
      "args": ["serve"],
      "transport": "stdio"
    }
  }
}
```

The T2 built-in contracts name the canonical tool set
(`src/core/conformance/index.ts`): `ahph-consent.check_consent`,
`ahph-consent.revoke_consent`, `ahph-sentinel.authorize`,
`ahph-sentinel.mint_insertion`, `ahph-browser.execute`,
`ahph-engine.render_persona_prompt`.

## H.4 Deploying to Vercel

```bash
npm run deploy        # vercel --prod
```

Or push to GitHub and connect the repository to Vercel (`vercel.json` is present):
Vite build to `dist/`, 10 s / 1 GB functions, SPA fallback that excludes `/api/`,
and a full set of security headers — strict CSP, HSTS `preload`,
`frame-ancestors 'none'`, and `Permissions-Policy` denying camera, microphone and
geolocation.

## H.5 Configuration

Every variable is optional; the defaults are deliberately conservative — a deployment
with nothing configured **refuses more than it permits**, because a refusal is
recoverable and a silent allow is not. See [`.env.example`](../.env.example).

| Variable | Default | Meaning |
|---|---|---|
| `SOULBOT_VERSION` | `3.0.0` | Identity reported in `/api/health` and the console header |
| `SOULBOT_DEFAULT_MAX_TOKENS` | `500000` | Per-flow ceiling when a flow does not declare its own |
| `SOULBOT_DEFAULT_MAX_COST_USD` | `0.50` | Per-flow cost ceiling |
| `SOULBOT_RATE_LIMIT_REQUESTS` | `120` | Fixed-window rate limit per client |
| `SOULBOT_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `SOULBOT_CONFORMANCE_TIERS` | `T2,T3,T4,T5,T6` | Tiers runnable in-process (T0/T1 need the build pipeline) |
| `KV_REST_API_URL` | — | Optional Redis-compatible REST store (Vercel KV / Upstash) |
| `KV_REST_API_TOKEN` | — | Store token (presence-only exposure, never a value) |
| `SENTINEL_SIGNING_KEY` | — | Optional; for deployments that sign their own decisions |

No secret belongs in the repo or in the config surface. The server holds no secret
at all: `Vault` is `reference_only` on serverless; the browser node performs
just-in-time insertion into authorized sessions (IV-2, FR-038/039).

## H.6 Explicit limitations of a plain Vercel deployment

- Persistence is **ephemeral in memory** unless a KV store is attached. This weakens
  the *availability* of history, not its integrity — the ActionTrace hash chain still
  detects tampering with whatever is retained; it just cannot retain much.
- Rate limiting is **in-memory and per-instance**, and resets on cold start. It is
  documented as such rather than dressed up as a distributed limiter.
- **The browser node is external.** This repository does not ship one;
  `/api/health` reports `browserNode: 'external'` and `/api/config` reports
  `browserNodeAvailable: false`.
- T0 and T1 need the build pipeline, so they are reported `skipped` in-process.

## H.7 Deployment checklist

- [ ] Subject consent obtained for all connectors (B.1, per-scope with purpose)
- [ ] Sentinel vault initialized with credentials — on the browser node, reference-only from the server (FR-038)
- [ ] BehavioralSignature derived with ≥ 4 usable parameters, or automation declared as provisional (FR-024)
- [ ] Authorized browser session available (FR-025)
- [ ] MCP servers registered in the subject's client (H.3)
- [ ] T0–T6 conformance run and blocking tiers passed (FR-041–042)
- [ ] ActionTrace log writable (KV attached for durable history)
- [ ] Recipe store initialized
- [ ] Budget configured per flow (FR-036, PR-006)
- [ ] Bridge Rule tested — including pointer rejection and a `dependence_risk` refusal (FR-019)