# Appendix F — Case Studies

**S-AI SoulBot v3.0.0**

Context for differentiation. Muse and GrokBot are external products; their figures
are reported as published at the time of writing and are provided as context, not as
verified measurements by this project.

## F.1 Meta Muse (September 2026)

| Dimension | Detail |
|---|---|
| Launch | September 8, 2026 |
| Adoption | #1 iPhone App Store, 1.8M+ downloads |
| Architecture | Dedicated secure VM per user, Sentinel permission agent |
| Security | Credentials in secure storage, JIT insertion, agent never sees passwords |
| Strengths | Planning tasks, roadblock handling, 1,500+ connectors |
| Weaknesses | Accuracy (closed restaurants), capability exaggeration, detection blocking |
| Trust | Only 8% of Americans would trust Meta with passwords |

## F.2 xAI GrokBot (August 2026)

| Dimension | Detail |
|---|---|
| Launch | August 11, 2026 (beta) |
| Pricing | Included with SuperGrok, Cursor Pro, Cursor Teams |
| Architecture | Persistent cloud VM per account; bots share a runtime |
| Security | Account-level boundary, Firecracker microVM isolation |
| Strengths | Multi-bot coordination, async handoffs, voice, draft review |
| Weaknesses | Shared security boundary, no per-action permission granularity |
| Persona | Symbolic Persona Coding (SPC), UI-based selection |

## F.3 SoulBot Differentiation

| Dimension | Muse | GrokBot | SoulBot |
|---|---|---|---|
| Infrastructure | Persistent VM per user | Persistent VM per account | Prompt + authorized session (harness core ships; browser node external) |
| Security boundary | Action-level (Sentinel) | Account-level | Sentinel + consent scope (structural) |
| Persona system | Memory + preferences | SPC + UI personas | Psychometric evaluation: BehaviouralSignature, measured only |
| Resilience layer | Sentinel permissions | Account isolation | Jātaka case-law (JG-001–023) |
| Ethical constraint | Human-in-the-loop | Draft review | Bridge Rule (non-dependence, FR-017) |
| Delegation model | Replacement | Replacement | Delegation: acts for, never as (FR-018) |
| Trust model | Hosted (Meta) | Hosted (xAI) | Portable (prompt) |
| Consent granularity | App-level | Connector + routine | Per-scope, per-purpose (FR-001–004) |
| Research basis | Product requirements | Product requirements | Behavioral biometrics, drift resilience, personality computing |

## F.4 The Unique Point

SoulBot combines three things no other agent harness has combined:

1. **Case-law resilience** — Jātaka guardrails as precedent, not policy.
2. **Psychometric evaluation** — measuring the model, not the person.
3. **Non-dependence as architecture** — the Bridge Rule, enforced structurally.

Muse and GrokBot are capability systems. SoulBot is a trust and resilience system.
The difference is not in what tasks can be performed — it is in what happens when the
task is done, and the person is still alone.