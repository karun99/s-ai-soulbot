# Appendix A — Glossary

**S-AI SoulBot v3.0.0**

| Term | Definition |
|---|---|
| ActionTrace | Audit artifact emitted per browser action; hash-chained (FR-028). |
| AHPH | Adaptive Human Personification Harness. |
| BehavioralSignature | Six-parameter profile of how the subject works (B.3). |
| Bridge Rule | Guardrail requiring a human-connection pointer on heavy moments; "Who is one real person you could tell this to?" |
| CAT | Computerized Adaptive Testing. |
| CDP | Chrome DevTools Protocol. |
| CIMD | Client ID Metadata Document. |
| ConnectorEvent | Normalized data from a walled platform. |
| DIF | Differential Item Functioning. |
| DRDE | Drift-Resilient Dynamic Evidence framework. |
| Grounding Mode | Resilience state under instability. |
| Guarded Action | Action requiring escalation (submit, pay, upload, message). |
| IAT | Implicit Association Test. |
| IRT | Item Response Theory. |
| Jātaka | Precedent-based resilience check (JG-001 … JG-023) drawn from the 547 Jātaka tales. |
| LINDDUN | Privacy threat modeling framework (Linkability, Identifiability, Non-repudiation, Detectability, Disclosure, Unawareness, Non-compliance). |
| MCP | Model Context Protocol. |
| MIMIC | Multiple Indicators Multiple Causes. |
| NarrativeGuardrail | Dataclass binding story, assertion, check, severity. In code: the `NarrativeGuardrail` Zod schema (B.7). |
| PatternGenerator | Component converting a signature into action parameters; `generate()` in `core/pattern`. |
| PRM | Protected Resource Metadata. |
| Provisional Mode | Automation state when the signature is incomplete (< 4 usable parameters); automation runs on declared defaults and says so. |
| Recipe | Recorded task with multiple locators per step (B.5). |
| RLCD | Reinforcement Learning for Calibrated Decisions. |
| Sentinel | Sole authorization authority — `core/sentinel`, `/api/authorize`. |
| Soul | Prompt-based companion layer (external to this repository's core). |
| Soulcard | Portable memory block for cross-chat continuity (external). |
| STRIDE | Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege. |
| Pāramī | One of the ten perfections that categorize the guardrails (Appendix D.1). |
| check_type | Machine-readable predicate a guardrail speaks to (e.g. `consent_continuity`, `measured_pattern_only`). |
| Tier (T0–T6) | Conformance tier; a tier that did not run is `skipped`, never `pass`. |
| Invariant (IV-1…IV-4) | The four system invariants: consent continuity, credential non-exposure, flow determinism, scope tightness. |
| Genesis hash | `0`×64 — the fixed predecessor of the first ActionTrace record in a chain. |
| SentinelDecision | `allow`, `deny`, or `ask_user`; `ask_user` is a success path, not a failure. |
| Delegation mode | `for` (permitted) vs `as` (refused); acts for the subject, never as the subject. |