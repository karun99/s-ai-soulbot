# S-AI SoulBot — Software Requirements Specification v3.0.0

**Version:** 3.0.0
**Status:** Implemented, verified
**Classifier:** Functional requirements FR-001 … FR-057, Performance PR-001 … PR-007, Quality QR-001 … QR-009
**Author:** Sai Karun Nandipati
**Repository:** https://github.com/karun99/s-ai-soulbot

---

## 1. Purpose

This document is the requirements specification for **S-AI SoulBot**, a consent-gated
companion harness implementing the **Adaptive Human Personification Harness (AHPH)**
core. The reference implementation is this repository: a TypeScript engine
(`src/core/`) that is one source of truth for the serverless API (`api/`), the React
console (`src/ui/`), and the test suite (`tests/`).

The system's job is described by one sentence and ten words of warning:

> SoulBot performs browser tasks at the subject's cognitive level, in the subject's
> own measured pattern, within the subject's authorized session — and knows when to
> stop, and who to point to.

**The short version:** this is a harness that is built to refuse. It will not accept
an unverifiable chain as evidence that a flow behaved correctly. It will not report a
tier that did not run as a tier that passed. It will not let a caller state a
guardrail's verdict. It will not expose a secret through an interface that has no
method to return one. It will not synthesize an unmeasured signature parameter. It
will not accept a scope that is merely *contained* where it requires one that is
*equal*. And it will not leave a Bridge Rule refusal as a bare "no" — it names the
human instead (FR-020).

## 2. Definitions

Terms are defined in [Appendix A](Appendix-A-Glossary.md). The ten pāramīs are
defined in [Appendix D](Appendix-D-Jataka-Registry.md). Artifacts named B.1–B.7 are
defined in [Appendix B](Appendix-B-Data-Schemas.md).

## 3. Two centres

* **Bridge Rule (ethical):** *"Who is one real person you could tell this to?"*
  Every step that is heavy — irreversible, affects others, carries financial
  exposure, is emotionally loaded, or touches a sensitive domain — must either have a
  named real person, or be refused, or be run by the subject themselves (FR-015,
  FR-016, FR-017).
* **Delegation model (operational):** acts *for* the subject, never *as* the subject
  (FR-018, FR-019). The harness claims no identity of its own and never asserts the
  subject's identity.

## 4. Four invariants

| | Invariant | Meaning | Enforced by |
|---|---|---|---|
| **IV-1** | Consent continuity | No connector action without a live consent check. | `core/consent` + Sentinel check 2 |
| **IV-2** | Credential non-exposure | No secret ever enters agent address space. | `core/sentinel/vault` — the `Vault` interface has no `get`-shaped method |
| **IV-3** | Flow determinism | Every flow replays to an identical trace, or fails loudly. | `core/trace` SHA-256 chain + T5 |
| **IV-4** | Scope tightness | Every tool's enforced scope *equals* its declared scope. | `core/sentinel/scope` + T3 |

IV-2 is enforced **by type, not by discipline**: a typed caller *cannot* read a
secret back out of the vault even by mistake (FR-028).

## 5. Four layers

| Layer | In this repository | Requires external node |
|---|---|---|
| **Soul** — voices, commands, silent memory, soulcard | Rules that police it: Bridge Rule, JG-013 (do not dissolve), JG-018 (act from your nature) | Soul messenger / prompt layer |
| **Jātaka** — 23 case-law guardrails | `core/jata` — full registry and pure evaluator | — |
| **Neural Harness** — AHPH validation, consent-gated connectors, conformance | `core/consent`, `core/sentinel`, `core/persona`, `core/signature`, `core/conformance` | Connector MCP servers (linkedin, x) |
| **Browser Task Execution** — human-pattern automation | `core/pattern` parameter generation, `core/recipe`, `core/trace` | Chromium via CDP on the subject-controlled machine |

## 6. System overview

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

### 6.1 The Sentinel authorization order

Every action that leaves the harness passes through `authorize()` in a fixed order
(FR-008). The order is part of the contract:

