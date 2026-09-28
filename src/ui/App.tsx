/** App shell: masthead, navigation, panel routing. */

import { useState } from 'react'
import { JATAKA_REGISTRY } from '@core/index.js'
import { OverviewPanel } from './panels/OverviewPanel.js'
import { JatakaPanel } from './panels/JatakaPanel.js'
import { SentinelPanel } from './panels/SentinelPanel.js'
import { BridgePanel } from './panels/BridgePanel.js'
import { SignaturePanel } from './panels/SignaturePanel.js'
import { TracePanel } from './panels/TracePanel.js'
import { ConformancePanel } from './panels/ConformancePanel.js'

type ViewId = 'overview' | 'jata' | 'sentinel' | 'bridge' | 'signature' | 'trace' | 'conformance'

const VIEWS: { id: ViewId; label: string; hint: string; count?: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'What this deployment is, and how it is configured.' },
  { id: 'jata', label: 'Jātaka Registry', hint: 'The 23 precedents and their verdicts.', count: String(JATAKA_REGISTRY.length) },
  { id: 'sentinel', label: 'Sentinel', hint: 'The sole authorization authority.' },
  { id: 'bridge', label: 'Bridge Rule', hint: 'Who is one real person you could tell this to?' },
  { id: 'signature', label: 'Signature', hint: 'Six parameters, measured only.' },
  { id: 'trace', label: 'ActionTrace', hint: 'The tamper-evident execution record.' },
  { id: 'conformance', label: 'Conformance', hint: 'Tiers T0–T6.' },
]

export default function App() {
  const [view, setView] = useState<ViewId>('overview')
  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__brand">
          <span className="masthead__name">S-AI SoulBot</span>
          <span className="masthead__version">v3.0.0</span>
        </div>
        <p className="masthead__tagline">
          A trust and resilience system that performs browser tasks at the subject’s cognitive level, in the subject’s
          own pattern, within the subject’s authorized session — and knows when to stop, and who to point to.
        </p>
      </header>

      <div className="shell">
        <nav className="sidebar" aria-label="Console sections">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="navlink"
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => setView(v.id)}
            >
              <span>{v.label}</span>
              {v.count ? <span className="navlink__count">{v.count}</span> : null}
            </button>
          ))}
        </nav>

        <main className="content" key={view}>
          {view === 'overview' ? <OverviewPanel /> : null}
          {view === 'jata' ? <JatakaPanel /> : null}
          {view === 'sentinel' ? <SentinelPanel /> : null}
          {view === 'bridge' ? <BridgePanel /> : null}
          {view === 'signature' ? <SignaturePanel /> : null}
          {view === 'trace' ? <TracePanel /> : null}
          {view === 'conformance' ? <ConformancePanel /> : null}
        </main>
      </div>

      <footer className="footer">
        <span>S-AI SoulBot v3.0.0</span>
        <span aria-hidden="true">·</span>
        <span>MIT licensed · © 2026 Sai Karun Nandipati</span>
        <span aria-hidden="true">·</span>
        <a href="https://orcid.org/0009-0007-9218-9750" target="_blank" rel="noreferrer noopener">
          ORCID 0009-0007-9218-9750
        </a>
        <span aria-hidden="true">·</span>
        <span>Originated from the Neural Harness project</span>
        <span aria-hidden="true">·</span>
        <span>Current view: {active.hint}</span>
      </footer>
    </div>
  )
}
