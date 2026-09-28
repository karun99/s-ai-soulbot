# Appendix B — Data Schemas

**S-AI SoulBot v3.0.0**

Every artifact below is defined as a Zod schema in [`src/core/schema/index.ts`](../src/core/schema/index.ts).
The schemas are the executable form of this appendix; conformance tiers T0 (syntax)
and T4 (artifact validation) treat them as the single source of truth.

Primitives: `Iso8601` (refined ISO-8601 string), `Semver` (`\d+\.\d+\.\d+`…), `Unit`
(0–1 closed interval), `ScopeName` (`resource:action`), `FieldPath` (dotted path).

## B.1 Consent Object

```json
{
  "consent_id": "string",
  "subject_id": "string",
  "granted_by": "subject",
  "granted_at": "ISO8601",
  "expires_at": "ISO8601 | null",
  "revocable": true,
  "connectors": [
    {
      "connector": "linkedin_oauth",
      "status": "active | disabled | revoked",
      "scopes": {
        "profile:read": { "granted": true, "purpose": ["persona_synthesis"] },
        "posts:read": { "granted": true, "purpose": ["style_inference"] },
        "connections:read": { "granted": false, "reason": "user_declined" }
      }
    }
  ],
  "audit_log": "consent_audit.log",
  "revocation_webhook": "https://subject.example/ahph/revoke"
}
```

A grant is a discriminated union: `{ granted: true, purpose: [...] }` or
`{ granted: false, reason }` — there is no half-state. `revocable` is `true` by
contract: the subject may always revoke (FR-003).

## B.2 Persona Model

```json
{
  "persona_id": "string",
  "version": "semver",
  "lifecycle": "provisional | warming | ignited | stable | expired",
  "source_snapshot": "snapshot_id",
  "identity": {
    "name": "string",
    "headline": "string",
    "anchors": [
      { "name": "string", "weight": 0.0-1.0, "evidence": ["field_paths"] }
    ]
  },
  "knowledge_domains": [
    { "name": "string", "confidence": 0.0-1.0, "evidence": ["field_paths"] }
  ],
  "communication_style": {
    "formality": 0.0-1.0,
    "directness": 0.0-1.0,
    "verbosity": 0.0-1.0
  },
  "temporal_context": {
    "valid_from": "ISO8601",
    "valid_until": "ISO8601 | null",
    "trajectory": "ascending | lateral | pivoting | stable"
  },
  "validation": {
    "information_handling": 0.0-1.0,
    "neural_synthesis": 0.0-1.0,
    "data_integration": 0.0-1.0,
    "human_voice_index": 0.0-1.0
  }
}
```

Synthesis (`core/persona`): an anchor or domain with no evidence field path is
dropped and the subject is told why; a style index is clamped into 0–1; a persona
with no surviving evidenced anchor cannot act. Lifecycle requires corroboration,
maturity and guarded-action history to reach `stable`, and expires on its validity
window regardless of evidence. The identity gate reports `same_entity`,
`reconstituted`, `different_entity`, or `unresolved` and holds every verdict
(including self-sabotage directives) while unresolved.

## B.3 BehavioralSignature

```json
{
  "signature_id": "string",
  "subject_id": "string",
  "derived_at": "ISO8601",
  "source": "neural_mapping | manual | probe_derived",
  "completeness": 0-6,
  "parameters": {
    "decision_framing":       { "value": "deliberate|decisive",       "confidence": 0.0-1.0 },
    "information_appetite":   { "value": "high|low",                   "confidence": 0.0-1.0 },
    "risk_posture":           { "value": "cautious|bold",              "confidence": 0.0-1.0 },
    "communication_register": { "value": "formal|conversational|technical|creative", "confidence": 0.0-1.0 },
    "task_tempo":             { "value": "steady|bursty",              "confidence": 0.0-1.0 },
    "escalation_criteria":    { "value": "high_threshold|low_threshold","confidence": 0.0-1.0 }
  },
  "provisional_mode": false
}
```

