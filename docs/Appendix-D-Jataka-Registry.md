# Appendix D — Jātaka Guardrail Registry

**S-AI SoulBot v3.0.0 · JG-001 … JG-023**

A guardrail here is **precedent, not policy**. It records what happened in a specific
case, and the evaluation engine (`core/jata/engine.ts`) asks whether the current
situation resembles that case. It does not ask whether the outcome is convenient.

The registry is a single frozen array in [`src/core/jata/registry.ts`](../src/core/jata/registry.ts);
the evaluator derives pāramī→guardrails groupings from it rather than maintaining a
second copy. The `trigger`, `prohibited` and `recommended` fields are normative
elaborations authored for this implementation so each precedent is machine-evaluable.

## D.0 Complete Registry — JG-001 to JG-023

| ID | Story | Pāramī | Assertion | Check Type | Severity | Trigger / Prohibited / Recommended |
|---|---|---|---|---|---|---|
| JG-001 | Sīhacamma Jātaka, 189 | Sacca | Silence is golden | anchor_integrity | Critical | Trigger: a claim asserted with no cited source. Prohibited: asserting without source data. Recommended: remain silent; wait for evidence. |
| JG-002 | Kapota Jātaka, 42 | Sīla | Greed leads to death | reconstitution | High | Trigger: action to acquire value the subject did not authorize. Prohibited: extracting unconsented value. Recommended: reconstitute the consent record first. |
| JG-003 | Mahakapi Jātaka, 407 | Mettā | Bear the cost with others | task_completion | High | Trigger: execution continues past the point it returns value. Prohibited: burning budget on a task that no longer pays. Recommended: complete, or stop and report cost honestly. |
| JG-004 | Sattigumba Jātaka, 503 | Paññā | Weight by source trust domain | domain_evidence | Moderate | Trigger: a claim carried across domains of unequal reliability. Prohibited: transferring trust without re-grading. Recommended: re-grade against the receiving domain. |
| JG-005 | Losaka Jātaka | Khanti | Match response to threat | equanimity | Moderate | Trigger: response exceeds measured threat. Prohibited: escalating a non-event as an attack. Recommended: hold equanimity; scale to the threat. |
| JG-006 | Kapota Jātaka, 375 | Nekkhamma | Hold only what has purpose | data_minimization | High | Trigger: data retained without declared purpose. Prohibited: accumulating unused fields. Recommended: drop to the minimum necessary set. |
| JG-007 | Analogy tradition | Paññā | Do not trust a poisoned well | measurement_bias_audit | Critical | Trigger: a measurement from an instrument of unknown validity. Prohibited: reading an uncalibrated instrument as fact. Recommended: run the bias audit first. |
| JG-008 | Alagaddūpama Sutta | Nekkhamma | Set down the raft | temporal_coherence | High | Trigger: task complete but scaffolding still live. Prohibited: holding completed infrastructure. Recommended: tear down the working context. |
| JG-009 | Sallatha Sutta | Upekkhā | Two arrows, not one | proportional_response | High | Trigger: response sized to reaction, not fault. Prohibited: compounding harm from feeling. Recommended: measure the fault; respond in proportion. |
| JG-010 | Udāna | Paññā | Each holds a part | partial_vision | High | Trigger: a partial view presented as the whole. Prohibited: generalizing from one part of the evidence. Recommended: state known and unknown parts. |
| JG-011 | Jātaka tradition | Dāna | Declare the destination | consent_continuity | Critical | Trigger: data leaving for an undeclared destination. Prohibited: sending subject data to an undeclared destination. Recommended: name it; hold until consent continuity holds. |
| JG-012 | Jātaka tradition | Nekkhamma | Set her down | non_attachment | High | Trigger: resource bound past its purpose. Prohibited: retaining a binding with no purpose. Recommended: release and record the release. |
| JG-013 | Jātaka tradition | Sacca | Do not dissolve | dissolution | Critical | Trigger: an audit record destroyed rather than superseded. Prohibited: deleting a record instead of versioning. Recommended: supersede; never dissolve. |
| JG-014 | Jātaka tradition | Sacca | Trust the demonstration | domain_evidence | High | Trigger: assertion accepted because stated, not shown. Prohibited: substituting testimony for demonstration. Recommended: require the demonstration. |
| JG-015 | Jātaka tradition | Vīriya | The wheel speaks when resistance ends | iterative_refinement | High | Trigger: identical retry of an unchanged locator. Prohibited: repeating an unchanged action against unchanged resistance. Recommended: refine or escalate after the second identical failure. |
| JG-016 | Jātaka tradition | Paññā | Test the report | instrument_trust | High | Trigger: a capability claim repeated without a test. Prohibited: relaying an untested claim as tested. Recommended: run the test and report, failures included. |
| JG-017 | Jātaka tradition | Sīla | Test before danger | shared_risk | Critical | Trigger: an irreversible action attempted before rehearsal. Prohibited: learning on the live subject. Recommended: dry-run, then execute once. |
| JG-018 | Jātaka tradition | Sīla | Act from your nature | consistent_principle | Critical | Trigger: action contradicts a standing instruction. Prohibited: doing to the subject what they forbade. Recommended: follow the instruction or ask. |
| JG-019 | Jātaka tradition | Adhiṭṭhāna | Invest in what follows | proportional_investment | Moderate | Trigger: effort on a step with no downstream consumer. Prohibited: investing in a dead end. Recommended: reallocate to steps that feed downstream. |
| JG-020 | Jātaka tradition | Sīla | Rivers do not merge | non_interference | Critical | Trigger: mixing data across principals. Prohibited: cross-contaminating subject evidence. Recommended: keep streams separate and report the boundary. |
| JG-021 | Jātaka tradition | Vīriya | Walk your own pace | pattern_coherence | High | Trigger: pacing copied from another principal. Prohibited: imitating another's rhythm. Recommended: derive cadence from this subject's parameters. |
| JG-022 | Jātaka tradition | Sacca | Borrowed sandals blister | measured_pattern_only | Critical | Trigger: behaviour copied, presented as measured. Prohibited: borrowing a pattern as measured. Recommended: use measured parameters only; derive or stand down. |
| JG-023 | Jātaka tradition | Paññā | Recalibrate on change | site_change_recalibration | High | Trigger: site changed since calibration. Prohibited: replaying into a changed world on stale calibration. Recommended: recalibrate before replaying. |

