/**
 * Store adapter.
 *
 * Vercel functions have no durable filesystem, so the harness needs a store
 * abstraction with two implementations:
 *
 *   MemoryStore   — process-local, ephemeral. The default. Honest about it.
 *   RestKvStore   — any Redis-compatible REST store (Vercel KV, Upstash,
 *                   Memorystore). Speaks plain HTTP via fetch, so it adds no
 *                   dependency and no SDK to the bundle.
 *
 * The interface is intentionally small. It is not a database client; it is an
 * append-mostly key/value surface for traces, consent snapshots, and personas.
 *
 * Note on durability and honesty: append-only semantics are enforced by the
 * ActionTrace hash chain (see `core/trace`), not by this store. The chain is
 * what makes a truncated or rewritten store detectable, which is why the
 * ephemeral default does not silently weaken the audit guarantee — it weakens
 * the *availability* of history, and says so.
 */

import { createHash } from 'node:crypto'

export interface StoreRecord {
  key: string
  value: unknown
  updatedAt: string
}

export interface Store {
  readonly kind: 'memory' | 'rest-kv'
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** Keys under a prefix, newest first. */
  list(prefix: string, limit?: number): Promise<string[]>
  append(key: string, value: unknown): Promise<number>
  read<T = unknown>(key: string, limit?: number): Promise<T[]>
}

const memory = new Map<string, unknown>()

export const memoryStore: Store = {
  kind: 'memory',
  async get<T>(key: string): Promise<T | null> {
    return (memory.get(key) as T | undefined) ?? null
  },
  async set(key: string, value: unknown) {
    memory.set(key, value)
  },
  async delete(key: string) {
    memory.delete(key)
  },
  async list(prefix: string, limit = 100) {
    return [...memory.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit)
  },
  async append(key: string, value: unknown) {
    const existing = memory.get(key)
    const list = Array.isArray(existing) ? (existing as unknown[]) : []
    list.push(value)
    memory.set(key, list)
    return list.length
  },
  async read<T>(key: string, limit = 100) {
    const existing = memory.get(key)
    if (!Array.isArray(existing)) return []
    return (existing as T[]).slice(-limit)
  },
}

/**
 * Redis-compatible REST store.
 *
 * Commands used: `GET`, `SET`, `DEL`, `LRANGE`, `RPUSH`, `LRANGE`. Available on
 * Upstash, Vercel KV, and Memorystore's REST proxy.
 */
export function restKvStore(baseUrl: string, token: string, prefix = 'soulbot'): Store {
  const endpoint = baseUrl.replace(/\/+$/, '')
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const ns = (k: string) => `${prefix}:${k}`

  const command = async (parts: (string | number)[]): Promise<unknown> => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(parts),
    })
    if (!res.ok) throw new Error(`kv_error_${res.status}`)
    const body = (await res.json()) as { result?: unknown; error?: string }
    if (body.error) throw new Error(`kv_error: ${body.error}`)
    return body.result
  }

  return {
    kind: 'rest-kv',
    async get<T>(key: string) {
      const raw = await command(['GET', ns(key)])
      if (raw === null || raw === undefined) return null
      try {
        return JSON.parse(String(raw)) as T
      } catch {
        return null
      }
    },
    async set(key: string, value: unknown) {
      await command(['SET', ns(key), JSON.stringify(value)])
    },
    async delete(key: string) {
      await command(['DEL', ns(key)])
    },
    async list(keyPrefix: string, limit = 100) {
      /* Key enumeration is not universally supported over REST. The caller
         falls back to its own index; an empty list here is not an error. */
      void keyPrefix
      void limit
      return []
    },
    async append(key: string, value: unknown) {
      await command(['RPUSH', ns(key), JSON.stringify(value)])
      const len = await command(['LLEN', ns(key)])
      return typeof len === 'number' ? len : 0
    },
    async read<T>(key: string, limit = 100) {
      const raw = await command(['LRANGE', ns(key), -limit, -1])
      if (!Array.isArray(raw)) return []
      return raw
        .map((r) => {
          try {
            return JSON.parse(String(r)) as T
          } catch {
            return null
          }
        })
        .filter((r): r is T => r !== null)
    },
  }
}

let cached: Store | null = null

/** Resolve the store from the environment, once per runtime. */
export function store(): Store {
  if (cached) return cached
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  cached = url && token ? restKvStore(url, token) : memoryStore
  return cached
}

/** Stable key naming, so the UI and API agree without a shared schema. */
export const keys = {
  trace: (flowId: string) => `trace:${flowId}`,
  traceIndex: () => 'trace:index',
  consent: (subjectId: string) => `consent:${subjectId}`,
  consentAudit: (subjectId: string) => `consent-audit:${subjectId}`,
  persona: (personaId: string) => `persona:${personaId}`,
  signature: (subjectId: string) => `signature:${subjectId}`,
  recipe: (recipeId: string) => `recipe:${recipeId}`,
  conformance: () => 'conformance:last',
}

/** Deterministic idempotency key from a request body. */
export function fingerprint(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex').slice(0, 32)
}
