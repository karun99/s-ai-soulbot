/**
 * POST /api/trace    — append a step to a flow's hash chain.
 * GET  /api/trace    — read a chain and verify it.
 * GET  /api/trace?verify=1 — verify only, returning the full record set.
 *
 * Append is idempotent by `trace_id`: a retried request does not fork the
 * chain. Every record is redacted before it is written, so the log cannot
 * become the leak (STRIDE I-003).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  ActionTrace,
  appendStep,
  redactTrace,
  verifyChain,
  type ChainedTrace,
} from '../src/core/index.js'
import { keys, store } from './_lib/store.js'
import { applyRateLimit, guard, methodNotAllowed, noStore, rateLimit, readJson, validationFailed, badRequest } from './_lib/http.js'
import { publicConfig } from './_lib/config.js'

async function loadChain(flowId: string): Promise<ChainedTrace[]> {
  return store().read<ChainedTrace>(keys.trace(flowId), 500)
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)
    const config = publicConfig()

    if (req.method === 'GET') {
      const flowId = typeof req.query.flow_id === 'string' ? req.query.flow_id : ''
      if (!flowId) return badRequest(res, 'flow_id query parameter is required')
      const records = await loadChain(flowId)
      const verification = await verifyChain(records)
      res.status(200).json({ flowId, count: records.length, records, verification })
      return
    }

    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

    const limit = rateLimit(req, config.rateLimit.requests, config.rateLimit.windowMs)
    applyRateLimit(res, limit)
    if (!limit.allowed) {
      res.status(429).json({ error: 'rate_limited', code: 'rate_limited' })
      return
    }

    const parsed = await readJson<{ trace?: unknown; flowId?: string }>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)

    const parsedTrace = ActionTrace.safeParse(parsed.body.trace)
    if (!parsedTrace.success) {
      return validationFailed(
        res,
        parsedTrace.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`),
      )
    }

    const trace = redactTrace(parsedTrace.data)
    const existing = await loadChain(trace.flow_id)

    /* Idempotency: an already-appended trace_id returns the existing record. */
    const duplicate = existing.find((r) => r.trace_id === trace.trace_id)
    if (duplicate) {
      const verification = await verifyChain(existing)
      res.status(200).json({ ok: true, duplicate: true, record: duplicate, verification })
      return
    }

    const result = await appendStep(existing, trace)
    if (!result.ok || !result.record) {
      res.status(409).json({ error: result.error ?? 'append_rejected', code: 'forbidden', details: result })
      return
    }

    const kb = store().kind
    if (kb === 'rest-kv') await store().append(keys.trace(trace.flow_id), result.record)
    else await store().set(keys.trace(trace.flow_id), [...existing, result.record])

    const verification = await verifyChain([...existing, result.record])
    res.status(201).json({ ok: true, record: result.record, state: result.state, verification })
  })
}