1. **Scope equality (T3)** — is the tool telling the truth about its scope?
2. **Consent continuity** — a live grant exists *right now* for this scope?
3. **Delegation model** — acting *for*, never *as*?
4. **Bridge Rule** — a dependence risk, or a heavy moment?
5. **Jātaka guardrails** — do the declared facts resemble a recorded case?
6. **Budget** — headroom remains?
7. **Guarded action** — does this class require the subject's say-so?

Checks 1–4 are deny-only (a failure short-circuits). Check 5 may yield `block`,
`escalate`, or `allow`. Check 7 may return `ask_user`, which is a success path — an
attended human decision — not a failure.

The only method that makes an authorization decision is `POST /api/authorize`. `GET`
is deliberately unsupported: a decision a crawler could trigger from a URL is not a
decision (FR-009).

## 7. Functional requirements

### 7.1 Consent (FR-001 … FR-007) — IV-1

| ID | Requirement |
|---|---|
| FR-001 | The system SHALL accept a Consent Object (B.1) in which every connector declares per-scope grants that carry a declared purpose when granted, or a reason when declined. |
| FR-002 | The system SHALL provide a live consent check at the moment of an action: connector live, scope granted, purpose declared, not expired. A failed check resolves to `deny`, never to a silent allow. |
| FR-003 | Consent SHALL be revocable by the subject per connector or globally; revocation SHALL invalidate every persona derived from the revoked evidence. |
| FR-004 | Revocation SHALL propagate within `REVOCATION_PROPAGATION_MS` (60 000 ms) and every connector SHALL support `disabled` / `revoked` status (B.1). |
| FR-005 | The system SHALL maintain a continuity ledger and assess it as `intact`, `reconstituted`, `discontinuous`, or `unresolved`. A discontinuous or unresolved trail SHALL NOT support any derived verdict. |
| FR-006 | An empty or malformed ledger SHALL be treated as `unresolved`, never as consent. |
| FR-007 | Data leaving the harness for a destination not named to the subject SHALL be refused by JG-011 (consent continuity, critical). |

### 7.2 Sentinel (FR-008 … FR-013) — the sole authorization authority

| ID | Requirement |
|---|---|
| FR-008 | The Sentinel SHALL be the only component that authorizes an action, and SHALL evaluate checks in the fixed order of §6.1, short-circuiting on any deny. |
| FR-009 | Authorization SHALL be available only through `POST /api/authorize`; the route SHALL not answer GET. |
| FR-010 | Guarded action classes — submit, pay, upload, message and their variants — SHALL require the subject's approval when the subject is available, and SHALL be refused when the subject is not available (`guarded_action_unattended`). |
| FR-011 | An irreversible or credential-bearing guarded action SHALL say so in the approval question before the subject decides. |
| FR-012 | A subject's prior approval for an exact request within the same flow (`preApproved`) SHALL authorize only that request. |
| FR-013 | A guarded action performed without a Sentinel approval SHALL be a T5 flow-validation failure (guarded action must be routed through the Sentinel). |

### 7.3 Scope tightness (FR-014) — IV-4

| ID | Requirement |
|---|---|
| FR-014 | Scope equality SHALL be checked per tool: `enforcedScopes` must be *equal* to `declaredScopes`. A scope actor — declared ⊆ enforced or enforced ⊆ declared — SHALL fail the batch (T3). A lying tool SHALL be denied before any further evaluation. |

### 7.4 Bridge Rule (FR-015 … FR-020) — non-dependence as architecture

| ID | Requirement |
|---|---|
| FR-015 | The Bridge Rule question SHALL be, verbatim: *"Who is one real person you could tell this to?"* |
| FR-016 | A heavy moment (irreversible, affects others, financial exposure > 0, emotionally loaded, or a sensitive domain: health / legal / financial / safety / relationship) SHALL require a valid connection pointer or the subject's own execution. |
| FR-017 | A step that displaces the subject, delegates a decision the subject should make, or forms a reliance pattern (≥ 3 leans on one action class, or escalation ≥ 0.5) SHALL be a `dependence_risk` refusal that names the required pointer (this is STRIDE E-004). |
| FR-018 | The deployment model SHALL be `for` only; any attempt to frame the harness *as* the subject SHALL throw `delegation_violation` and deny. |
| FR-019 | Pointers SHALL be validated: a URL, a bot/assistant placeholder, or a placeholder word (`name, someone, person, insert, example, todo, tbd, xxx`) SHALL be rejected as a pointer. |
| FR-020 | A Bridge Rule refusal SHALL be constructive: it names the real person to tell (or the specialist for the sensitive domain) rather than withholding a bare "no". |

