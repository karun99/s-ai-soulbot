/**
 * HTTP helpers shared by every function: method guarding, body parsing with
 * size limits, uniform error envelopes, and a fixed-window rate limiter.
 *
 * The error envelope is deliberate. A guardrail refusal must be reported in a
 * shape the UI can render without guessing, and a validation failure must be
 * distinguishable from an authorization failure — those mean different things
 * to a subject and must not be collapsed into one 500.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface ApiError {
  error: string
  /** Machine-readable discriminator. The UI branches on this, not on prose. */
  code:
    | 'bad_request'
    | 'validation_failed'
    | 'unauthorized'
    | 'forbidden'
    | 'rate_limited'
    | 'not_found'
    | 'method_not_allowed'
    | 'internal_error'
  details?: unknown
}

const MAX_BODY_BYTES = 256 * 1024

export function sendError(res: VercelResponse, status: number, error: ApiError): void {
  res.status(status).json(error)
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '))
  sendError(res, 405, { error: 'method_not_allowed', code: 'method_not_allowed', details: { allowed } })
}

export function badRequest(res: VercelResponse, error: string, details?: unknown): void {
  sendError(res, 400, { error, code: 'bad_request', details })
}

export function validationFailed(res: VercelResponse, issues: string[]): void {
  sendError(res, 422, { error: 'validation_failed', code: 'validation_failed', details: issues })
}

export async function readJson<T = unknown>(req: VercelRequest): Promise<{ ok: true; body: T } | { ok: false; issues: string[] }> {
  const raw = req.body
  if (raw === undefined || raw === null || raw === '') return { ok: true, body: {} as T }

  if (typeof raw === 'object') return { ok: true, body: raw as T }

  const text = String(raw)
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, issues: [`body exceeds ${MAX_BODY_BYTES} bytes`] }
  }
  try {
    return { ok: true, body: JSON.parse(text) as T }
  } catch {
    return { ok: false, issues: ['body is not valid JSON'] }
  }
}

/* -------------------------------------------------------------------------- */
/* Rate limiting (STRIDE D-001)                                                */
/* -------------------------------------------------------------------------- */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  limit: number
}

/**
 * Fixed-window limiter.
 *
 * In-memory, so it is per-instance and resets on a cold start. That is a real
 * limitation of serverless deployment and is documented as such rather than
 * dressed up as a distributed limiter.
 */
export function rateLimit(
  req: VercelRequest,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const key =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    (req.headers['x-real-ip'] as string | undefined) ??
    'local'

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs, limit }
  }

  bucket.count += 1
  const allowed = bucket.count <= limit
  return { allowed, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt, limit }
}

export function applyRateLimit(res: VercelResponse, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', String(result.limit))
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))
}

/** Wrap a handler so an unexpected throw becomes a 500 with no internal detail. */
export async function guard(
  res: VercelResponse,
  handler: () => Promise<void>,
): Promise<void> {
  try {
    await handler()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    /* Log the detail server-side, return a stable shape to the client. */
    console.error('[soulbot] unhandled error:', message)
    if (!res.headersSent) {
      sendError(res, 500, { error: 'internal_error', code: 'internal_error' })
    }
  }
}

/** No-store, so a consent decision is never cached by an intermediary. */
export function noStore(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
}
