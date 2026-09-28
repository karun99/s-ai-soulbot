/**
 * POST /api/signature — derive or check a BehavioralSignature.
 *
 * `POST` with `mode: "derive"` takes observations and produces a signature.
 * `POST` with `mode: "check"` takes a signature and reports coherence.
 *
 * There is no "fill" mode. A signature cannot be populated without an
 * observation behind each parameter, and the endpoint will not invent one.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  BehavioralSignature,
  SIGNATURE_PARAMETERS,
  SIGNATURE_DOMAIN,
  checkCoherence,
  deriveSignature,
  completenessLabel,
  PROVISIONAL_COMPLETENESS,
  USABLE_CONFIDENCE,
  type SignatureParameterName,
  type ParameterObservation,
} from '../src/core/index.js'
import { guard, methodNotAllowed, noStore, readJson, validationFailed } from './_lib/http.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return guard(res, async () => {
    noStore(res)

    if (req.method === 'GET') {
      res.status(200).json({
        parameters: SIGNATURE_PARAMETERS,
        domains: SIGNATURE_DOMAIN,
        thresholds: { usableConfidence: USABLE_CONFIDENCE, provisionalCompleteness: PROVISIONAL_COMPLETENESS },
      })
      return
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])

    const parsed = await readJson<{
      mode?: string
      signatureId?: string
      subjectId?: string
      observations?: Record<string, ParameterObservation>
      signature?: unknown
    }>(req)
    if (!parsed.ok) return validationFailed(res, parsed.issues)

    const body = parsed.body

    if (body.mode === 'check') {
      const result = BehavioralSignature.safeParse(body.signature)
      if (!result.success)
        return validationFailed(res, result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
      const coherence = checkCoherence(result.data)
      res.status(coherence.ok ? 200 : 409).json({
        signature: result.data,
        completeness: completenessLabel(result.data),
        coherence,
      })
      return
    }

    if (body.mode !== 'derive')
      return validationFailed(res, ['mode must be "derive" or "check"'])

    if (!body.signatureId) return validationFailed(res, ['signatureId is required'])
    if (!body.subjectId) return validationFailed(res, ['subjectId is required'])
    if (!body.observations || typeof body.observations !== 'object')
      return validationFailed(res, ['observations object is required'])

    const observations: Partial<Record<SignatureParameterName, ParameterObservation>> = {}
    const issues: string[] = []
    for (const [key, value] of Object.entries(body.observations)) {
      if (!SIGNATURE_PARAMETERS.includes(key as SignatureParameterName)) {
        issues.push(`unknown parameter "${key}"`)
        continue
      }
      const obs = value as Partial<ParameterObservation>
      if (typeof obs.value !== 'string') issues.push(`${key}.value must be a string`)
      else if (typeof obs.confidence !== 'number') issues.push(`${key}.confidence must be a number`)
      else if (typeof obs.evidence !== 'string' || obs.evidence.length === 0)
        issues.push(`${key}.evidence is required; a parameter without provenance is not measured`)
      else
        observations[key as SignatureParameterName] = obs as ParameterObservation
    }
    if (issues.length > 0) return validationFailed(res, issues)

    const result = deriveSignature({
      signatureId: body.signatureId,
      subjectId: body.subjectId,
      observations,
    })

    res.status(200).json({
      signature: result.signature,
      completeness: completenessLabel(result.signature),
      usable: result.usable,
      unmeasured: result.unmeasured,
      rejected: result.rejected,
      coherence: checkCoherence(result.signature),
    })
  })
}
