/**
 * POST /api/conformance — run tiers T0–T6 against supplied artifacts.
 *
 * Tiers whose tooling is not present in this runtime are reported as `skipped`,
 * never as `pass`. A tier that did not run did not pass, and a report that
 * conflates the two is a false assurance.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runConformance, TIER_META, TIER_ORDER, type ConformanceInput, type TierId } from '../src/core/index.js'
import { keys, store } from './_lib/store.js'
import { applyRateLimit, guard, methodNotAllowed, noStore, rateLimit, readJson, validationFailed } from './_lib/http.js'
import { publicConfig } from './_lib/config.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)

    if (req.method === 'GET') {
      res.status(200).json({ tiers: TIER_ORDER, meta: TIER_META })
      return
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

    const config = publicConfig()
    const limit = rateLimit(req, config.rateLimit.requests, config.rateLimit.windowMs)
    applyRateLimit(res, limit)
    if (!limit.allowed) {
      res.status(429).json({ error: 'rate_limited', code: 'rate_limited' })
      return
    }

    const parsed = await readJson<ConformanceInput & { tiers?: string[] }>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)

    const requested = parsed.body.tiers
    const available: TierId[] = (
      requested && requested.length > 0
        ? requested
        : (config.conformanceTiers as TierId[])
    ).filter((t): t is TierId => TIER_ORDER.includes(t as TierId))

    const report = await runConformance({ ...parsed.body, availableTiers: available })

    /* Persist the last report so the console can show it without a round trip. */
    const kb = store().kind
    if (kb === 'memory') await store().set(keys.conformance(), report)

    /* A failed tier is a result, not an HTTP error. The run completed, and
     * `report.ok` is the verdict. Returning 409 here would make a client treat
     * a legitimately failed tier as a transport failure and discard the report
     * that explains why. */
    res.status(200).json({ report })
  })
}
