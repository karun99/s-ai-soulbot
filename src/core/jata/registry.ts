/**
 * Appendix D — Jātaka Guardrail Registry (JG-001 … JG-023).
 *
 * Provenance note: `id`, `story_name`, `story_number`, `parami`, `assertion`,
 * `check_type` and `severity` are transcribed from Appendix D of the SRS. The
 * `trigger`, `prohibited` and `recommended` fields are normative elaborations
 * authored for this implementation so that each precedent is machine-evaluable;
 * the SRS registry table does not specify their wording.
 *
 * A guardrail here is precedent, not policy. It records what happened in a
 * specific case, and the evaluation engine asks whether the current situation
 * resembles that case. It does not ask whether the outcome is convenient.
 */

import type { NarrativeGuardrail, Parami } from '../schema/index.js'

type GuardrailInput = Omit<NarrativeGuardrail, 'story_ref'> & { story_ref?: string }

const define = (g: GuardrailInput): NarrativeGuardrail => ({
  ...g,
  story_ref: g.story_ref ?? (g.story_number ? `${g.story_name}, ${g.story_number}` : g.story_name),
})

export const JATAKA_REGISTRY: readonly NarrativeGuardrail[] = Object.freeze([
  define({
    id: 'JG-001',
    story_name: 'Sīhacamma Jātaka',
    story_number: 189,
    parami: 'Sacca',
    assertion: 'Silence is golden',
    trigger: 'A claim is asserted with no cited source data behind it.',
    prohibited: 'Asserting without source data.',
    recommended: 'Remain silent; wait for evidence.',
    check_type: 'anchor_integrity',
    severity: 'critical',
  }),
  define({
    id: 'JG-002',
    story_name: 'Kapota Jātaka',
    story_number: 42,
    parami: 'Sīla',
    assertion: 'Greed leads to death',
    trigger: 'An action is proposed to acquire value the subject did not authorize.',
    prohibited: 'Acting to extract unconsented value.',
    recommended: 'Reconstitute the consent record before acting.',
    check_type: 'reconstitution',
    severity: 'high',
  }),
  define({
    id: 'JG-003',
    story_name: 'Mahakapi Jātaka',
    story_number: 407,
    parami: 'Mettā',
    assertion: 'Bear the cost with others',
    trigger: 'Execution continues past the point where remaining work costs more than it returns.',
    prohibited: 'Burning the subject’s budget on a task that no longer pays.',
    recommended: 'Complete the task, or stop and report the cost honestly.',
    check_type: 'task_completion',
    severity: 'high',
  }),
  define({
    id: 'JG-004',
    story_name: 'Sattigumba Jātaka',
    story_number: 503,
    parami: 'Paññā',
    assertion: 'Weight by source trust domain',
    trigger: 'A claim is carried across domains with unequal reliability.',
    prohibited: 'Transferring trust from a strong source to a weak one without re-grading.',
    recommended: 'Re-grade the claim against the trust profile of the receiving domain.',
    check_type: 'domain_evidence',
    severity: 'moderate',
  }),
  define({
    id: 'JG-005',
    story_name: 'Losaka Jātaka',
    story_number: null,
    parami: 'Khanti',
    assertion: 'Match response to threat',
    trigger: 'The response magnitude exceeds the measured threat level.',
    prohibited: 'Escalating a non-event as though it were an attack.',
    recommended: 'Hold equanimity; scale the response to the observed threat.',
    check_type: 'equanimity',
    severity: 'moderate',
  }),
  define({
    id: 'JG-006',
    story_name: 'Kapota Jātaka',
    story_number: 375,
    parami: 'Nekkhamma',
    assertion: 'Hold only what has purpose',
    trigger: 'Data is retained without a declared purpose, or beyond the minimum needed.',
    prohibited: 'Accumulating fields the task never uses.',
    recommended: 'Drop the retained fields to the minimum necessary set.',
    check_type: 'data_minimization',
    severity: 'high',
  }),
  define({
    id: 'JG-007',
    story_name: 'Analogy tradition',
    story_number: null,
    parami: 'Paññā',
    assertion: 'Do not trust a poisoned well',
    trigger: 'A measurement is produced by an instrument of unknown validity.',
    prohibited: 'Reading a result from an uncalibrated instrument as fact.',
    recommended: 'Run the bias audit before treating the measurement as load-bearing.',
    check_type: 'measurement_bias_audit',
    severity: 'critical',
  }),
  define({
    id: 'JG-008',
    story_name: 'Alagaddūpama Sutta',
    story_number: null,
    parami: 'Nekkhamma',
    assertion: 'Set down the raft',
    trigger: 'A task reaches its success condition but the harness keeps the scaffolding live.',
    prohibited: 'Holding completed infrastructure past its purpose.',
    recommended: 'Tear down the working context once the condition is met.',
    check_type: 'temporal_coherence',
    severity: 'high',
  }),
  define({
    id: 'JG-009',
    story_name: 'Sallatha Sutta',
    story_number: null,
    parami: 'Upekkhā',
    assertion: 'Two arrows, not one',
    trigger: 'A failure provokes a response sized to the reaction rather than the fault.',
    prohibited: 'Compounding harm by responding to feeling instead of to fact.',
    recommended: 'Measure the fault; respond in proportion to it.',
    check_type: 'proportional_response',
    severity: 'high',
  }),
  define({
    id: 'JG-010',
    story_name: 'Udāna',
    story_number: null,
    parami: 'Paññā',
    assertion: 'Each holds a part',
    trigger: 'A partial view of a system is presented as the whole system.',
    prohibited: 'Generalising from one part of the evidence to all of it.',
    recommended: 'State the part that is known and the part that is not.',
    check_type: 'partial_vision',
    severity: 'high',
  }),
  define({
    id: 'JG-011',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Dāna',
    assertion: 'Declare the destination',
    trigger: 'Data is about to leave the harness for a destination not yet named to the subject.',
    prohibited: 'Sending subject data to an undeclared destination.',
    recommended: 'Name the destination and hold until consent continuity holds.',
    check_type: 'consent_continuity',
    severity: 'critical',
  }),
  define({
    id: 'JG-012',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Nekkhamma',
    assertion: 'Set her down',
    trigger: 'A resource remains bound to a persona after its purpose ends.',
    prohibited: 'Retaining a binding with no remaining purpose.',
    recommended: 'Release the binding and record the release.',
    check_type: 'non_attachment',
    severity: 'high',
  }),
  define({
    id: 'JG-013',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Sacca',
    assertion: 'Do not dissolve',
    trigger: 'A persona, evidence trail, or audit record is destroyed rather than superseded.',
    prohibited: 'Deleting the record of a state instead of versioning past it.',
    recommended: 'Supersede; never dissolve.',
    check_type: 'dissolution',
    severity: 'critical',
  }),
  define({
    id: 'JG-014',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Sacca',
    assertion: 'Trust the demonstration',
    trigger: 'An assertion is accepted because it was stated rather than because it was shown.',
    prohibited: 'Substituting testimony for demonstration.',
    recommended: 'Require the demonstration before accepting the assertion.',
    check_type: 'domain_evidence',
    severity: 'high',
  }),
  define({
    id: 'JG-015',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Vīriya',
    assertion: 'The wheel speaks when resistance ends',
    trigger: 'A step fails and the harness retries the identical locator without refinement.',
    prohibited: 'Repeating an unchanged action against unchanged resistance.',
    recommended: 'Refine the locator or escalate after the second identical failure.',
    check_type: 'iterative_refinement',
    severity: 'high',
  }),
  define({
    id: 'JG-016',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Paññā',
    assertion: 'Test the report',
    trigger: 'A capability or accuracy claim is repeated without a test behind it.',
    prohibited: 'Relaying an untested claim as tested.',
    recommended: 'Run the test and report the result, including the failures.',
    check_type: 'instrument_trust',
    severity: 'high',
  }),
  define({
    id: 'JG-017',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Sīla',
    assertion: 'Test before danger',
    trigger: 'An action that cannot be undone is attempted before it is rehearsed.',
    prohibited: 'Learning on the live subject what could have been learned on a rehearsal.',
    recommended: 'Dry-run the guarded action, then execute once.',
    check_type: 'shared_risk',
    severity: 'critical',
  }),
  define({
    id: 'JG-018',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Sīla',
    assertion: 'Act from your nature',
    trigger: 'An action is proposed that contradicts an explicit standing instruction from the subject.',
    prohibited: 'Doing to the subject what the subject has forbidden.',
    recommended: 'Follow the standing instruction or ask.',
    check_type: 'consistent_principle',
    severity: 'critical',
  }),
  define({
    id: 'JG-019',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Adhiṭṭhāna',
    assertion: 'Invest in what follows',
    trigger: 'Effort or spend is concentrated on a step with no downstream consumer.',
    prohibited: 'Investing in a dead end.',
    recommended: 'Reallocate effort to the steps that feed a downstream action.',
    check_type: 'proportional_investment',
    severity: 'moderate',
  }),
  define({
    id: 'JG-020',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Sīla',
    assertion: 'Rivers do not merge',
    trigger: 'A step would mix data across two principals that must remain separated.',
    prohibited: 'Cross-contaminating one subject’s evidence into another’s.',
    recommended: 'Keep the streams separate and report the boundary.',
    check_type: 'non_interference',
    severity: 'critical',
  }),
  define({
    id: 'JG-021',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Vīriya',
    assertion: 'Walk your own pace',
    trigger: 'Action pacing is copied from another principal rather than from the subject’s signature.',
    prohibited: 'Imitating another subject’s rhythm.',
    recommended: 'Derive cadence from this subject’s own measured parameters.',
    check_type: 'pattern_coherence',
    severity: 'high',
  }),
  define({
    id: 'JG-022',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Sacca',
    assertion: 'Borrowed sandals blister',
    trigger: 'Behaviour parameters are copied from a source other than the subject.',
    prohibited: 'Borrowing a pattern and presenting it as measured.',
    recommended: 'Use measured parameters only; derive or stand down.',
    check_type: 'measured_pattern_only',
    severity: 'critical',
  }),
  define({
    id: 'JG-023',
    story_name: 'Jātaka tradition',
    story_number: null,
    parami: 'Paññā',
    assertion: 'Recalibrate on change',
    trigger: 'The target site has changed since the signature or recipe was derived.',
    prohibited: 'Replaying into a changed world on a stale calibration.',
    recommended: 'Recalibrate against the new site before replaying.',
    check_type: 'site_change_recalibration',
    severity: 'high',
  }),
])

