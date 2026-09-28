/**
 * POST /api/authorize — the Sentinel as a service.
 *
 * The browser console calls this to ask whether an action may proceed. The
 * decision logic is `core/sentinel`; this endpoint only moves a request across
 * the wire, rate-limits it, and refuses to run without live consent.
 *
 * GET is not supported: an authorization decision is a state-changing
 * judgement, and a decision that a crawler could trigger from a URL is not a
 * decision.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorize, type AuthorizationRequest, type ActionClass } from '../src/core/index.js'
import { publicConfig } from './_lib/config.js'
import { applyRateLimit, guard, methodNotAllowed, noStore, rateLimit, readJson, validationFailed } from './_lib/http.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    noStore(res)

    const config = publicConfig()
    const limit = rateLimit(req, config.rateLimit.requests, config.rateLimit.windowMs)
    applyRateLimit(res, limit)
    if (!limit.allowed) {
      res.status(429).json({ error: 'rate_limited', code: 'rate_limited' })
      return
    }

    const parsed = await readJson<Partial<AuthorizationRequest>>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)

    const body = parsed.body
    const issues: string[] = []
    if (!body.requestId) issues.push('requestId is required')
    if (!body.principalId) issues.push('principalId is required')
    if (!body.actionClass) issues.push('actionClass is required')
    if (!body.consent) issues.push('consent block is required')
    if (issues.length > 0) return validationFailed(res, issues)

    if (!Array.isArray(body.requestedScopes)) body.requestedScopes = []
    if (typeof body.subjectAvailable !== 'boolean') body.subjectAvailable = false

    const decision = authorize({
      requestId: body.requestId!,
      principalId: body.principalId!,
      actionClass: body.actionClass as ActionClass,
      targetDescription: body.targetDescription ?? 'unspecified target',
      requestedScopes: body.requestedScopes!,
      consent: body.consent!,
      ...(body.credentialRef ? { credentialRef: body.credentialRef } : {}),
      subjectAvailable: body.subjectAvailable,
      ...(body.priorApprovals ? { priorApprovals: body.priorApprovals } : {}),
      ...(body.spend ? { spend: body.spend } : {}),
      ...(body.budget ? { budget: body.budget } : {}),
      ...(body.guardrailFacts ? { guardrailFacts: body.guardrailFacts } : {}),
      ...(body.bridge ? { bridge: body.bridge } : {}),
      ...(body.contracts ? { contracts: body.contracts } : {}),
      ...(body.preApproved ? { preApproved: true } : {}),
    })

    res.status(200).json({ decision })
  })
}
