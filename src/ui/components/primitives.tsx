/** Small presentational primitives shared by every panel. */

import type { ReactNode } from 'react'

export function Panel({
  title,
  hint,
  tools,
  children,
  flush,
  id,
}: {
  title: string
  hint?: ReactNode
  tools?: ReactNode
  children: ReactNode
  flush?: boolean
  id?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section className="panel" aria-labelledby={headingId} id={id}>
      <div className="panel__head">
        <div style={{ minWidth: 0 }}>
          <h2 className="panel__title" id={headingId}>
            {title}
          </h2>
          {hint ? <p className="panel__hint">{hint}</p> : null}
        </div>
        {tools ? <div className="panel__tools">{tools}</div> : null}
      </div>
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
    </section>
  )
}

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: 'critical' | 'high' | 'moderate' | 'low' | 'allow' | 'escalate' | 'deny' | 'neutral' | 'accent'
  children: ReactNode
  title?: string
}) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {note ? <span className="stat__note">{note}</span> : null}
    </div>
  )
}

export function Callout({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'accent' | 'warn'
  title?: string
  children: ReactNode
}) {
  return (
    <div className={tone === 'neutral' ? 'callout' : `callout callout--${tone}`}>
      <div style={{ minWidth: 0 }}>
        {title ? <p className="callout__title">{title}</p> : null}
        <div className="callout__body">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Code({ children }: { children: string }) {
  return <pre className="code">{children}</pre>
}

/** Renders an API result's failure in a consistent, non-alarming way. */
export function ErrorNote({ error, code }: { error: string; code: string }) {
  return (
    <Callout tone="warn" title={code === 'network_error' ? 'Could not reach the API' : `Rejected: ${code}`}>
      <span className="mono">{error}</span>
    </Callout>
  )
}
