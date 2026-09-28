/**
 * POST /api/validate — artifact validation for T4 and T5.
 *
 * Accepts recipes and flows and reports whether they are valid, with the
 * specific problem for each. Used by the console and by CI.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseRecipe, parseFlow, replayStats, REPLAY_TRUST_FLOOR } from '../src/core/index.js'
import { guard, methodNotAllowed, noStore, readJson, validationFailed } from './_lib/http.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)
    if (req.method === 'GET') {
      res.status(200).json({ replayTrustFloor: REPLAY_TRUST_FLOOR })
      return
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

    const parsed = await readJson<{ recipes?: unknown[]; flows?: unknown[] }>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)

    const recipes = parsed.body.recipes ?? []
    const flows = parsed.body.flows ?? []
    if (!Array.isArray(recipes) || !Array.isArray(flows))
      return validationFailed(res, ['recipes and flows must be arrays'])

    const recipeResults = recipes.map((r) => {
      const result = parseRecipe(r)
      if (!result.ok) return { ok: false as const, errors: result.errors }
      return {
        ok: true as const,
        recipeId: result.recipe.recipe_id,
        t4: result.t4,
        stats: replayStats(result.recipe.replay_stats),
      }
    })

    const flowResults = flows.map((f) => {
      const result = parseFlow(f)
      if (!result.ok) return { ok: false as const, errors: result.errors }
      return { ok: true as const, flowId: result.flow.flow_id, t5: result.t5 }
    })

    const ok =
      recipeResults.every((r) => r.ok) && flowResults.every((f) => f.ok)

    res.status(ok ? 200 : 422).json({ ok, recipes: recipeResults, flows: flowResults })
  })
}