### 7.5 Jātaka guardrails (FR-021) — precedent, not policy

| ID | Requirement |
|---|---|
| FR-021 | The system SHALL carry a registry of exactly 23 precedent-based guardrails (JG-001 … JG-023, Appendix D) and evaluate them against *declared facts only* (never inferred), reporting `pass`, `violation`, or `not_applicable`, with an aggregate `allow` / `escalate` / `block`. Silence is not consent: where absence of evidence is itself the risk (JG-001, JG-007), a violation is reported. |

### 7.6 BehavioralSignature (FR-022 … FR-024) — psychometric evaluation

| ID | Requirement |
|---|---|
| FR-022 | The signature SHALL expose exactly six parameters — decision_framing, information_appetite, risk_posture, communication_register, task_tempo, escalation_criteria — each validated against its own domain (B.3). |
| FR-023 | A parameter SHALL be usable only with a valid domain value and confidence ≥ 0.5; everything else is *unmeasured* and reported as such. No parameter is ever populated with a guess, default, or import (JG-022). |
| FR-024 | Below 4 usable parameters the signature SHALL enter `provisional_mode`; a provisional signature SHALL NOT drive pattern generation, and arrests the Signature panel's automation claim to declared defaults, spoken as such (FR-026). |

### 7.7 Pattern generation (FR-025 … FR-027) — fidelity, not evasion

| ID | Requirement |
|---|---|
| FR-025 | `generate()` SHALL refuse `session_not_authorized`, `session_expired`, `subject_mismatch`, `signature_provisional`, `signature_incoherent`, and `guardrail_violation`, in that order. There is no code path that produces parameters for an unauthorized session. |
| FR-026 | Delays SHALL be bounded inside the human band — keystroke 55–320 ms, hover 120–1400 ms, step pause 180–2600 ms — and SHALL be derived from the subject's own measured parameters (JG-021, JG-022). |
| FR-027 | Generation SHALL be deterministic per seed, so a flow replays to an identical pacing plan and a test can assert exact output. |

### 7.8 Trace (FR-028 … FR-031) — IV-3

| ID | Requirement |
|---|---|
| FR-028 | Every ActionTrace step SHALL chain attributes to the previous record via SHA-256 over the canonical JSON (key order normalized); the first record SHALL link to the genesis hash. |
| FR-029 | The chain SHALL reject out-of-order steps within a flow and cross-flow records; verification SHALL catch a modified record (naming the index) and a removed record. |
| FR-030 | Trace persistence SHALL redact secrets and secret-shaped values before writing (`redact` / `redactDeep`), and SHALL never invert a redacted value back into a value. |
| FR-031 | A flow SHALL match its expected trace exactly when every declared step occurred and no undeclared step did (T5); an unverifiable chain is a divergence, not evidence. |

### 7.9 Recipe & flow (FR-032 … FR-037) — T4/T5

| ID | Requirement |
|---|---|
| FR-032 | A Recipe SHALL parse against schema B.5, with steps carrying multiple locators (role_name, css, text, xpath, test_id). A step with exactly one locator SHALL fail T4 because it cannot be healed (FR-034). |
| FR-033 | Success conditions SHALL be parsed by a grammar (§ supported forms: `url_contains:`, `text_contains:`, `element_present:`, `condition:`); an unparseable condition SHALL fail. |
| FR-034 | A step that addresses an element without a locator, uses a document-wide CSS selector, has non-contiguous step numbers, or navigates without a URL SHALL fail T4. |
| FR-035 | A Flow SHALL route every guarded action through the Sentinel (`ahph-sentinel.authorize`) before the browser may execute it; a guarded action not authorized by the Sentinel SHALL fail T5, as shall a flow with no Sentinel step. |
| FR-036 | A flow SHALL declare `max_tokens` and `max_cost_usd`; a flow without them (or with an unparseable success condition) SHALL fail T5. |
| FR-037 | Replay stats SHALL enforce a trust floor of 0.67: a recipe failing more than a third of its runs SHALL NOT be replayed; a never-replayed recipe SHALL be untrustworthy rather than perfect. |

