/** The Jātaka registry panel: the precedent table, filterable and grouped by pāramī. */

import { useMemo, useState } from 'react'
import type { NarrativeGuardrail, Severity } from '@core/index.js'
import { Badge, Callout, Empty, ErrorNote, Panel } from '../components/primitives.js'
import { api, type GuardrailReportResponse, type RegistryResponse } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'

const SEVERITIES: Severity[] = ['critical', 'high', 'moderate', 'low']

const STATUS_TONE = {
  pass: 'allow',
  violation: 'deny',
  not_applicable: 'neutral',
} as const

export function JatakaPanel() {
  const [registry, setRegistry] = useState<RegistryResponse | null>(null)
  const [error, setError] = useState<{ error: string; code: string } | null>(null)
  const [severity, setSeverity] = useState<Severity | 'all'>('all')
  const [parami, setParami] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [report, setReport] = useState<GuardrailReportResponse | null>(null)

  const { loading } = useAsync(async () => {
    const res = await api.registry()
    if (res.ok) {
      setRegistry(res.data)
      setError(null)
    } else {
      setError({ error: res.error, code: res.code })
    }
  }, [])

  const paramis = registry?.paramis ?? []

  const filtered = useMemo(() => {
    const list = registry?.registry ?? []
    const q = query.trim().toLowerCase()
    return list.filter((g) => {
      if (severity !== 'all' && g.severity !== severity) return false
      if (parami !== 'all' && g.parami !== parami) return false
      if (q.length > 0) {
        const hay = `${g.id} ${g.story_name} ${g.assertion} ${g.trigger} ${g.recommended}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [registry, severity, parami, query])

  const verdictById = useMemo(() => {
    const m = new Map<string, GuardrailReportResponse['verdicts'][number]>()
    for (const v of report?.verdicts ?? []) m.set(v.guardrailId, v)
    return m
  }, [report])

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 }
    for (const g of registry?.registry ?? []) c[g.severity] += 1
    return c
  }, [registry])

  return (
    <>
      <Panel
        id="jata-registry"
        title="Jātaka Guardrail Registry"
        hint="Twenty-three precedents from the Jātaka corpus, the Udāna, and the Analogy tradition. Each is a case, not a policy: the engine asks whether the current situation resembles the case, not whether the outcome is convenient."
        tools={
          <div className="row">
            <label htmlFor="jata-search" className="visually-hidden">
              Search guardrails
            </label>
            <input
              id="jata-search"
              type="text"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 150 }}
            />
            <label htmlFor="jata-sev" className="visually-hidden">
              Filter by severity
            </label>
            <select
              id="jata-sev"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity | 'all')}
              style={{ width: 130 }}
            >
              <option value="all">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s} ({counts[s]})
                </option>
              ))}
            </select>
            <label htmlFor="jata-parami" className="visually-hidden">
              Filter by pāramī
            </label>
            <select
              id="jata-parami"
              value={parami}
              onChange={(e) => setParami(e.target.value)}
              style={{ width: 150 }}
            >
              <option value="all">All pāramīs</option>
              {paramis.map((p) => (
                <option key={p.parami} value={p.parami}>
                  {p.parami} — {p.category}
                </option>
              ))}
            </select>
          </div>
        }
        flush
      >
        {error ? <ErrorNote error={error.error} code={error.code} /> : null}
        {loading && !registry ? <Empty>Loading the registry…</Empty> : null}
        {!loading && !registry && !error ? <Empty>Registry unavailable.</Empty> : null}
        {registry && filtered.length === 0 ? <Empty>No guardrail matches these filters.</Empty> : null}
        {filtered.map((g) => (
          <GuardrailRow key={g.id} guardrail={g} verdict={verdictById.get(g.id)} />
        ))}
      </Panel>

      <Panel
        id="jata-paramis"
        title="The Ten Pāramīs as guardrail categories"
        hint="D.1. Each perfection is a category of precedent, and the guardrails filed under it are the cases that taught it."
      >
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Pāramī</th>
                <th scope="col">Category</th>
                <th scope="col">Precedents</th>
              </tr>
            </thead>
            <tbody>
              {paramis.map((p) => (
                <tr key={p.parami}>
                  <th scope="row" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {p.parami}
                  </th>
                  <td>{p.category}</td>
                  <td className="mono">{p.guardrails.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {report ? (
        <Panel
          id="jata-verdicts"
          title="Evaluation verdicts"
          hint="The verdicts from the most recent evaluation, shown against the registry."
          tools={
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setReport(null)}>
              Clear
            </button>
          }
        >
          <div className="row">
            <Badge tone={report.outcome === 'block' ? 'deny' : report.outcome === 'escalate' ? 'escalate' : 'allow'}>
              {report.outcome}
            </Badge>
            <span className="stat__note">
              {report.counts.violation} violation(s), {report.counts.pass} pass, {report.counts.notApplicable} with no
              standing on the facts supplied.
            </span>
          </div>
          {report.violations.length > 0 ? (
            <div className="grid-2">
              {report.violations.map((v) => (
                <div key={v.guardrailId} className="stat" style={{ gap: 'var(--sp-2)' }}>
                  <div className="row">
                    <span className="mono" style={{ color: 'var(--accent)' }}>
                      {v.guardrailId}
                    </span>
                    <Badge tone={v.severity === 'critical' ? 'critical' : v.severity}>{v.severity}</Badge>
                  </div>
                  <p className="callout__body">{v.finding}</p>
                  <p className="callout__body">
                    <strong>Precedent:</strong> {v.storyRef} — {v.assertion}
                  </p>
                  <p className="callout__body">
                    <strong>Recommended:</strong> {v.recommended}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Callout tone="accent" title="No violation">
              Every guardrail with a standing on the supplied facts passed. The remainder had none.
            </Callout>
          )}
        </Panel>
      ) : null}
    </>
  )
}

function GuardrailRow({
  guardrail,
  verdict,
}: {
  guardrail: NarrativeGuardrail
  verdict: GuardrailReportResponse['verdicts'][number] | undefined
}) {
  return (
    <article className="guard">
      <span className="guard__id">{guardrail.id}</span>
      <div style={{ minWidth: 0 }}>
        <p className="guard__assertion">{guardrail.assertion}</p>
        <p className="guard__meta">
          {guardrail.story_ref} · {guardrail.parami} · <span className="mono">{guardrail.check_type}</span>
        </p>
        <p className="guard__meta" style={{ marginTop: 4 }}>
          <strong>Trigger:</strong> {guardrail.trigger}
        </p>
        <p className="guard__meta">
          <strong>Prohibited:</strong> {guardrail.prohibited}
        </p>
        {verdict?.status === 'violation' ? (
          <p className={verdict.severity === 'critical' ? 'guard__finding' : 'guard__finding guard__finding--escalate'}>
            {verdict.finding}
            <span className="guard__recommended">
              <strong>Recommended:</strong> {verdict.recommended}
            </span>
          </p>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <Badge tone={guardrail.severity === 'critical' ? 'critical' : guardrail.severity}>{guardrail.severity}</Badge>
        {verdict ? <Badge tone={STATUS_TONE[verdict.status]}>{verdict.status.replace('_', ' ')}</Badge> : null}
      </div>
    </article>
  )
}
