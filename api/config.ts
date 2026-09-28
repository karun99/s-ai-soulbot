/**
 * GET /api/config — the deployment's public configuration.
 *
 * The browser is shown this and nothing else. No secret, no internal URL, no
 * token. It is the read side of "configurable through Vercel": change an
 * environment variable, redeploy, and the console reflects it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { publicConfig, secretConfig } from './_lib/config.js'
import { guard, methodNotAllowed, noStore } from './_lib/http.js'
import { SOULBOT_VERSION, INVARIANTS, ONE_SENTENCE } from '../src/core/index.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    noStore(res)
    res.status(200).json({
      config: publicConfig(),
      /** Presence only — never the value. */
      secretsPresent: secretConfig(),
      version: SOULBOT_VERSION,
      invariants: INVARIANTS,
      oneSentence: ONE_SENTENCE,
    })
  })
}
