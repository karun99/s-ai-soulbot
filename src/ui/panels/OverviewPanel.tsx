/** Overview: what this deployment is, what it is not, and how it is configured. */

import { useState } from 'react'
import { INVARIANTS, JATAKA_REGISTRY, PARAMIS } from '@core/index.js'
import { Badge, Callout, Code, Empty, ErrorNote, Panel, Stat } from '../components/primitives.js'
import { api } from '../lib/api.js'
import { useAsync } from '../lib/useAsync.js'

export function OverviewPanel() {
  const { value, loading, error } = useAsync(() => api.config(), [])
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const config = value?.ok ? value.data : null

  return (
    <>
      <Panel
        id="overview"
        title="S-AI SoulBot"
        hint={value?.ok ? value.data.oneSentence : 'A consent-gated companion harness.'}
        tools={
          <button type="button" className="btn btn--sm btn--ghost" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'} theme
          </button>
        }
      >
        {error ? <ErrorNote error={String(error)} code="config" /> : null}
        {loading && !config ? <Empty>Reading deployment configuration…</Empty> : null}

        {config ? (
          <>
            <div className="grid-3">
              <Stat label="Version" value={config.version} note={config.config.environment} />
              <Stat
                label="Persistence"
                value={config.config.persistence}
                note={config.config.persistence === 'ephemeral' ? 'in-memory, resets on cold start' : 'durable store attached'}
              />
              <Stat label="Vault" value={config.config.vaultMode} note="no secret is held here" />
            </div>

            <Callout tone="accent" title="What this deployment is">
              The trust and resilience core: the Jātaka guardrail registry, the Sentinel authorization authority, consent
              continuity, signature coherence, the trace hash chain, and the T0–T6 conformance tiers. Configured entirely
              through environment variables, which the panel below reflects.
            </Callout>

            <Callout tone="warn" title="What this deployment is not">
              It does not host a browser. Chromium, CDP execution, the credential vault, and the OAuth token exchange
              run on the subject-controlled machine, inside the session that subject authorized. This is not a limitation
              bolted on afterwards — it is the architecture the delegation model requires: acts for the subject, never as
              the subject.
            </Callout>

            <div>
              <p className="eyebrow">Four invariants</p>
              <div className="grid-2" style={{ marginTop: 8 }}>
                {INVARIANTS.map((iv) => (
                  <div key={iv.id} className="stat" style={{ gap: 2 }}>
                    <div className="row">
                      <span className="mono" style={{ color: 'var(--accent)' }}>
                        {iv.id}
                      </span>
                      <strong style={{ fontSize: '0.8125rem' }}>{iv.statement}</strong>
                    </div>
                    <span className="stat__note">{iv.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="eyebrow">Operational notes</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
                {config.config.notes.map((n, i) => (
                  <li key={i} className="stat__note">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </Panel>

      <Panel
        id="registry-summary"
        title="The registry at a glance"
        hint="23 precedents across 10 pāramīs, each with a check type the evaluation engine can run."
        tools={<Badge tone="accent">{JATAKA_REGISTRY.length} guardrails</Badge>}
        flush
      >
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Count</th>
                <th scope="col">Guardrails</th>
              </tr>
            </thead>
            <tbody>
              {(['critical', 'high', 'moderate', 'low'] as const).map((sev) => {
                const list = JATAKA_REGISTRY.filter((g) => g.severity === sev)
                return (
                  <tr key={sev}>
                    <td>
                      <Badge tone={sev}>{sev}</Badge>
                    </td>
                    <td className="mono">{list.length}</td>
                    <td className="mono">{list.map((g) => g.id).join(', ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 'var(--sp-4)' }}>
          <div className="row">
            {PARAMIS.map((p) => (
              <span key={p.parami} className="badge badge--neutral" title={p.category}>
                {p.parami} · {p.guardrails.length}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      <Panel
        id="deployment-config"
        title="Deployment configuration"
        hint="Read from the Vercel environment. Change a variable and redeploy; this panel reflects it on the next load."
      >
        {config ? (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Setting</th>
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" style={{ fontWeight: 500, color: 'var(--text)' }}>
                      Deployment
                    </th>
                    <td className="mono">{config.config.deploymentName}</td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ fontWeight: 500, color: 'var(--text)' }}>
                      Environment
                    </th>
                    <td className="mono">{config.config.environment}</td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ fontWeight: 500, color: 'var(--text)' }}>
                      Default budget
                    </th>
                    <td className="mono">
                      {config.config.defaults.maxTokens.toLocaleString()} tokens · $
                      {config.config.defaults.maxCostUsd.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ fontWeight: 500, color: 'var(--text)' }}>
                      Rate limit
                    </th>
                    <td className="mono">
                      {config.config.rateLimit.requests} requests /{' '}
                      {Math.round(config.config.rateLimit.windowMs / 1000)}s, per instance
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ fontWeight: 500, color: 'var(--text)' }}>
                      Conformance tiers
                    </th>
                    <td className="mono">{config.config.conformanceTiers.join(', ')}</td>
                  </tr>
                  {Object.entries(config.secretsPresent).map(([k, present]) => (
                    <tr key={k}>
                      <th scope="row" className="mono" style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {k}
                      </th>
                      <td>
                        <Badge tone={present ? 'allow' : 'neutral'}>{present ? 'set' : 'not set'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Code>{`# Vercel environment variables
SOULBOT_VERSION=3.0.0
SOULBOT_DEFAULT_MAX_TOKENS=500000
SOULBOT_DEFAULT_MAX_COST_USD=0.50
SOULBOT_RATE_LIMIT_REQUESTS=120
SOULBOT_RATE_LIMIT_WINDOW_MS=60000
SOULBOT_CONFORMANCE_TIERS=T2,T3,T4,T5,T6

# Optional: any Redis-compatible REST store (Vercel KV, Upstash)
KV_REST_API_URL=
KV_REST_API_TOKEN=`}</Code>
          </>
        ) : null}
      </Panel>
    </>
  )
}
