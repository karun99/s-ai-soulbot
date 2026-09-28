/**
 * POST /api/consent — consent evaluation, continuity, and revocation.
 *
 * Three modes:
 *   check      — is consent live for this action, right now
 *   continuity — replay the ledger and report identity continuity
 *   revoke     — revoke and report what must be invalidated downstream
 *
 * Revocation is idempotent per `consentId` + `revokedAt`, and always reports
 * the personas it invalidates so a caller cannot quietly ignore them.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  ConsentObject,
  checkConsent,
  fromConsentObject,
  revoke,
  assessContinuity,
  REVOCATION_PROPAGATION_MS,
  type ConsentQuery,
  type ContinuityLedgerEntry,
  type RevocationTarget,
} from '../src/core/index.js'
import { keys, store } from './_lib/store.js'
import { guard, methodNotAllowed, noStore, readJson, validationFailed } from './_lib/http.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)
    if (req.method === 'GET') {
      res.status(200).json({ revocationPropagationMs: REVOCATION_PROPAGATION_MS })
      return
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

    const parsed = await readJson<Record<string, unknown>>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)

    const mode = parsed.body.mode
    if (mode === 'check') return respondCheck(res, parsed.body)
    if (mode === 'continuity') return respondContinuity(res, parsed.body)
    if (mode === 'revoke') return respondRevoke(res, parsed.body)

    return validationFailed(res, ['mode must be "check", "continuity", or "revoke"'])
  })
}

async function loadConsent(body: Record<string, unknown>) {
  if (body.consent) {
    const result = ConsentObject.safeParse(body.consent)
    return result.success ? fromConsentObject(result.data) : null
  }
  const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
  if (!subjectId) return null
  const stored = await store().get<ReturnType<typeof fromConsentObject>>(keys.consent(subjectId))
  return stored
}

async function respondCheck(res: VercelResponse, body: Record<string, unknown>) {
  const state = await loadConsent(body)
  if (!state) return validationFailed(res, ['consent object required, or a stored consent for subjectId'])

  const query = body.query as Partial<ConsentQuery> | undefined
  if (!query?.connector) return validationFailed(res, ['query.connector is required'])
  if (!Array.isArray(query.requiredScopes)) return validationFailed(res, ['query.requiredScopes must be an array'])

  const result = checkConsent(state, {
    connector: query.connector,
    requiredScopes: query.requiredScopes,
    purpose: query.purpose ?? 'persona_synthesis',
  })
  res.status(200).json({ result })
}

async function respondContinuity(res: VercelResponse, body: Record<string, unknown>) {
  const ledger = body.ledger
  if (!Array.isArray(ledger)) return validationFailed(res, ['ledger array is required'])
  const result = assessContinuity(ledger as ContinuityLedgerEntry[])
  res.status(200).json({ continuity: result })
}

async function respondRevoke(res: VercelResponse, body: Record<string, unknown>) {
  const state = await loadConsent(body)
  if (!state) return validationFailed(res, ['consent object required, or a stored consent for subjectId'])

  const target = body.target as RevocationTarget | undefined
  if (!target || !['all', 'connector', 'scope'].includes(target.kind))
    return validationFailed(res, ['target with kind "all" | "connector" | "scope" is required'])

  const personas = Array.isArray(body.derivedPersonas)
    ? (body.derivedPersonas as { personaId: string; connectors: string[]; scopes: string[] }[])
    : []

  const result = revoke(state, target, personas)

  /* Persist the reduced consent so later checks see it. */
  if (body.subjectId && typeof body.subjectId === 'string')
    await store().set(keys.consent(body.subjectId), result.state)

  res.status(200).json({
    changes: result.changes,
    invalidatedPersonas: result.invalidatedPersonas,
    withinWindow: result.withinWindow,
    propagationMs: result.propagationMs,
    propagationWindowMs: REVOCATION_PROPAGATION_MS,
    revokedAt: result.revokedAt,
  })
}
