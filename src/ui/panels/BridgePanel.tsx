/**
 * The Bridge Rule panel.
 *
 * Shown on its own because it is the ethical centre. The interaction to try is
 * the obvious one: tick "asks the harness to decide", clear the pointer, and
 * watch the Rule refuse — then name a person and watch it pass.
 */

import { useState } from 'react'
import { BRIDGE_QUESTION, DELEGATION_MODEL, type ActionClass } from '@core/index.js'
import { Badge, Callout, Code, Empty, ErrorNote, Panel, Stat } from '../components/primitives.js'
import { api, type BridgeVerdictResponse } from '../lib/api.js'

const TONE = {
  clear: 'allow',
  pointer_present: 'allow',
  pointer_required: 'escalate',
  dependence_risk: 'deny',
} as const

export function BridgePanel() {
  const [context, setContext] = useState({
    actionClass: 'click' as ActionClass,
    stepDescription: 'Choose the venue for the anniversary dinner',
    irreversible: false,
    affectsOthers: true,
    financialExposureUsd: 180,
    emotionallyLoaded: true,
    sensitiveDomain: 'relationship' as 'none' | 'health' | 'legal' | 'financial' | 'safety' | 'relationship',
    connectionPointers: '',
    relianceCount: 0,
    displacesSubject: false,
    decisionDelegated: false,
  })
  const [verdict, setVerdict] = useState<BridgeVerdictResponse | null>(null)
  const [failure, setFailure] = useState<{ error: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof typeof context>(key: K, value: (typeof context)[K]) =>
    setContext((c) => ({ ...c, [key]: value }))

  async function evaluate() {
    setBusy(true)
    const res = await api.bridgeRule({
      ...context,
      connectionPointers: context.connectionPointers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    })
    setBusy(false)
    if (res.ok) {
      setVerdict(res.data.verdict)
      setFailure(null)
    } else {
      setVerdict(null)
      setFailure({ error: res.error, code: res.code })
    }
  }

  return (
    <>
      <Panel
        id="bridge-rule"
        title="The Bridge Rule"
        hint={`The question, always: “${BRIDGE_QUESTION}”`}
        tools={<Badge tone="accent">{DELEGATION_MODEL.statement}</Badge>}
      >
        <Callout tone="accent" title="Why this is enforced and not merely suggested">
          Every other guardrail in this system protects the system. This one protects the person using it. A step that
          would make the subject more dependent on the harness, without routing them to a human they already know, does
          not execute — and the refusal names the human rather than merely withholding.
        </Callout>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="b-step">Step description</label>
            <input
              id="b-step"
              type="text"
              value={context.stepDescription}
              onChange={(e) => set('stepDescription', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="b-domain">Sensitive domain</label>
            <select
              id="b-domain"
              value={context.sensitiveDomain}
              onChange={(e) => set('sensitiveDomain', e.target.value as typeof context.sensitiveDomain)}
            >
              <option value="none">none</option>
              <option value="health">health</option>
              <option value="legal">legal</option>
              <option value="financial">financial</option>
              <option value="safety">safety</option>
              <option value="relationship">relationship</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-pointer">Who could you tell? (comma separated)</label>
            <input
              id="b-pointer"
              type="text"
              placeholder="e.g. Priya, my sister"
              value={context.connectionPointers}
              onChange={(e) => set('connectionPointers', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="b-reliance">Reliance count</label>
            <input
              id="b-reliance"
              type="number"
              min={0}
              max={20}
              value={context.relianceCount}
              onChange={(e) => set('relianceCount', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid-2">
          <label className="checkbox">
            <input type="checkbox" checked={context.irreversible} onChange={(e) => set('irreversible', e.target.checked)} />
            <span>Cannot be undone</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={context.affectsOthers} onChange={(e) => set('affectsOthers', e.target.checked)} />
            <span>Someone else is affected</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={context.emotionallyLoaded}
              onChange={(e) => set('emotionallyLoaded', e.target.checked)}
            />
            <span>Emotionally loaded</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={context.displacesSubject}
              onChange={(e) => set('displacesSubject', e.target.checked)}
            />
            <span>Leaves the subject less able to do it themselves</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={context.decisionDelegated}
              onChange={(e) => set('decisionDelegated', e.target.checked)}
            />
            <span>The subject asked the harness to decide for them</span>
          </label>
        </div>

        <div className="row">
          <button type="button" className="btn btn--primary" onClick={evaluate} disabled={busy}>
            {busy ? 'Evaluating…' : 'Evaluate the Rule'}
          </button>
        </div>
      </Panel>

      <Panel id="bridge-verdict" title="Verdict">
        {failure ? <ErrorNote error={failure.error} code={failure.code} /> : null}
        {!verdict && !failure ? <Empty>No verdict yet.</Empty> : null}
        {verdict ? (
          <>
            <div className="grid-3">
              <Stat label="Verdict" value={<Badge tone={TONE[verdict.verdict]}>{verdict.verdict.replace('_', ' ')}</Badge>} />
              <Stat label="Heavy moment" value={verdict.heavyMoment ? 'yes' : 'no'} />
              <Stat label="Question" value={<span style={{ fontSize: '0.875rem' }}>{verdict.question}</span>} />
            </div>
            <Callout tone={verdict.verdict === 'dependence_risk' ? 'warn' : 'accent'} title="Finding">
              {verdict.message}
            </Callout>
            {verdict.pointerRequired ? (
              <Callout tone="accent" title="What would satisfy the Rule">
                {verdict.pointerRequired}
              </Callout>
            ) : null}
            <div>
              <p className="eyebrow">Basis</p>
              <div className="row" style={{ marginTop: 8 }}>
                {verdict.basis.length === 0 ? (
                  <span className="stat__note">No condition triggered.</span>
                ) : (
                  verdict.basis.map((b) => (
                    <span key={b} className="mono badge badge--neutral">
                      {b}
                    </span>
                  ))
                )}
              </div>
            </div>
            <details>
              <summary className="callout__title" style={{ cursor: 'pointer' }}>
                Raw verdict
              </summary>
              <div style={{ marginTop: 8 }}>
                <Code>{JSON.stringify(verdict, null, 2)}</Code>
              </div>
            </details>
          </>
        ) : null}
      </Panel>
    </>
  )
}
