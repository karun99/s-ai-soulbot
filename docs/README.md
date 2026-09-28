# S-AI SoulBot — Complete Documentation Set

**Version:** 3.0.0
**Status:** Complete
**Classification:** Internal
**Prepared by:** Sai Karun Nandipati ([ORCID](https://orcid.org/0009-0007-9218-9750))
**Repository:** https://github.com/karun99/s-ai-soulbot

## Document Index

| # | Document | File |
|---|---|---|
| 1 | SRS v3.0.0 — complete requirements specification | [SRS.md](SRS.md) |
| 2 | Appendix A — Glossary | [Appendix-A-Glossary.md](Appendix-A-Glossary.md) |
| 3 | Appendix B — Data schemas | [Appendix-B-Data-Schemas.md](Appendix-B-Data-Schemas.md) |
| 4 | Appendix C — STRIDE + LINDDUN threat matrix | [Appendix-C-Threat-Matrix.md](Appendix-C-Threat-Matrix.md) |
| 5 | Appendix D — Jātaka Guardrail Registry (JG-001 … JG-023) | [Appendix-D-Jataka-Registry.md](Appendix-D-Jataka-Registry.md) |
| 6 | Appendix E — Literature review | [Appendix-E-Literature-Review.md](Appendix-E-Literature-Review.md) |
| 7 | Appendix F — Case studies (Muse, GrokBot) | [Appendix-F-Case-Studies.md](Appendix-F-Case-Studies.md) |
| 8 | Appendix G — Test validation protocol | [Appendix-G-Test-Protocol.md](Appendix-G-Test-Protocol.md) |
| 9 | Appendix H — Deployment guide | [Appendix-H-Deployment.md](Appendix-H-Deployment.md) |

## Final Summary

**S-AI SoulBot v3.0.0 — Complete System.**

Four layers:

| Layer | Function |
|---|---|
| Soul | Three voices, commands, silent memory, soulcard, Bridge Rule |
| Jātaka | 23 case-law guardrails from the 547 Jātaka tales |
| Neural Harness | Sentinel authorization, consent-gated connectors, T2–T6 conformance |
| Browser Task Execution | Human-pattern automation in authorized sessions (external node) |

Four invariants:

| Invariant | Description |
|---|---|
| **IV-1** | Consent continuity — no connector action without a live consent check |
| **IV-2** | Credential non-exposure — no secret in agent address space |
| **IV-3** | Flow determinism — every flow replays to an identical trace or fails loudly |
| **IV-4** | Scope tightness — every tool's enforced scope equals its declared scope |

Three unique points:

1. **Case-law resilience** — Jātaka guardrails as precedent, not policy.
2. **Psychometric evaluation** — measuring the model, not the person.
3. **Non-dependence as architecture** — the Bridge Rule, enforced structurally.

Two centres:

- **Bridge Rule** (ethical) — *"Who is one real person you could tell this to?"*
- **Delegation model** (operational) — acts *for* the subject, never *as* the subject.

One sentence:

> SoulBot is a trust and resilience system that performs browser tasks at the subject's cognitive level, in the subject's own measured pattern, within the subject's authorized session — and knows when to stop, and who to point to.

## Document Status

| Document | Status |
|---|---|
| SRS v3.0.0 | Complete |
| Appendix A — Glossary | Complete |
| Appendix B — Data Schemas | Complete |
| Appendix C — STRIDE + LINDDUN | Complete |
| Appendix D — Jātaka Registry | Complete |
| Appendix E — Literature Review | Complete |
| Appendix F — Case Studies | Complete |
| Appendix G — Test Protocol | Complete |
| Appendix H — Deployment Guide | Complete |

This documentation set is maintained in the repository so that the prose and the
code stay one document set. Where the prose and the shipped implementation differ,
the code is the source of truth and this set is corrected to match it.