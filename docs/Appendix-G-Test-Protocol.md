# Appendix G — Test Validation Protocol

**S-AI SoulBot v3.0.0**

## G.1 Test Levels

| Level | Scope | Method |
|---|---|---|
| Unit | Functions, classes | Mocks, fixtures (one per core module) |
| Integration | MCP contracts, consent, API handlers | Fake objects and deterministic fixtures |
| System | End-to-end flows | Deterministic replay; hash-chained traces verified before matching |
| Security | STRIDE + LINDDUN validation | Adversarial probes (T6) |
| Resilience | Grounding and provisional modes | Stress injection: low-confidence observations, unauthorized sessions, expired sessions, lying tools |
| Human-pattern | Signature coherence | Behavioral probes on pattern determinism and banding |
| Acceptance | Requirement satisfaction | RTM verification against this document set |

## G.2 Conformance Test Suite

| Tier | Scope | Blocking |
|---|---|---|
| T0 | Syntax & types (strict TypeScript) | Yes |
| T1 | Static analysis (lint, secret scanning) | No |
| T2 | MCP contract shape (tool schemas match declared contract) | Yes |
| T3 | Scope equality (enforced ≡ declared, per tool) | Yes |
| T4 | Artifact validation (recipes/flows parse and satisfy T4/T5 rules) | Yes |
| T5 | Flow trace match (replayed flows match expected trace exactly) | Yes |
| T6 | Adversarial probes (injection, escalation, credential probes fail closed) | Yes |

> **A tier that did not run is not a tier that passed.** Tiers without tooling
> report `skipped`, never `pass`, and a skipped blocking tier does not pass silently
> in `report.ok`. T0/T1 need the build pipeline and are reported `skipped`
> in-process; T5 with zero supplied flows is `skipped` — a pass would be a false
> assurance from the tier that exists to catch divergence.

CI additionally runs a self-test of the harness itself: it asserts that **T3 fails**
when fed a deliberately scope-lying MCP tool (`.github/workflows/ci.yml`).
Equivalent in-process probing: `npm run conformance` (T0–T6 from the CLI).

## G.3 Test Count Summary

Shipped and passing in this repository (verified against the suite):

| Suite | Tests |
|---|---|
| Consent | 12 |
| Persona | 13 |
| Resilience (signature coherence, provisional mode, pattern gating, Bridge Rule) | 15 |
| Sentinel (classification, scope equality, authorization, budget/vault, delegation) | 12 |
| Conformance (T2–T6, report semantics) | 14 |
| Recipe (T4/T5 validation, replay trust) | 15 |
| API integration (config, guardrails, conformance, validate, http, rate limit) | 16 |
| Signature | 8 |
| Trace (chain, verification, redaction, T5 matching) | 13 |
| Jātaka (registry, evaluation) | 10 |
| Pattern | 8 |
| **Total** | **136 across 11 suites** |

Coverage thresholds: lines 70, functions 70, branches 60, statements 70.
Run with `npm test` (development) or `npm run test:coverage` (with report).

> The draft v3.0.0 set listed 95 tests across 11 categories. The shipped suite is
> **136 tests across 11 suites**; this appendix supersedes the draft figure and the
> per-category table above is the authoritative tally.

## G.4 Defect Management

| Severity | Definition | Response |
|---|---|---|
| Critical | Credential leak, scope bypass, dependence creation, subject substitution | Immediate |
| High | Flow divergence, Bridge Rule miss, signature coherence fail | 24 hours |
| Medium | Recipe failure, performance degradation | 1 week |
| Low | Documentation, cosmetic | 1 month |

## G.5 Strix Guidelines Integration (external security assessment)

In scope for an adversarial security assessment against the shipped core:

- Jātaka guardrail bypass attempts (JG-001 … JG-023)
- Bridge Rule circumvention (pointer validation, reliance pattern)
- Scope enforcement equality (T3; both drift directions)
- Flow trace validation (T5; modified, removed, forged records)
- Credential isolation (IV-2; vault interface, redaction, just-in-time insertion)
- BehavioralSignature integrity (measured-only, coherence, provisional mode)
- PatternGenerator gate (unauthorized/expired session, provisional signature)
- Sentinel gate bypass (guarded action escalation, delegation `as`)
- ActionTrace integrity (hash chain verification)
- Consent continuity (revocation propagation, ledger states)
- Prompt injection from page content (JG-001 probe)

Out of scope: third-party OAuth providers, platform API implementations, network
infrastructure, and browser internals (the browser node is external to this
repository).

Suggested test accounts:

- **Private subject** — no public profile, behavioural connector only, signature 3/6 (provisional).
- **Public subject** — LinkedIn + X authorized, signature 6/6 (complete).