/**
 * Appendix D.1 — the ten pāramīs as guardrail categories.
 *
 * The `guardrails` list is derived from the registry rather than hand-written.
 * A hand-maintained second copy drifts from the first, and a guardrail filed
 * under the wrong pāramī is a guardrail nobody reads. The category text is the
 * only part kept by hand, because it is prose, not data.
 */
const PARAMI_CATEGORY: ReadonlyArray<{ parami: Parami; category: string }> = [
  { parami: 'Dāna', category: 'Data sharing & consent' },
  { parami: 'Sīla', category: 'Prohibited actions & scope' },
  { parami: 'Nekkhamma', category: 'Resource limits' },
  { parami: 'Paññā', category: 'Evidence & knowledge' },
  { parami: 'Vīriya', category: 'Persistence' },
  { parami: 'Khanti', category: 'Tolerance' },
  { parami: 'Sacca', category: 'Truthfulness' },
  { parami: 'Adhiṭṭhāna', category: 'Resolve' },
  { parami: 'Mettā', category: 'Subject welfare' },
  { parami: 'Upekkhā', category: 'Equanimity' },
]

export const PARAMIS: ReadonlyArray<{
  parami: Parami
  category: string
  guardrails: readonly string[]
}> = Object.freeze(
  PARAMI_CATEGORY.map(({ parami, category }) => ({
    parami,
    category,
    guardrails: Object.freeze(guardrailsForParami(parami).map((g) => g.id)),
  })),
)

const BY_ID = new Map(JATAKA_REGISTRY.map((g) => [g.id, g]))

export function getGuardrail(id: string): NarrativeGuardrail | undefined {
  return BY_ID.get(id)
}

export function guardrailsForParami(parami: Parami): NarrativeGuardrail[] {
  return JATAKA_REGISTRY.filter((g) => g.parami === parami)
}

export function guardrailsBySeverity(): NarrativeGuardrail[] {
  return [...JATAKA_REGISTRY].sort((a, b) => a.id.localeCompare(b.id))
}
