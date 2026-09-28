/**
 * Credential vault (STRIDE I-001, FR-105, invariant IV-2).
 *
 * The harness never holds a secret. It holds a *reference* to a secret, and
 * the browser node performs just-in-time insertion at the point of use. The
 * `Vault` interface below is deliberately missing a `get`-style method that
 * returns a value to the caller: there is no such operation, so the invariant
 * cannot be violated by a caller that has this type.
 *
 * A real deployment backs `Vault` with an OS keychain, a hardware token, or a
 * remote secret manager reachable only from the browser node.
 */

export interface VaultRef {
  /** Opaque handle. Meaningless outside the vault. */
  ref: string
  /** Which account the secret belongs to, for audit only. Never the value. */
  accountHint: string
  /** Connector the secret authenticates against. */
  connector: string
}

export interface JustInTimeInsertion {
  ref: string
  /** Name of the field to populate, e.g. `password`. */
  field: string
  /** Expires after this many milliseconds. */
  ttlMs: number
  /** Never persisted, never logged. */
  ephemeral: true
}

/**
 * A vault that can mint insertion instructions and nothing else.
 *
 * The absence of a secret-returning method is the security control.
 */
export interface Vault {
  /** Register a secret. The value passes through and is not retained here. */
  register(input: { accountHint: string; connector: string; value: string }): Promise<VaultRef>
  /**
   * Mint a just-in-time insertion instruction for the browser node.
   * The returned object contains no secret material.
   */
  mintInsertion(ref: VaultRef, field: string, ttlMs?: number): Promise<JustInTimeInsertion>
  /** Whether a ref is still live. Does not reveal the value. */
  isLive(ref: VaultRef): Promise<boolean>
  /** Revoke a ref. The secret is destroyed, not archived. */
  revoke(ref: string): Promise<void>
}

export const DEFAULT_INSERTION_TTL_MS = 30_000

/**
 * In-memory vault for tests and local development.
 *
 * Note the closure: `values` is captured but there is no method that returns a
 * value. A caller can create this vault, mint insertions, and revoke refs; it
 * cannot read a secret back out through the interface.
 */
export function createMemoryVault(): Vault & { size: number } {
  const values = new Map<string, { value: string; live: boolean }>()
  let counter = 0

  return {
    async register({ accountHint, connector, value }) {
      counter += 1
      const ref = `vault:${counter.toString(36).padStart(4, '0')}`
      values.set(ref, { value, live: true })
      return { ref, accountHint, connector }
    },
    async mintInsertion(ref, field, ttlMs = DEFAULT_INSERTION_TTL_MS) {
      const entry = values.get(ref.ref)
      if (!entry?.live) throw new Error('vault_ref_not_live')
      return { ref: ref.ref, field, ttlMs, ephemeral: true }
    },
    async isLive(ref) {
      return values.get(ref.ref)?.live === true
    },
    async revoke(ref) {
      values.delete(ref)
    },
    get size() {
      return values.size
    },
  }
}

/** Redact anything that looks like a credential before it reaches a log or trace. */
const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
  /(?<=password=)[^\s&"']+/gi,
  /(?<=token=)[^\s&"']+/gi,
  /(?<=secret=)[^\s&"']+/gi,
]

export const REDACTION = '[redacted]'

export function redact(input: string): string {
  let out = input
  for (const p of SECRET_PATTERNS) out = out.replace(p, REDACTION)
  return out
}

/** Recursively redact a JSON-serialisable value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /token|secret|password|credential|api_?key|authorization/i.test(k)
        ? REDACTION
        : redactDeep(v)
    }
    return out as unknown as T
  }
  return value
}