### 7.10 Credentials (FR-038 … FR-040) — IV-2

| ID | Requirement |
|---|---|
| FR-038 | The `Vault` interface SHALL expose `register`, `mintInsertion`, `isLive`, and `revoke` only; there SHALL be no method that returns a secret value (FR-105). |
| FR-039 | Just-in-time insertion SHALL be ephemeral (TTL ≤ 30 000 ms by default) and carry no secret material in the instruction object. |
| FR-040 | Anything matching a secret shape (`sk-…`, `ghp_…`, `Bearer …`, JWTs, `password=`, `token=`, `secret=`) SHALL be redacted to `[redacted]` before any log, trace, or process boundary. |

### 7.11 Conformance (FR-041 … FR-043) — the harness checks itself first

| ID | Requirement |
|---|---|
| FR-041 | The system SHALL implement conformance tiers T0–T6 with the semantics of Appendix G.2: a tier that did not run SHALL be reported `skipped`, never `pass`. |
| FR-042 | `report.ok` SHALL be true only when no *blocking* tier failed; skipped blocking tiers SHALL NOT pass silently. |
| FR-043 | T6 SHALL assert fail-closed for six probes: prompt injection (JG-001), scope escalation (T3), pattern generation without authorization, borrowed pattern (JG-022), principal-boundary crossing (JG-020), and a forged trace. |

### 7.12 API (FR-044 … FR-052)

