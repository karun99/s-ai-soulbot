/**
 * Runtime schemas for the S-AI SoulBot data model.
 *
 * Every artifact named in Appendix B of the SRS is defined here as a Zod schema
 * so that conformance tiers T0 (syntax) and T4 (artifact validation) have a
 * single source of truth. The schemas are the executable form of the document;
 * `docs/SRS.md` is the prose form.
 */

import { z } from 'zod'

/** ISO-8601 instant. Kept as a refined string so malformed stamps are rejected at the boundary. */
export const Iso8601 = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'must be an ISO-8601 timestamp' })

export const Semver = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'must be semver')

/** Unit interval. Used for every confidence and validation score in the model. */
export const Unit = z.number().min(0).max(1)

export const ConnectorStatus = z.enum(['active', 'disabled', 'revoked'])

/** A field path such as `identity.headline` that grounds a claim in source data. */
export const FieldPath = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_\-*]+)*$/, 'must be a dotted field path')

export type FieldPath = z.infer<typeof FieldPath>

/* -------------------------------------------------------------------------- */
/* B.1 Consent Object                                                          */
/* -------------------------------------------------------------------------- */

export const ScopeName = z
  .string()
  .regex(/^[a-z_]+:[a-z_]+$/, 'must be of the form resource:action')

export const ScopeGrant = z.discriminatedUnion('granted', [
  z.object({ granted: z.literal(true), purpose: z.array(z.string().min(1)).min(1) }),
  z.object({ granted: z.literal(false), reason: z.string().min(1) }),
])

export const ConnectorConsent = z.object({
  connector: z.string().min(1),
  status: ConnectorStatus,
  scopes: z.record(ScopeName, ScopeGrant),
})

export const ConsentObject = z.object({
  consent_id: z.string().min(1),
  subject_id: z.string().min(1),
  granted_by: z.literal('subject'),
  granted_at: Iso8601,
  expires_at: Iso8601.nullable(),
  revocable: z.literal(true),
  connectors: z.array(ConnectorConsent).min(1),
  audit_log: z.string().min(1),
  revocation_webhook: z.string().url(),
})

export type ConsentObject = z.infer<typeof ConsentObject>
export type ConnectorConsent = z.infer<typeof ConnectorConsent>
export type ScopeName = z.infer<typeof ScopeName>
export type ScopeGrant = z.infer<typeof ScopeGrant>

/* -------------------------------------------------------------------------- */
/* B.2 Persona Model                                                            */
/* -------------------------------------------------------------------------- */

export const PersonaLifecycle = z.enum([
  'provisional',
  'warming',
  'ignited',
  'stable',
  'expired',
])

export const IdentityAnchor = z.object({
  name: z.string().min(1),
  weight: Unit,
  evidence: z.array(FieldPath).min(1),
})

export const KnowledgeDomain = z.object({
  name: z.string().min(1),
  confidence: Unit,
  evidence: z.array(FieldPath).min(1),
})

export const Trajectory = z.enum(['ascending', 'lateral', 'pivoting', 'stable'])

export const ValidationIndices = z.object({
  information_handling: Unit,
  neural_synthesis: Unit,
  data_integration: Unit,
  human_voice_index: Unit,
})

export const PersonaModel = z.object({
  persona_id: z.string().min(1),
  version: Semver,
  lifecycle: PersonaLifecycle,
  source_snapshot: z.string().min(1),
  identity: z.object({
    name: z.string().min(1),
    headline: z.string().default(''),
    anchors: z.array(IdentityAnchor),
  }),
  knowledge_domains: z.array(KnowledgeDomain),
  communication_style: z.object({
    formality: Unit,
    directness: Unit,
    verbosity: Unit,
  }),
  temporal_context: z.object({
    valid_from: Iso8601,
    valid_until: Iso8601.nullable(),
    trajectory: Trajectory,
  }),
  validation: ValidationIndices,
})

export type PersonaModel = z.infer<typeof PersonaModel>
export type PersonaLifecycle = z.infer<typeof PersonaLifecycle>
export type Trajectory = z.infer<typeof Trajectory>
export type ValidationIndices = z.infer<typeof ValidationIndices>

/* -------------------------------------------------------------------------- */
/* B.3 BehavioralSignature                                                     */
/* -------------------------------------------------------------------------- */

