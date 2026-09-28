/**
 * The Sentinel panel — the sole authorization authority, exposed for inspection.
 *
 * The console does not decide anything. It builds a request, posts it, and
 * renders whatever the Sentinel returns, including a refusal. That is the point:
 * a reviewer should be able to watch the authority refuse them.
 */

import { useState } from 'react'
import { ACTION_CLASSES, GUARDED_ACTIONS, type ActionClass } from '@core/index.js'
import { Badge, Callout, Code, Empty, ErrorNote, Panel, Stat } from '../components/primitives.js'
import { api, type AuthorizeResponse } from '../lib/api.js'

const DEFAULT_REQUEST = {
  actionClass: 'click' as ActionClass,
  targetDescription: 'Checkout button on the merchant page',
  requestedScopes: ['posts:read'],
  grantedScopes: ['posts:read'],
  consentLive: true,
  continuityPreserved: true,
  subjectAvailable: true,
  irreversible: false,
  affectsOthers: false,
  financiallyLoaded: false,
  displacesSubject: false,
  decisionDelegated: false,
  relianceCount: 0,
  connectionPointer: '',
  includeBridge: true,
  includeFacts: true,
}

export function SentinelPanel() {
  const [form, setForm] = useState(DEFAULT_REQUEST)
  const [decision, setDecision] = useState<AuthorizeResponse | null>(null)
  const [failure, setFailure] = useState<{ error: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function submit() {
    setBusy(true)
    setFailure(null)
    const guarded = GUARDED_ACTIONS.has(form.actionClass)

    const res = await api.authorize({
      requestId: `req_${Date.now().toString(36)}`,
      principalId: 'subj_001',
      actionClass: form.actionClass,
      targetDescription: form.targetDescription,
      requestedScopes: form.requestedScopes,
      consent: {
        consentId: 'consent_demo',
        live: form.consentLive,
        continuityPreserved: form.continuityPreserved,
        grantedScopes: form.grantedScopes,
      },
      subjectAvailable: form.subjectAvailable,
      ...(form.includeBridge
        ? {
            bridge: {
              actionClass: form.actionClass,
              stepDescription: form.targetDescription,
              irreversible: guarded || form.irreversible,
              affectsOthers: form.affectsOthers,
              financialExposureUsd: form.financiallyLoaded ? 240 : 0,
              emotionallyLoaded: false,
              sensitiveDomain: form.financiallyLoaded ? 'financial' : 'none',
              connectionPointers: form.connectionPointer ? [form.connectionPointer] : [],
              relianceCount: form.relianceCount,
              displacesSubject: form.displacesSubject,
              decisionDelegated: form.decisionDelegated,
            },
          }
        : {}),
      ...(form.includeFacts
        ? {
            guardrailFacts: {
              claim: { asserted: true, cited: 0, verified: 0 },
              pattern: { borrowed: false, measured: true, derivedFromOwnSignature: true },
              consent: {
                live: form.consentLive,
                continuityPreserved: form.continuityPreserved,
                destinationDeclared: true,
                requestedScope: form.requestedScopes,
                grantedScope: form.grantedScopes,
              },
            },
          }
        : {}),
    })

    setBusy(false)
    if (res.ok) {
      setDecision(res.data.decision)
      setFailure(null)
    } else {
      setDecision(null)
      setFailure({ error: res.error, code: res.code })
    }
  }

  const tone =
    decision?.decision === 'allow' ? 'allow' : decision?.decision === 'ask_user' ? 'escalate' : 'deny'

  return (
    <>
      <Panel
        id="sentinel-request"
        title="Authorize an action"
        hint="Compose a request and submit it to the Sentinel. The console holds no authority of its own; the decision below is the Sentinel's, unmodified."
      >
        <div className="grid-2">
          <div className="field">
            <label htmlFor="s-class">Action class</label>
            <select
              id="s-class"
              value={form.actionClass}
              onChange={(e) => set('actionClass', e.target.value as ActionClass)}
            >
              {ACTION_CLASSES.map((a) => (
                <option key={a} value={a}>
                  {a}
                  {GUARDED_ACTIONS.has(a) ? ' (guarded)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-target">Target description</label>
            <input
              id="s-target"
              type="text"
              value={form.targetDescription}
              onChange={(e) => set('targetDescription', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="s-req">Requested scopes (comma separated)</label>
            <input
              id="s-req"
              type="text"
              value={form.requestedScopes.join(', ')}
              onChange={(e) =>
                set(
                  'requestedScopes',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                )
              }
            />
          </div>
          <div className="field">
            <label htmlFor="s-granted">Granted scopes (comma separated)</label>
            <input
              id="s-granted"
              type="text"
              value={form.grantedScopes.join(', ')}
              onChange={(e) =>
                set(
                  'grantedScopes',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                )
              }
            />
          </div>
        </div>

        <div className="grid-2">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.consentLive}
              onChange={(e) => set('consentLive', e.target.checked)}
            />
            <span>Consent is live</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.continuityPreserved}
              onChange={(e) => set('continuityPreserved', e.target.checked)}
            />
            <span>Consent continuity preserved</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.subjectAvailable}
              onChange={(e) => set('subjectAvailable', e.target.checked)}
            />
            <span>Subject is available to answer</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.includeBridge}
              onChange={(e) => set('includeBridge', e.target.checked)}
            />
            <span>Evaluate the Bridge Rule</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.includeFacts}
              onChange={(e) => set('includeFacts', e.target.checked)}
            />
            <span>Evaluate the Jātaka guardrails</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.affectsOthers}
              onChange={(e) => set('affectsOthers', e.target.checked)}
            />
            <span>Someone else is on the receiving end</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.displacesSubject}
              onChange={(e) => set('displacesSubject', e.target.checked)}
            />
            <span>This would leave the subject less able to do it themselves</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.decisionDelegated}
              onChange={(e) => set('decisionDelegated', e.target.checked)}
            />
            <span>The subject asked the harness to decide</span>
          </label>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="s-pointer">Human connection pointer</label>
            <input
              id="s-pointer"
              type="text"
              placeholder="e.g. Priya, my sister"
              value={form.connectionPointer}
              onChange={(e) => set('connectionPointer', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="s-reliance">Reliance count</label>
            <input
              id="s-reliance"
              type="number"
              min={0}
              max={20}
              value={form.relianceCount}
              onChange={(e) => set('relianceCount', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="row">
          <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>
            {busy ? 'Asking…' : 'Ask the Sentinel'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setForm(DEFAULT_REQUEST)
              setDecision(null)
              setFailure(null)
            }}
          >
            Reset
          </button>
        </div>
      </Panel>

      <Panel id="sentinel-decision" title="Decision" hint="Rendered exactly as returned.">
        {failure ? <ErrorNote error={failure.error} code={failure.code} /> : null}
        {!decision && !failure ? <Empty>No decision yet. Submit a request above.</Empty> : null}
        {decision ? (
          <>
            <div className="grid-3">
              <Stat label="Decision" value={<Badge tone={tone}>{decision.decision}</Badge>} />
              <Stat label="Decided by" value={<span className="mono">{decision.decidedBy}</span>} />
              <Stat
                label="Permitted"
                value={decision.permitted ? 'yes' : 'no'}
                note={decision.permitted ? 'Execution may proceed.' : 'Execution is withheld.'}
              />
            </div>

            {decision.question ? <Callout tone="accent" title="Question for the subject">{decision.question}</Callout> : null}

            <div>
              <p className="eyebrow">Reasons</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                {decision.reasons.map((r, i) => (
                  <li key={i} className="mono" style={{ fontSize: '0.8125rem' }}>
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            {decision.bridge ? (
              <div>
                <p className="eyebrow">Bridge Rule</p>
                <p className="callout__body" style={{ marginTop: 6 }}>
                  {decision.bridge.message}
                </p>
                {decision.bridge.pointerRequired ? (
                  <p className="callout__body">
                    <strong>Pointer:</strong> {decision.bridge.pointerRequired}
                  </p>
                ) : null}
              </div>
            ) : null}

            <details>
              <summary className="callout__title" style={{ cursor: 'pointer' }}>
                Raw decision
              </summary>
              <div style={{ marginTop: 8 }}>
                <Code>{JSON.stringify(decision, null, 2)}</Code>
              </div>
            </details>
          </>
        ) : null}
      </Panel>
    </>
  )
}