| ID | Requirement |
|---|---|
| FR-044 | The API SHALL expose the routes of §8. GET SHALL be returned for config, health, guardrails, signature, trace, and the tier metadata; POST for authorize, bridge-rule, conformance, consent, guardrails, signature, trace, and validate. |
| FR-045 | `/api/config` SHALL expose public configuration only and, for secrets, their *presence* (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SENTINEL_SIGNING_KEY`) — never a value. |
| FR-046 | `/api/health` SHALL report liveness and build identity, and SHALL truthfully report `browserNodeAvailable: false` (serverless hosts no browser node). |
| FR-047 | `/api/guardrails` SHALL derive verdicts from supplied facts only; a verdict value sent by the caller SHALL be ignored. |
| FR-048 | `/api/conformance` SHALL return `200` with the report even when a blocking tier fails — the failure is the report — and SHALL list tier metadata on GET. |
| FR-049 | `/api/validate` SHALL report per-artifact T4/T5 results. |
| FR-050 | HTTP bodies SHALL be read as object, JSON-string, or empty; a malformed JSON body SHALL be rejected, not thrown as a crash. |
| FR-051 | A fixed-window rate limit SHALL apply per client (default 120 requests / 60 000 ms) and SHALL refuse on breach (D-001). |
| FR-052 | Configuration SHALL fall back to conservative defaults when nothing is configured (see §6 of Appendix H). |

### 7.13 Console (FR-053 … FR-057)

| ID | Requirement |
|---|---|
| FR-053 | The console SHALL present seven panels over the same core: Overview, Jātaka, Sentinel, Bridge Rule, Signature, Trace, and Conformance. |
| FR-054 | The Signature panel SHALL have no autofill control; there is no interface to fabricate a signature. |
| FR-055 | The Sentinel panel SHALL build a request, watch it decide, and show its own refusals. |
| FR-056 | The Bridge panel SHALL run an interactive probe and show pointer rejection. |
| FR-057 | The Conformance panel SHALL run T0–T6 and read the result honestly, including skips. |

## 8. API reference

| Route | Method | Purpose |
|---|---|---|
| `/api/authorize` | POST | The Sentinel as a service. `GET` deliberately unsupported (FR-009). |
| `/api/bridge-rule` | GET, POST | The Bridge Rule ("Who is one real person you could tell this to?"). |
| `/api/config` | GET | Public config; secret *presence* only, never value. |
| `/api/conformance` | GET, POST | Run tiers T0–T6 against supplied artifacts. |
| `/api/consent` | GET, POST | `check` / `continuity` / `revoke`. |
| `/api/guardrails` | GET, POST | The Jātaka registry, and its evaluation against declared facts. |
| `/api/health` | GET | Liveness and build identity. |
| `/api/signature` | GET, POST | `derive` / `check`. There is no "fill" mode. |
| `/api/trace` | GET, POST | Append a step to a flow's hash chain; read and verify a chain. |
| `/api/validate` | GET, POST | Artifact validation for T4/T5. |

## 9. Performance requirements

| ID | Requirement |
|---|---|
| PR-001 | `authorize()` SHALL short-circuit and resolve in constant time relative to the number of contracts, with no network dependency. |
| PR-002 | Jātaka evaluation SHALL be pure and synchronous over the 23-precedent registry, with no I/O in the hot path. |
| PR-003 | Trace hashing (SHA-256 over canonical JSON) SHALL complete within interactive latency for flow-length chains. |
| PR-004 | Keystroke/hover/step-pause delays SHALL remain inside the bands of FR-026 for every derived pattern; `expectedTypingDuration` SHALL agree with `keystrokeDelays`. |
| PR-005 | Pattern generation SHALL be deterministic per seed (xorshift32) without RNG state leaks across calls. |
| PR-006 | The default per-flow ceilings SHALL be 500 000 tokens and US$0.50 when a flow does not declare its own (D-002 → budget enforcement). |
| PR-007 | The rate limit SHALL apply fixed windows per client (120 / 60 000 ms default) without a distributed dependency (documented per-instance). |

## 10. Quality requirements

| ID | Requirement |
|---|---|
| QR-001 | **Honest reporting:** no tier reported `pass` that did not run; no verdict reported that the caller declared. |
| QR-002 | **Credential hygiene:** the server exposes no secret value through any interface; the browser never uses CSP- or log-visible credentials. |
| QR-003 | **Determinism:** identical input yields identical traces (`canonicalise` is key-order independent; generation is seed-deterministic). |
| QR-004 | **Auditability:** every authorization decision is attributable (reasons list, `decidedBy`, `decidedAt`) and every action is traceable (FR-028). |
| QR-005 | **Fail-closed default:** unconfigured deployment refuses more than it permits; an unknown connector is never assumed granted. |
| QR-006 | **Documented honesty about limits:** persistence is ephemeral without a KV store; rate limiting is per-instance; the browser node is external — each stated in `/api/config` notes and §9 of the README. |
| QR-007 | **Coverage discipline:** test suite meets per-file coverage thresholds (lines 70 / functions 70 / branches 60 / statements 70). |
| QR-008 | **Security posture:** STRIDE + LINDDUN mitigations of Appendix C are structural where possible (Vault by type, Trace by hash chain, scope by equality). |
| QR-009 | **Accessibility:** the console is operable without a pointing device (focusable controls, color-independent status), per the UI primitives contract. |

## 11. Baseline reconciliation

The draft v3.0.0 document set stated **134 functional / 13 performance / 10 quality**
requirements and **95 tests across 11 categories** at the full-system level (Soul
messenger, browser node, connectors). This repository ships the **harness core** — the
trust and resilience layer — so the totals here reflect what ships:

* **Requirements:** 57 functional, 7 performance, 9 quality (this document).
* **Tests:** 136 across 11 suites, all passing (Appendix G).
* **Guardrails:** 23 Jātaka precedents (Appendix D).

Where the draft and the implementation disagreed (deployment stack, CLI, test count,
API surface), the code is the source of truth and this set has been corrected to
match it. The deliberate refusals listed in §1 are each pinned to a test in the
suite.