export const SIGNATURE_PARAMETERS = [
  'decision_framing',
  'information_appetite',
  'risk_posture',
  'communication_register',
  'task_tempo',
  'escalation_criteria',
] as const

export type SignatureParameterName = (typeof SIGNATURE_PARAMETERS)[number]

const DecisionFraming = z.enum(['deliberate', 'decisive'])
const InformationAppetite = z.enum(['high', 'low'])
const RiskPosture = z.enum(['cautious', 'bold'])
const CommunicationRegister = z.enum(['formal', 'conversational', 'technical', 'creative'])
const TaskTempo = z.enum(['steady', 'bursty'])
const EscalationCriteria = z.enum(['high_threshold', 'low_threshold'])

/** Allowed values per parameter. Drives both validation and PatternGenerator mapping. */
export const SIGNATURE_DOMAIN: Record<SignatureParameterName, readonly [string, ...string[]]> = {
  decision_framing: DecisionFraming.options,
  information_appetite: InformationAppetite.options,
  risk_posture: RiskPosture.options,
  communication_register: CommunicationRegister.options,
  task_tempo: TaskTempo.options,
  escalation_criteria: EscalationCriteria.options,
}

/**
 * A parameter validated against its own domain, so an out-of-domain value is
 * rejected at parse time rather than discovered when a signature is used to pace
 * a browser. The signature literal is the artifact the PatternGenerator trusts;
 * it does not get to carry a value the domain does not define.
 */
const ParameterOf = (domain: readonly [string, ...string[]]) =>
  z.object({ value: z.enum(domain as unknown as [string, ...string[]]), confidence: Unit })

export const BehavioralSignature = z.object({
  signature_id: z.string().min(1),
  subject_id: z.string().min(1),
  derived_at: Iso8601,
  source: z.enum(['neural_mapping', 'manual', 'probe_derived']),
  /** Number of the six parameters carrying a usable value (0–6). */
  completeness: z.number().int().min(0).max(6),
  parameters: z.object({
    decision_framing: ParameterOf(SIGNATURE_DOMAIN.decision_framing),
    information_appetite: ParameterOf(SIGNATURE_DOMAIN.information_appetite),
    risk_posture: ParameterOf(SIGNATURE_DOMAIN.risk_posture),
    communication_register: ParameterOf(SIGNATURE_DOMAIN.communication_register),
    task_tempo: ParameterOf(SIGNATURE_DOMAIN.task_tempo),
    escalation_criteria: ParameterOf(SIGNATURE_DOMAIN.escalation_criteria),
  }),
  provisional_mode: z.boolean(),
})

export type BehavioralSignature = z.infer<typeof BehavioralSignature>
export type SignatureParameter = BehavioralSignature['parameters'][SignatureParameterName]

/* -------------------------------------------------------------------------- */
/* B.4 ActionTrace                                                             */
/* -------------------------------------------------------------------------- */

export const TraceOperation = z.enum([
  'navigate',
  'click',
  'fill',
  'select',
  'scroll',
  'wait',
  'done',
  'escalate',
  'blocked',
])

export const SentinelDecision = z.enum(['allow', 'deny', 'ask_user'])

export const PatternParameters = z.object({
  mouse_path_type: z.enum(['bezier', 'linear', 'direct']),
  keystroke_delay_mean_ms: z.number().int().min(0).max(5000),
  hover_duration_ms: z.number().int().min(0).max(10000),
})

export const ActionTrace = z.object({
  trace_id: z.string().min(1),
  flow_id: z.string().min(1),
  step: z.number().int().min(0),
  timestamp: Iso8601,
  actor: z.string().min(1),
  performed_for: z.string().min(1),
  operation: TraceOperation,
  target_ref: z.string().min(1),
  /** Redacted before persistence. See `redactTrace` in `core/trace`. */
  target_description: z.string(),
  decision_probability: Unit,
  sentinel_decision: SentinelDecision,
  consent_id: z.string().min(1),
  scopes_used: z.array(ScopeName),
  pattern_parameters: PatternParameters,
  latency_ms: z.number().int().min(0),
  success: z.boolean(),
  cache_hit: z.boolean(),
  healed: z.boolean(),
  cost_usd: z.number().min(0),
})

export type ActionTrace = z.infer<typeof ActionTrace>
export type TraceOperation = z.infer<typeof TraceOperation>
export type SentinelDecision = z.infer<typeof SentinelDecision>
export type PatternParameters = z.infer<typeof PatternParameters>

