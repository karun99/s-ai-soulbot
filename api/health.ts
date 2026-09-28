/**
 * GET /api/health — liveness and build identity.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SOULBOT_VERSION, INVARIANTS } from '../src/core/index.js'
import { publicConfig } from './_lib/config.js'
import { store } from './_lib/store.js'
import { guard, noStore } from './_lib/http.js'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)
    const config = publicConfig()
    res.status(200).json({
      status: 'ok',
      service: 's-ai-soulbot',
      version: SOULBOT_VERSION,
      environment: config.environment,
      persistence: config.persistence,
      store: store().kind,
      invariants: INVARIANTS,
      browserNode: 'external',
      timestamp: new Date().toISOString(),
    })
  })
}
