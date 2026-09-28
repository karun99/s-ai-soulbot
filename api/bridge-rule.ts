/**
 * POST /api/bridge-rule — evaluate the Bridge Rule.
 *
 * Exposed on its own because it is the ethical centre of the system and a
 * reviewer should be able to interrogate it without constructing a full
 * authorization request.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { evaluateBridgeRule, DELEGATION_MODEL, BRIDGE_QUESTION, type BridgeContext } from '../src/core/index.js'
import { guard, methodNotAllowed, noStore, readJson, validationFailed } from './_lib/http.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)

    if (req.method === 'GET') {
      res.status(200).json({ question: BRIDGE_QUESTION, delegationModel: DELEGATION_MODEL })
      return
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

    const parsed = await readJson<{ context?: Partial<BridgeContext> }>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)
    if (!parsed.body.context || typeof parsed.body.context !== 'object')
      return validationFailed(res, ['context object is required'])

    const c = parsed.body.context
    const context: BridgeContext = {
      actionClass: c.actionClass ?? 'click',
      stepDescription: c.stepDescription ?? 'unspecified step',
      irreversible: c.irreversible ?? false,
      affectsOthers: c.affectsOthers ?? false,
      financialExposureUsd: c.financialExposureUsd ?? 0,
      emotionallyLoaded: c.emotionallyLoaded ?? false,
      sensitiveDomain: c.sensitiveDomain ?? 'none',
      connectionPointers: c.connectionPointers ?? [],
      relianceCount: c.relianceCount ?? 0,
      displacesSubject: c.displacesSubject ?? false,
      decisionDelegated: c.decisionDelegated ?? false,
      ...(c.relianceEscalation !== undefined ? { relianceEscalation: c.relianceEscalation } : {}),
    }

    res.status(200).json({ verdict: evaluateBridgeRule(context), question: BRIDGE_QUESTION })
  })
}
