/** Shared fixtures. Deliberately explicit — no factory magic in security tests. */

import type {
  ActionTrace,
  BehavioralSignature,
  ChainedTrace,
  FlowDefinition,
  PersonaModel,
  Recipe,
  SignatureParameterName,
  ParameterObservation,
} from '@core/index.js'
import { appendStep } from '@core/index.js'

export const NOW = '2026-09-26T12:00:00.000Z'

/* -------------------------------------------------------------------------- */
/* Signature                                                                   */
/* -------------------------------------------------------------------------- */

/** Six measured parameters — complete, not provisional. */
export const COMPLETE_OBSERVATIONS: Record<SignatureParameterName, ParameterObservation> = {
  decision_framing: { value: 'deliberate', confidence: 0.82, evidence: 'probe:task-014' },
  information_appetite: { value: 'high', confidence: 0.74, evidence: 'probe:links-003' },
  risk_posture: { value: 'cautious', confidence: 0.68, evidence: 'probe:commit-021' },
  communication_register: { value: 'technical', confidence: 0.79, evidence: 'probe:writing-007' },
  task_tempo: { value: 'steady', confidence: 0.71, evidence: 'probe:sessions-011' },
  escalation_criteria: { value: 'low_threshold', confidence: 0.66, evidence: 'probe:escalate-002' },
}

/** Three measured parameters — provisional, below the threshold of four. */
export const PROVISIONAL_OBSERVATIONS: Partial<Record<SignatureParameterName, ParameterObservation>> = {
  decision_framing: { value: 'decisive', confidence: 0.8, evidence: 'probe:task-014' },
  information_appetite: { value: 'low', confidence: 0.75, evidence: 'probe:links-003' },
  risk_posture: { value: 'bold', confidence: 0.6, evidence: 'probe:commit-021' },
}

/* -------------------------------------------------------------------------- */
/* Signature literal                                                           */
/* -------------------------------------------------------------------------- */

export const COMPLETE_SIGNATURE: BehavioralSignature = {
  signature_id: 'sig_test',
  subject_id: 'subj_001',
  derived_at: NOW,
  source: 'probe_derived',
  completeness: 6,
  parameters: {
    decision_framing: { value: 'deliberate', confidence: 0.82 },
    information_appetite: { value: 'high', confidence: 0.74 },
    risk_posture: { value: 'cautious', confidence: 0.68 },
    communication_register: { value: 'technical', confidence: 0.79 },
    task_tempo: { value: 'steady', confidence: 0.71 },
    escalation_criteria: { value: 'low_threshold', confidence: 0.66 },
  },
  provisional_mode: false,
}

export const PROVISIONAL_SIGNATURE: BehavioralSignature = {
  ...COMPLETE_SIGNATURE,
  signature_id: 'sig_provisional',
  completeness: 3,
  provisional_mode: true,
  parameters: {
    decision_framing: { value: 'decisive', confidence: 0.8 },
    information_appetite: { value: 'low', confidence: 0.75 },
    risk_posture: { value: 'bold', confidence: 0.6 },
    communication_register: { value: 'formal', confidence: 0 },
    task_tempo: { value: 'steady', confidence: 0 },
    escalation_criteria: { value: 'high_threshold', confidence: 0 },
  },
}

/* -------------------------------------------------------------------------- */
/* Persona                                                                     */
/* -------------------------------------------------------------------------- */

export const PERSONA: PersonaModel = {
  persona_id: 'pers_001',
  version: '3.0.0',
  lifecycle: 'stable',
  source_snapshot: 'snap_8841',
  identity: {
    name: 'Subject One',
    headline: 'Research engineer',
    anchors: [
      { name: 'employer', weight: 0.8, evidence: ['identity.headline'] },
      { name: 'field', weight: 0.7, evidence: ['knowledge_domains.0'] },
    ],
  },
  knowledge_domains: [
    { name: 'distributed systems', confidence: 0.82, evidence: ['posts.text'] },
    { name: 'public policy', confidence: 0.61, evidence: ['posts.text'] },
  ],
  communication_style: { formality: 0.4, directness: 0.75, verbosity: 0.5 },
  temporal_context: { valid_from: NOW, valid_until: null, trajectory: 'stable' },
  validation: {
    information_handling: 0.78,
    neural_synthesis: 0.71,
    data_integration: 0.66,
    human_voice_index: 0.74,
  },
}