## D.1 The Ten Pāramīs as Guardrail Categories

The groupings are derived from the registry in code, so a guardrail filed under the
wrong pāramī is impossible by construction.

| Pāramī | Category | Guardrails |
|---|---|---|
| Dāna | Data sharing & consent | JG-011 |
| Sīla | Prohibited actions & scope | JG-002, JG-011, JG-017, JG-018, JG-020 |
| Nekkhamma | Resource limits | JG-006, JG-008, JG-012 |
| Paññā | Evidence & knowledge | JG-004, JG-007, JG-010, JG-014, JG-016, JG-023 |
| Vīriya | Persistence | JG-015, JG-021 |
| Khanti | Tolerance | JG-005 |
| Sacca | Truthfulness | JG-001, JG-013, JG-022 |
| Adhiṭṭhāna | Resolve | JG-019 |
| Mettā | Subject welfare | JG-003 |
| Upekkhā | Equanimity | JG-009 |

## D.2 Evaluation semantics

The engine is pure and synchronous. It runs every guardrail whose `check_type` can
speak to the declared facts and returns per-guardrail verdicts (`pass`, `violation`,
`not_applicable`) plus one aggregate outcome (`allow`, `escalate`, `block`).

Two commitments:

1. **Facts are declared, not inferred.** The engine never reaches into the world; a
   caller that cannot evidence a fact leaves it out, and the guardrail reports
   `not_applicable` rather than guessing.
2. **Silence is not consent.** Where absence of evidence is itself the risk (JG-001,
   JG-007), the evaluator reports a violation.

Aggregation: a `critical` violation blocks; a sub-critical violation escalates to the
subject per the Sentinel. Outcome is derived from the facts — the caller cannot state
a verdict (FR-047).