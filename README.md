# S-AI SoulBot

> A trust and resilience system that performs browser tasks at the subject's cognitive level, in the subject's own measured pattern, within the subject's authorized session — and knows when to stop, and who to point to.

A **consent-gated companion harness** implementing the Adaptive Human Personification
Harness (AHPH) core: a Sentinel authorization authority, a registry of 23
precedent-based Jātaka guardrails, a six-parameter `BehavioralSignature`, consent
continuity enforcement, and T0–T6 conformance tiers.

Version 3.0.0 · MIT · [Sai Karun Nandipati](https://orcid.org/0009-0007-9218-9750)

## Documentation

The complete v3.0.0 document set lives in [`docs/`](docs/README.md): the [SRS](docs/SRS.md)
(FR-001…FR-057, PR-001…PR-007, QR-001…QR-009) and Appendices A–H — glossary, data
schemas (the executable form is `src/core/schema`), the STRIDE + LINDDUN threat
matrix, the 23-precedent [Jātaka registry](docs/Appendix-D-Jataka-Registry.md),
literature review, Muse/GrokBot case studies, the test protocol, and the deployment
guide.

---

## The short version

This is a harness that is **built to refuse**.

Every major subsystem in this repository is documented from the perspective of what it
will *not* do. It will not accept an unverifiable chain as evidence that a flow behaved
correctly. It will not report a tier that did not run as a tier that passed. It will not
let a caller state a guardrail's verdict. It will not expose a secret through an
interface that has no method to return one. It will not synthesize an unmeasured
signature parameter. It will not accept a scope that is merely *contained* where it
requires one that is *equal*. And it will not leave a Bridge Rule refusal as a bare
"no" — it names the human instead.

---

## The four invariants

Declared in [`src/core/index.ts`](src/core/index.ts) and reported by `/api/health` and
`/api/config`.

| | Invariant | Meaning |
|---|---|---|
| **IV-1** | Consent continuity | No connector action without a live consent check. |
| **IV-2** | Credential non-exposure | No secret ever enters agent address space. |
| **IV-3** | Flow determinism | Every flow replays to an identical trace, or fails loudly. |
| **IV-4** | Scope tightness | Every tool's enforced scope *equals* its declared scope. |

IV-2 is enforced **by type, not by discipline**. The `Vault` interface has no
`get`-shaped method at all, so a typed caller cannot read a secret back out even by
mistake.

---

## Architecture

```
src/core/            framework-agnostic engine — one source of truth for UI, API and tests
  schema/            Zod schemas for the whole data model (Appendix B)
  consent/           live-object consent, continuity, revocation propagation
  sentinel/          the sole authorization authority: scope, actions, budget, vault
  jata/              23-precedent guardrail registry + pure evaluation engine
  bridge/            the Bridge Rule and the delegation model
  persona/           persona synthesis from consent-gated evidence
  signature/         six-parameter BehavioralSignature — measured only
  pattern/           pacing parameters; explicitly not evasion
  trace/             SHA-256 hash-chained ActionTrace
  recipe/            recipe/flow validation for T4 and T5
  conformance/       tiers T0–T6 — the harness checks itself first

api/                 Vercel serverless handlers (all import decisions from src/core)
src/ui/              React console: seven panels over the same core
```

### API

| Route | Method | Purpose |
|---|---|---|
| `/api/authorize` | POST | The Sentinel as a service. GET is deliberately unsupported — a decision a crawler could trigger from a URL is not a decision. |
| `/api/bridge-rule` | GET, POST | The Bridge Rule ("Who is one real person you could tell this to?"). |
| `/api/config` | GET | Public config. Secret **presence** only, never value. |
| `/api/conformance` | GET, POST | Run tiers T0–T6 against supplied artifacts. |
| `/api/consent` | GET, POST | `check` / `continuity` / `revoke`. |
| `/api/guardrails` | GET, POST | The Jātaka registry, and its evaluation against declared facts. |
| `/api/health` | GET | Liveness and build identity. |
| `/api/signature` | GET, POST | `derive` / `check`. There is no "fill" mode. |
| `/api/trace` | GET, POST | Append a step to a flow's hash chain; read and verify a chain. |
| `/api/validate` | GET, POST | Artifact validation for T4/T5. |

### Console

Seven panels: **Overview** (what this deployment is and is not), **Jātaka** (the
registry plus a fact evaluator), **Sentinel** (build a request, watch it decide —
including refusing you), **Bridge Rule** (an interactive probe), **Signature** (no
autofill control, on purpose), **Trace** (read and verify a chain), **Conformance**
(runs T0–T6 and reads the result honestly).

---

## Conformance tiers

| Tier | Name | Blocking | Checks |
|---|---|---|---|
| T0 | Syntax & types | yes | Everything compiles under strict TypeScript. |
| T1 | Static analysis | no | Lint, secret scanning, static rules. |
| T2 | MCP contract | yes | Tool schemas match their declared contract. |
| T3 | Scope equality | yes | Enforced scope equals declared scope, per tool. |
| T4 | Artifact validation | yes | Recipes and flows parse and satisfy T4/T5 rules. |
| T5 | Flow trace match | yes | Replayed flows match their expected trace exactly. |
| T6 | Adversarial probes | yes | Injection, escalation and credential probes fail closed. |

**A tier that did not run is not a tier that passed.** Tiers without tooling report
`skipped`, never `pass`, and a skipped blocking tier does not pass silently in
`report.ok`. T5 with zero supplied flows is reported `skipped` — a pass would be a
false assurance from the tier that exists to catch divergence, and a failure would be
noise.

CI also runs a self-test of the harness itself: it asserts that **T3 fails** when fed
a deliberately scope-lying MCP tool.

---

## Quick start

```bash
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

## Tests

136 tests across 11 suites — one per core module, plus integration suites for the API
handlers and for resilience. Coverage thresholds: lines 70, functions 70, branches 60,
statements 70.

## Configuration

Every variable is optional and the defaults are deliberately conservative — a
deployment with nothing configured **refuses more than it permits**, because a refusal
is recoverable and a silent allow is not. See [`.env.example`](.env.example); the
notable ones are the token and cost ceilings, the rate limit, the conformance tier set,
and the optional Redis-compatible KV store.

## Deployment

Vercel, configured in [`vercel.json`](vercel.json): Vite build to `dist/`, 10 s / 1 GB
functions, SPA fallback that excludes `/api/`, and a full set of security headers
including a strict CSP, HSTS with preload, `frame-ancestors 'none'` and
`Permissions-Policy` denying camera, microphone and geolocation.

## Honest limitations

- Persistence is **ephemeral in memory** unless a KV store is attached. This weakens
  the *availability* of history, not its integrity — the ActionTrace hash chain still
  detects tampering with whatever is retained; it just cannot retain much.
- Rate limiting is **in-memory and per-instance**, and resets on cold start. It is
  documented as such rather than dressed up as a distributed limiter.
- The **browser node is external**. This repository does not ship one; `/api/health`
  reports `browserNode: 'external'` and `/api/config` reports
  `browserNodeAvailable: false`.
- T0 and T1 need the build pipeline, so they are reported `skipped` in-process.

## License

MIT © 2026 Sai Karun Nandipati. Originated from the
[Neural Harness](https://github.com/karun99/neural-harness) project.
