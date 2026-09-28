/** Conformance panel: run tiers T0–T6 and read the result honestly. */

import { useState } from 'react'
import { TIER_ORDER } from '@core/index.js'
import { Badge, Callout, Code, Empty, ErrorNote, Panel, Stat } from '../components/primitives.js'
import { api, type ConformanceResponse } from '../lib/api.js'

const STATUS_TONE = { pass: 'allow', fail: 'deny', skipped: 'neutral' } as const

export function ConformancePanel() {
  const [report, setReport] = useState<ConformanceResponse | null>(null)
  const [failure, setFailure] = useState<{ error: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    const res = await api.runConformance({})
    setBusy(false)
    if (res.ok) {
      setReport(res.data.report)
      setFailure(null)
    } else {
      setFailure({ error: res.error, code: res.code })
    }
  }

  return (
    <Panel
      id="conformance"
      title="Conformance tiers"
      hint="The harness checking itself. A tier that could not run in this runtime is reported as skipped, never as passed — a tier that did not run is not a tier that passed."
      tools={
        <button type="button" className="btn btn--primary" onClick={run} disabled={busy}>
          {busy ? 'Running…' : 'Run conformance'}
        </button>
      }
    >
      {failure ? <ErrorNote error={failure.error} code={failure.code} /> : null}
      {!report && !failure ? <Empty>No run yet. Press “Run conformance”.</Empty> : null}
      {report ? (
        <>
          <div className="grid-3">
            <Stat label="Passed" value={report.passed} />
            <Stat label="Failed" value={report.failed} />
            <Stat label="Skipped" value={report.skipped} note="Not the same as passed." />
          </div>

          <Callout tone={report.ok ? 'accent' : 'warn'} title={report.ok ? 'No blocking tier failed' : 'Blocking failure'}>
            {report.message}
          </Callout>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Tier</th>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Blocking</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {TIER_ORDER.map((id) => {
                  const tier = report.tiers.find((t) => t.tier === id)
                  if (!tier) return null
                  return (
                    <tr key={id}>
                      <th scope="row" className="mono" style={{ color: 'var(--text)' }}>
                        {tier.tier}
                      </th>
                      <td>{tier.name}</td>
                      <td>
                        <Badge tone={STATUS_TONE[tier.status]}>{tier.status}</Badge>
                      </td>
                      <td>{tier.blocking ? 'yes' : 'no'}</td>
                      <td className="stat__note">{tier.message}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {report.tiers.some((t) => t.checks.length > 0) ? (
            <details>
              <summary className="callout__title" style={{ cursor: 'pointer' }}>
                Check detail
              </summary>
              <div style={{ marginTop: 8, display: 'grid', gap: 12 }}>
                {report.tiers
                  .filter((t) => t.checks.length > 0)
                  .map((t) => (
                    <div key={t.tier}>
                      <p className="eyebrow">
                        {t.tier} · {t.name}
                      </p>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                        {t.checks.map((c) => (
                          <li key={c.name} className="stat__note">
                            <Badge tone={c.ok ? 'allow' : 'deny'}>{c.ok ? 'ok' : 'fail'}</Badge>{' '}
                            <span className="mono">{c.name}</span> — {c.detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </details>
          ) : null}

          <details>
            <summary className="callout__title" style={{ cursor: 'pointer' }}>
              Raw report
            </summary>
            <div style={{ marginTop: 8 }}>
              <Code>{JSON.stringify(report, null, 2)}</Code>
            </div>
          </details>
        </>
      ) : null}
    </Panel>
  )
}