/* -------------------------------------------------------------------------- */
/* B.5 Recipe                                                                  */
/* -------------------------------------------------------------------------- */

export const Locator = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('role_name'), role: z.string().min(1), name: z.string().min(1) }),
  z.object({ strategy: z.literal('css'), value: z.string().min(1) }),
  z.object({ strategy: z.literal('text'), value: z.string().min(1) }),
  z.object({ strategy: z.literal('xpath'), value: z.string().min(1) }),
  z.object({ strategy: z.literal('test_id'), value: z.string().min(1) }),
])

export type Locator = z.infer<typeof Locator>

export const RecipeStep = z.object({
  step: z.number().int().min(1),
  operation: TraceOperation,
  url: z.string().url().optional(),
  locators: z.array(Locator).default([]),
  /** Text a subject would type, kept separate from credentials by design. */
  value: z.string().optional(),
})

export const ReplayStats = z.object({
  runs: z.number().int().min(0),
  successes: z.number().int().min(0),
  last_run: Iso8601.nullable(),
  heal_events: z.number().int().min(0),
})

export const Recipe = z.object({
  recipe_id: z.string().min(1),
  task_class: z.string().min(1),
  subject_id: z.string().min(1),
  created: Iso8601,
  steps: z.array(RecipeStep).min(1),
  verification: z.object({
    success_condition: z.string().min(1),
    timeout_seconds: z.number().int().min(1).max(3600),
  }),
  replay_stats: ReplayStats,
})

export type Recipe = z.infer<typeof Recipe>
export type RecipeStep = z.infer<typeof RecipeStep>
export type ReplayStats = z.infer<typeof ReplayStats>

/* -------------------------------------------------------------------------- */
/* B.6 Flow Definition                                                         */
/* -------------------------------------------------------------------------- */

export const FlowServer = z.enum([
  'ahph-engine',
  'ahph-consent',
  'ahph-x',
  'ahph-sentinel',
  'ahph-browser',
])

export const ExpectedTraceStep = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
})

export const FlowDefinition = z.object({
  flow_id: z.string().min(1),
  description: z.string().min(1),
  servers: z.array(FlowServer).min(1),
  expected_trace: z.array(ExpectedTraceStep).min(1),
  success_condition: z.string().min(1),
  max_tokens: z.number().int().positive(),
  max_cost_usd: z.number().positive(),
})

export type FlowDefinition = z.infer<typeof FlowDefinition>
export type ExpectedTraceStep = z.infer<typeof ExpectedTraceStep>

/* -------------------------------------------------------------------------- */
/* B.7 NarrativeGuardrail                                                      */
/* -------------------------------------------------------------------------- */

export const Parami = z.enum([
  'Dāna',
  'Sīla',
  'Nekkhamma',
  'Paññā',
  'Vīriya',
  'Khanti',
  'Sacca',
  'Adhiṭṭhāna',
  'Mettā',
  'Upekkhā',
])

export type Parami = z.infer<typeof Parami>

export const CheckType = z.enum([
  'anchor_integrity',
  'reconstitution',
  'task_completion',
  'domain_evidence',
  'equanimity',
  'data_minimization',
  'measurement_bias_audit',
  'temporal_coherence',
  'proportional_response',
  'partial_vision',
  'consent_continuity',
  'non_attachment',
  'dissolution',
  'instrument_trust',
  'iterative_refinement',
  'shared_risk',
  'consistent_principle',
  'proportional_investment',
  'non_interference',
  'pattern_coherence',
  'measured_pattern_only',
  'site_change_recalibration',
])

export type CheckType = z.infer<typeof CheckType>

export const Severity = z.enum(['critical', 'high', 'moderate', 'low'])

export type Severity = z.infer<typeof Severity>

/** Severity ordering used for ranking. Higher number = more severe. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
}

export const NarrativeGuardrail = z.object({
  id: z.string().regex(/^JG-\d{3}$/),
  story_name: z.string().min(1),
  story_number: z.number().int().min(1).nullable(),
  parami: Parami,
  assertion: z.string().min(1),
  trigger: z.string().min(1),
  prohibited: z.string().min(1),
  recommended: z.string().min(1),
  check_type: CheckType,
  severity: Severity,
  story_ref: z.string().min(1),
})

export type NarrativeGuardrail = z.infer<typeof NarrativeGuardrail>