Each parameter is validated against its own domain at parse time — an out-of-domain
value is rejected, so a signature can never carry a value the domain does not define.
A parameter is *usable* only with confidence ≥ 0.5; unusable parameters are emitted
with confidence `0` (never a guess). `provisional_mode` is `completeness < 4` and is
itself coherence-checked: a provisional marker at full completeness is incoherent.

## B.4 ActionTrace

```json
{
  "trace_id": "string",
  "flow_id": "string",
  "step": 0,
  "timestamp": "ISO8601",
  "actor": "ahph-browser",
  "performed_for": "subject_id",
  "operation": "navigate | click | fill | select | scroll | wait | done | escalate | blocked",
  "target_ref": "@N",
  "target_description": "string",
  "decision_probability": 0.0-1.0,
  "sentinel_decision": "allow | deny | ask_user",
  "consent_id": "string",
  "scopes_used": ["string"],
  "pattern_parameters": {
    "mouse_path_type": "bezier | linear | direct",
    "keystroke_delay_mean_ms": 120,
    "hover_duration_ms": 350
  },
  "latency_ms": 0,
  "success": true,
  "cache_hit": false,
  "healed": false,
  "cost_usd": 0.0
}
```

Persistence (`core/trace`) redacts secrets and secret-shaped values before writing
(FR-030) and chains each record to its predecessor; the first record hashes against
the genesis hash `0`×64.

## B.5 Recipe

```json
{
  "recipe_id": "string",
  "task_class": "string",
  "subject_id": "string",
  "created": "ISO8601",
  "steps": [
    { "step": 1, "operation": "navigate", "url": "string", "locators": [] },
    {
      "step": 2,
      "operation": "click",
      "value": "text a subject would type (never a credential)",
      "locators": [
        { "strategy": "role_name", "role": "button", "name": "Checkout" },
        { "strategy": "css", "value": "#checkout-btn" },
        { "strategy": "text", "value": "Checkout" }
      ]
    }
  ],
  "verification": {
    "success_condition": "url_contains:/order-confirmation",
    "timeout_seconds": 30
  },
  "replay_stats": {
    "runs": 0,
    "successes": 0,
    "last_run": null,
    "heal_events": 0
  }
}
```

Locator strategies: `role_name`, `css`, `text`, `xpath`, `test_id`. A step with a
single locator fails T4 (cannot be healed); `value` is kept separate from credentials
by design. Replay trust floor is 0.67 (FR-037).

## B.6 Flow Definition

```json
{
  "flow_id": "string",
  "description": "string",
  "servers": ["ahph-engine", "ahph-consent", "ahph-x", "ahph-sentinel", "ahph-browser"],
  "expected_trace": [
    { "tool": "ahph-engine.render_persona_prompt", "args": { "persona_id": "*" } },
    { "tool": "ahph-task.plan_task", "args": { "task": "*" } },
    { "tool": "ahph-sentinel.authorize", "args": { "action_class": "submit_form" } },
    { "tool": "ahph-browser.execute", "args": { "operation": "fill" } },
    { "tool": "ahph-browser.execute", "args": { "operation": "click" } }
  ],
  "success_condition": "url_contains:/home",
  "max_tokens": 500000,
  "max_cost_usd": 0.50
}
```

Success-condition grammar: `url_contains:`, `text_contains:`, `element_present:`,
`condition:` — anything else fails. `servers` is an enum of the five AHPH servers.
T5 requires a Sentinel step covering every guarded action in the expected trace.

## B.7 NarrativeGuardrail

```json
{
  "id": "JG-001",
  "story_name": "Sīhacamma Jātaka",
  "story_number": 189,
  "parami": "Sacca",
  "assertion": "Silence is golden",
  "trigger": "A claim is asserted with no cited source data behind it.",
  "prohibited": "Asserting without source data.",
  "recommended": "Remain silent; wait for evidence.",
  "check_type": "anchor_integrity",
  "severity": "critical",
  "story_ref": "Sīhacamma Jātaka, 189"
}
```

`parami` is one of the ten pāramīs; `check_type` is one of the 22 machine-evaluable
predicates; `severity` is `critical | high | moderate | low` with rank 4/3/2/1.
`story_ref` is derived from `story_name` + `story_number` when present.