/* -------------------------------------------------------------------------- */
/* Trace                                                                       */
/* -------------------------------------------------------------------------- */

export function makeTrace(overrides: Partial<ActionTrace> = {}): ActionTrace {
  return {
    trace_id: 'trc_001',
    flow_id: 'flow_001',
    step: 0,
    timestamp: NOW,
    actor: 'ahph-browser',
    performed_for: 'subj_001',
    operation: 'navigate',
    target_ref: '@1',
    target_description: 'https://example.test/start',
    decision_probability: 0.9,
    sentinel_decision: 'allow',
    consent_id: 'consent_001',
    scopes_used: ['posts:read'],
    pattern_parameters: {
      mouse_path_type: 'bezier',
      keystroke_delay_mean_ms: 120,
      hover_duration_ms: 350,
    },
    latency_ms: 120,
    success: true,
    cache_hit: false,
    healed: false,
    cost_usd: 0.001,
    ...overrides,
  }
}

/**
 * Append traces in order and return only the records that were actually
 * accepted. Returning `record!` blindly would make a rejected append look like
 * a silent success in the test.
 */
export async function chainTraces(traces: readonly ActionTrace[]): Promise<ChainedTrace[]> {
  const records: ChainedTrace[] = []
  for (const trace of traces) {
    const result = await appendStep(records, trace)
    if (result.record) records.push(result.record)
    else throw new Error(`append rejected in fixture: ${result.error ?? 'unknown'}`)
  }
  return records
}

/* -------------------------------------------------------------------------- */
/* Recipe                                                                      */
/* -------------------------------------------------------------------------- */

export const VALID_RECIPE: Recipe = {
  recipe_id: 'book_table',
  task_class: 'reservation',
  subject_id: 'subj_001',
  created: NOW,
  steps: [
    { step: 1, operation: 'navigate', url: 'https://example.test/book', locators: [] },
    {
      step: 2,
      operation: 'fill',
      locators: [
        { strategy: 'role_name', role: 'textbox', name: 'Guest name' },
        { strategy: 'css', value: '#guest-name' },
      ],
      value: 'Subject One',
    },
    {
      step: 3,
      operation: 'click',
      locators: [
        { strategy: 'role_name', role: 'button', name: 'Confirm' },
        { strategy: 'text', value: 'Confirm booking' },
      ],
    },
  ],
  verification: { success_condition: 'url_contains:/confirmation', timeout_seconds: 30 },
  replay_stats: { runs: 10, successes: 9, last_run: NOW, heal_events: 2 },
}

/* -------------------------------------------------------------------------- */
/* Flow                                                                        */
/* -------------------------------------------------------------------------- */

export const VALID_FLOW: FlowDefinition = {
  flow_id: 'flow_001',
  description: 'Render the persona, plan the task, authorize the form, then fill and click.',
  servers: ['ahph-engine', 'ahph-consent', 'ahph-sentinel', 'ahph-browser'],
  expected_trace: [
    { tool: 'ahph-engine.render_persona_prompt', args: { persona_id: '*' } },
    { tool: 'ahph-task.plan_task', args: { task: '*' } },
    { tool: 'ahph-sentinel.authorize', args: { action_class: 'submit_form' } },
    { tool: 'ahph-browser.execute', args: { operation: 'fill' } },
    { tool: 'ahph-browser.execute', args: { operation: 'click', action_class: 'submit_form' } },
  ],
  success_condition: 'url_contains:/home',
  max_tokens: 500_000,
  max_cost_usd: 0.5,
}

/* -------------------------------------------------------------------------- */
/* Bridge                                                                      */
/* -------------------------------------------------------------------------- */

export const LIGHT_BRIDGE = {
  actionClass: 'read' as const,
  stepDescription: 'Read the public changelog',
  irreversible: false,
  affectsOthers: false,
  financialExposureUsd: 0,
  emotionallyLoaded: false,
  sensitiveDomain: 'none' as const,
  connectionPointers: [] as string[],
  relianceCount: 0,
  displacesSubject: false,
  decisionDelegated: false,
}

export const HEAVY_BRIDGE = {
  actionClass: 'transfer_funds' as const,
  stepDescription: 'Send the annual contribution',
  irreversible: true,
  affectsOthers: true,
  financialExposureUsd: 500,
  emotionallyLoaded: true,
  sensitiveDomain: 'financial' as const,
  connectionPointers: [] as string[],
  relianceCount: 4,
  displacesSubject: true,
  decisionDelegated: true,
}
