/**
 * The signature panel.
 *
 * There is deliberately no "autofill" control. A parameter without an
 * observation behind it stays empty, and the completeness readout drops. The
 * point of the panel is to make unmeasured parameters visible rather than
 * comfortable.
 */

import { useState } from 'react'
import { Badge, Callout, Code, Empty, ErrorNote, Panel, Stat } from '../components/primitives.js'
import { api, type SignatureResponse } from '../lib/api.js'

type ParamKey =
  | 'decision_framing'
  | 'information_appetite'
  | 'risk_posture'
  | 'communication_register'
  | 'task_tempo'
  | 'escalation_criteria'

const ORDER: ParamKey[] = [
  'decision_framing',
  'information_appetite',
  'risk_posture',
  'communication_register',
  'task_tempo',
  'escalation_criteria',
]

const DOMAINS: Record<ParamKey, string[]> = {
  decision_framing: ['deliberate', 'decisive'],
  information_appetite: ['high', 'low'],
  risk_posture: ['cautious', 'bold'],
  communication_register: ['formal', 'conversational', 'technical', 'creative'],
  task_tempo: ['steady', 'bursty'],
  escalation_criteria: ['high_threshold', 'low_threshold'],
}

type Row = { value: string; confidence: number; evidence: string }

const EMPTY: Record<ParamKey, Row> = {
  decision_framing: { value: '', confidence: 0.7, evidence: '' },
  information_appetite: { value: '', confidence: 0.7, evidence: '' },
  risk_posture: { value: '', confidence: 0.7, evidence: '' },
  communication_register: { value: '', confidence: 0.7, evidence: '' },
  task_tempo: { value: '', confidence: 0.7, evidence: '' },
  escalation_criteria: { value: '', confidence: 0.7, evidence: '' },
}

export function SignaturePanel() {
  const [subjectId, setSubjectId] = useState('subj_001')
  const [rows, setRows] = useState<Record<ParamKey, Row>>(EMPTY)
  const [result, setResult] = useState<SignatureResponse | null>(null)
  const [failure, setFailure] = useState<{ error: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (key: ParamKey, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } }))

  const filled = ORDER.filter((k) => rows[k].value !== '' && rows[k].evidence.trim() !== '').length

  async function derive() {
    setBusy(true)
    const observations: Record<string, Row> = {}
    for (const key of ORDER) {
      if (rows[key].value !== '' && rows[key].evidence.trim() !== '') observations[key] = rows[key]
    }
    const res = await api.deriveSignature({
      signatureId: `sig_${subjectId || 'anonymous'}`,
      subjectId: subjectId || 'anonymous',
      observations,
    })
    setBusy(false)
    if (res.ok) {
      setResult(res.data)
      setFailure(null)
    } else {
      setResult(null)
      setFailure({ error: res.error, code: res.code })
    }
  }

  return (
    <>
      <Panel
        id="signature-derive"
        title="Derive a BehavioralSignature"
        hint="Six parameters describe how the subject works. Each needs an observation and a note of where it was measured. A parameter with neither is left unmeasured — it is never guessed, and a signature below four usable parameters is provisional."
      >
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="sig-subject">Subject id</label>
          <input
            id="sig-subject"
            type="text"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          />
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">Measured value</th>
                <th scope="col">Confidence</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.map((key) => (
                <tr key={key}>
                  <th scope="row" className="mono" style={{ color: 'var(--text)', fontWeight: 500 }}>
                    {key}
                  </th>
                  <td>
                    <label htmlFor={`v-${key}`} className="visually-hidden">
                      Value for {key}
                    </label>
                    <select
                      id={`v-${key}`}
                      value={rows[key].value}
                      onChange={(e) => set(key, { value: e.target.value })}
                    >
                      <option value="">— unmeasured —</option>
                      {DOMAINS[key].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <label htmlFor={`c-${key}`} className="visually-hidden">
                      Confidence for {key}
                    </label>
                    <input
                      id={`c-${key}`}
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={rows[key].confidence}
                      onChange={(e) => set(key, { confidence: Number(e.target.value) })}
                    />
                  </td>
                  <td style={{ minWidth: 200 }}>
                    <label htmlFor={`e-${key}`} className="visually-hidden">
                      Evidence for {key}
                    </label>
                    <input
                      id={`e-${key}`}
                      type="text"
                      placeholder="Where this was measured"
                      value={rows[key].evidence}
                      onChange={(e) => set(key, { evidence: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="row">
          <button type="button" className="btn btn--primary" onClick={derive} disabled={busy}>
            {busy ? 'Deriving…' : 'Derive signature'}
          </button>
          <Badge tone={filled >= 4 ? 'allow' : 'escalate'}>
            {filled}/6 parameters ready
          </Badge>
          <span className="stat__note">Provisional below 4 usable parameters.</span>
        </div>
      </Panel>

      <Panel id="signature-result" title="Derived signature">
        {failure ? <ErrorNote error={failure.error} code={failure.code} /> : null}
        {!result && !failure ? <Empty>No signature derived yet.</Empty> : null}
        {result ? (
          <>
            <div className="grid-3">
              <Stat
                label="Completeness"
                value={result.completeness}
                note={result.signature.provisional_mode ? 'Provisional mode' : 'Complete'}
              />
              <Stat
                label="Drives automation"
                value={result.coherence.drivesAutomation ? 'yes' : 'no'}
                note={result.signature.provisional_mode ? 'Provisional signatures do not drive pattern parameters.' : undefined}
              />
              <Stat label="Unmeasured" value={result.unmeasured.length} note={result.unmeasured.join(', ') || 'none'} />
            </div>

            {result.signature.provisional_mode ? (
              <Callout tone="warn" title="Provisional mode">
                {result.unmeasured.length} parameter(s) have no usable measurement. Automation under this signature runs
                on declared defaults rather than on the subject's own pattern, and the PatternGenerator will refuse.
              </Callout>
            ) : (
              <Callout tone="accent" title="Signature is complete">
                Every parameter carries a measurement above the usable-confidence threshold.
              </Callout>
            )}

            {result.rejected.length > 0 ? (
              <Callout tone="warn" title="Rejected observations">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {result.rejected.map((r) => (
                    <li key={r.parameter} className="mono">
                      {r.parameter}: {r.reason}
                    </li>
                  ))}
                </ul>
              </Callout>
            ) : null}

            <details open>
              <summary className="callout__title" style={{ cursor: 'pointer' }}>
                Signature
              </summary>
              <div style={{ marginTop: 8 }}>
                <Code>{JSON.stringify(result.signature, null, 2)}</Code>
              </div>
            </details>
          </>
        ) : null}
      </Panel>
    </>
  )
}
