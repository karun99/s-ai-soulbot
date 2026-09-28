# Appendix C — STRIDE + LINDDUN Threat Matrix

**S-AI SoulBot v3.0.0**

The requirement ids below are the SRS v3.0.0 clauses; the **implementation status**
column maps each mitigation to the shipped code. A mitigation marked *structural* is
enforced by type or by construction; one marked *operator* depends on the deployment
(as documented in Appendix H).

## C.1 STRIDE Matrix

| Category | ID | Threat | Mitigation | Req | Implementation status |
|---|---|---|---|---|---|
| Spoofing | S-001 | MCP server impersonation | RFC 9207 `iss` validation | SI-003 | Operator (cryptographic bearer at connector boundary) |
| Spoofing | S-002 | OAuth client impersonation | CIMD registration | SI-002 | Operator (CIMD document at provider boundary) |
| Spoofing | S-003 | Session hijack | Sentinel isolation | FR-111 | Structural: decisions are POST-only (FR-009), no GET-triggered authorization |
| Spoofing | S-004 | Browser identity spoof | No spoofing allowed | FR-113 | Structural: delegation model refuses `as` (FR-018) |
| Tampering | T-001 | Data in transit modified | TLS 1.3 | CI-002 | Operator (transport) |
| Tampering | T-002 | Persona model modified | Signed validation reports | QR-004 | Operator (audit retention) |
| Tampering | T-003 | Recipe modified | T4 schema validation | FR-132 | Structural: `Recipe` Zod schema + `validateRecipe` (FR-032–034) |
| Tampering | T-004 | ActionTrace modified | Append-only hash chain | CI-004 | Structural: SHA-256 chain + `verifyChain` (FR-028–031) |
| Repudiation | R-001 | Subject denies consent | Consent audit log | FR-108 | Structural: ledger + `revocable: true` by contract (FR-005–006) |
| Repudiation | R-002 | Operator denies action | ActionTrace | QR-004 | Structural: attributable decision (`reasons`, `decidedBy`, `decidedAt`) |
| Info Disclosure | I-001 | Credential to agent | Vault isolation, no `get` | FR-105 | Structural by type: `Vault` API has no secret-returning method (FR-038) |
| Info Disclosure | I-002 | Walled data in logs | Encryption + redaction | CI-001 | Structural: `redact` / `redactDeep` at every boundary (FR-040) |
| Info Disclosure | I-003 | Session data in trace | Redaction | CI-004 | Structural: trace persistence redacts (FR-030) |
| Denial | D-001 | Rate limit exhaustion | Backoff + quotas | FR-124 | Structural: fixed-window rate limit (FR-051) |
| Denial | D-002 | Budget exhaustion | Budget enforcement | FR-125 | Structural: per-flow ceilings + `evaluateBudget` (FR-036, PR-006) |
| Denial | D-003 | Browser crash | Reconnect + resume | FR-110 | Operator (browser node is external) |
| Elevation | E-001 | Scope bypass | T3 scope equality | FR-131 | Structural: declared ≡ enforced, batch fail (FR-014) |
| Elevation | E-002 | Guarded action without approval | Escalation required | FR-099 | Structural: `ask_user` / `guarded_action_unattended` (FR-010) |
| Elevation | E-003 | JS execution in sub-agent | JS disabled | FR-107 | Operator (browser node policy) |
| Elevation | E-004 | Dependence creation | Bridge Rule | FR-017 | Structural: `dependence_risk` refusal (FR-017) |
| Elevation | E-005 | Pattern borrow | Signature measured only | FR-080 | Structural by test: JG-022 + pattern refusal (FR-023, FR-025) |

## C.2 LINDDUN Privacy Matrix

| Category | ID | Threat | Mitigation | Implementation status |
|---|---|---|---|---|
| Linkability | L-001 | Cross-connector correlation | Scope isolation | Structural: per-scope grants, enumerated grants never assumed (FR-002) |
| Identifiability | I-001 | Subject re-identification | Consent-gated only | Structural: no connector read without a live, purpose-declared grant |
| Non-repudiation | N-001 | Subject cannot deny data | Consent audit | Structural: ledger + audit log (FR-005) |
| Detectability | D-001 | Presence inferred | No telemetry | Structural: serverless core emits no telemetry |
| Disclosure | D-002 | Data leak | Encryption at rest | Operator (store choice, Appendix H §5) |
| Unawareness | U-001 | Subject unaware of use | Consent UI | Structural: purpose declared per scope; console shows grants |
| Non-compliance | N-002 | GDPR violation | Data portability | Operator: consent revocation propagates; ephemeral-by-default |

## C.3 Security posture summary

| Property | How it is structural |
|---|---|
| No secret returns | The `Vault` interface has no value-returning method; `mintInsertion` returns an instruction with no material (IV-2, FR-038). |
| No lying scope | `checkScopeEquality` fails both directions of drift and the batch fails (FR-014). |
| No forged trace | Chain validation catches modification and removal by index (FR-029). |
| No borrowed pattern | `generate()` refuses unauthorized sessions, provisional signatures, and any non-measured source (FR-025, JG-022). |
| No dependence | The Bridge Rule refuses displacement- and reliance-pattern steps without a named person (FR-017). |
| No silent pass | A conformance tier that did not run is `skipped`, and `report.ok` ignores skips (FR-041–042). |