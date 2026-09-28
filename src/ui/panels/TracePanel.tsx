/** Trace panel: read a flow's hash chain and verify it. */

import { useState } from 'react'
import { Badge, Callout, Code, Empty, ErrorNote, Panel, Stat } from '../components/primitives.js'
import { api, type VerifyResponse } from '../lib/api.js'

interface TraceRecord {
  trace_id: string
  step: number
  timestamp: string
  operation: string
  target_description: string
  sentinel_decision: string
  cost_usd: number
  success: boolean
  hash: string
  prevHash: string
}

export function TracePanel() {
  const [flowId, setFlowId] = useState('')
  const [records, setRecords] = useState<TraceRecord[]>([])
  const [verification, setVerification] = useState<VerifyResponse | null>(null)
  const [failure, setFailure] = useState<{ error: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    setBusy(true)
    setLoaded(false)
    const res = await api.readTrace(flowId.trim())
    setBusy(false)
    if (res.ok) {
      setRecords(res.data.records as TraceRecord[])
      setVerification(res.data.verification)
      setFailure(null)
      setLoaded(true)
    } else {
      setRecords([])
      setVerification(null)
      setFailure({ error: res.error, code: res.code })
      setLoaded(true)
    }
  }

  return (
    <>
      <Panel
        id="trace-read"
        title="ActionTrace"
        hint="Each step commits to its predecessor, so a modified or removed record invalidates everything after it. Records are redacted before they are written — a log that leaks is a log that gets deleted."
        tools={
          <div className="row">
            <label htmlFor="trace-flow" className="visually-hidden">
              Flow id
            </label>
            <input
              id="trace-flow"
              type="text"
              placeholder="flow id"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
              style={{ width: 200 }}
            />
            <button type="button" className="btn" onClick={load} disabled={busy || flowId.trim() === ''}>
              {busy ? 'Loading…' : 'Read chain'}
            </button>
          </div>
        }
      >
        {failure ? <ErrorNote error={failure.error} code={failure.code} /> : null}
        {loaded && !failure && records.length === 0 ? (
          <Empty>No records for this flow. Traces are held in the serverless store; a cold start clears the in-memory one.</Empty>
        ) : null}
        {!loaded && !failure ? <Empty>Enter a flow id to read its chain.</Empty> : null}

        {verification ? (
          <>
            <div className="grid-3">
              <Stat label="Records" value={verification.count} />
              <Stat
                label="Chain"
                value={<Badge tone={verification.valid ? 'allow' : 'deny'}>{verification.valid ? 'intact' : 'broken'}</Badge>}
              />
              <Stat label="Broken at" value={verification.brokenAt === -1 ? '—' : verification.brokenAt} />
            </div>
            <Callout tone={verification.valid ? 'accent' : 'warn'} title="Verification">
              {verification.message}
            </Callout>
          </>
        ) : null}
      </Panel>

      {records.length > 0 ? (
        <Panel id="trace-records" title="Records" flush>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">Operation</th>
                  <th scope="col">Target</th>
                  <th scope="col">Sentinel</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Result</th>
                  <th scope="col">Hash</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.trace_id}>
                    <td className="mono">{r.step}</td>
                    <td className="mono">{r.operation}</td>
                    <td>{r.target_description}</td>
                    <td>
                      <Badge
                        tone={
                          r.sentinel_decision === 'allow'
                            ? 'allow'
                            : r.sentinel_decision === 'ask_user'
                              ? 'escalate'
                              : 'deny'
                        }
                      >
                        {r.sentinel_decision}
                      </Badge>
                    </td>
                    <td className="mono">${r.cost_usd.toFixed(4)}</td>
                    <td>{r.success ? 'ok' : 'failed'}</td>
                    <td className="mono" style={{ color: 'var(--text-faint)' }}>
                      {r.hash.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 'var(--sp-4)' }}>
            <details>
              <summary className="callout__title" style={{ cursor: 'pointer' }}>
                Full records
              </summary>
              <div style={{ marginTop: 8 }}>
                <Code>{JSON.stringify(records, null, 2)}</Code>
              </div>
            </details>
          </div>
        </Panel>
      ) : null}
    </>
  )
}
