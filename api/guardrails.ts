/**
 * GET  /api/guardrails — the full Jātaka registry, grouped by pāramī.
 * POST /api/guardrails — evaluate the registry against a set of facts.
 *
 * POST takes facts as data, never as instructions. There is no field that the
 * caller can use to state a verdict, skip a guardrail, or name an outcome; the
 * caller describes what is true and the engine decides.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  JATAKA_REGISTRY,
  PARAMIS,
  evaluateGuardrails,
  type GuardrailFacts,
} from '../src/core/index.js'
import { applyRateLimit, guard, methodNotAllowed, noStore, rateLimit, readJson, validationFailed } from './_lib/http.js'
import { publicConfig } from './_lib/config.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)
    const config = publicConfig()

    if (req.method === 'GET') {
      res.status(200).json({
        count: JATAKA_REGISTRY.length,
        registry: JATAKA_REGISTRY,
        paramis: PARAMIS,
      })
      return
    }

    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

    const limit = rateLimit(req, config.rateLimit.requests, config.rateLimit.windowMs)
    applyRateLimit(res, limit)
    if (!limit.allowed) {
      res.status(429).json({ error: 'rate_limited', code: 'rate_limited' })
      return
    }

    const parsed = await readJson<{ facts?: GuardrailFacts }>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)
    if (!parsed.body.facts || typeof parsed.body.facts !== 'object')
      return validationFailed(res, ['facts object is required'])

    const report = evaluateGuardrails(parsed.body.facts)
    res.status(200).json({ report })
  })
}
