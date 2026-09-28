/**
 * Runtime configuration, read from the Vercel environment.
 *
 * This is the single answer to "configurable through Vercel": every knob is an
 * environment variable, and `publicConfig()` is the only shape the browser is
 * ever shown. Secrets are never included in it.
 *
 * The defaults are deliberately conservative. A deployment that has configured
 * nothing gets a harness that refuses more than it permits, because a refusal
 * is recoverable and a silent allow is not.
 */

export interface PublicConfig {
  soulbotVersion: string
  /** Human-readable deployment name, for the console header. */
  deploymentName: string
  environment: 'development' | 'preview' | 'production'
  /** True when a durable store is attached. False means ephemeral in-memory state. */
  persistence: 'durable' | 'ephemeral'
  /** Default per-flow ceilings applied when a flow does not declare its own. */
  defaults: { maxTokens: number; maxCostUsd: number }
  /** Whether the browser node may be addressed. Always false on serverless. */
  browserNodeAvailable: false
  /** Sentinel vault mode. Serverless never holds a secret. */
  vaultMode: 'reference_only'
  /** Rate limit ceiling, requests per window, per client. */
  rateLimit: { requests: number; windowMs: number }
  /** Conformance tiers that can run in this runtime. */
  conformanceTiers: string[]
  /** Non-secret operational notes surfaced in the console. */
  notes: string[]
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function str(name: string, fallback: string): string {
  const raw = process.env[name]
  return raw && raw.length > 0 ? raw : fallback
}

export function isDurableStoreConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export function publicConfig(): PublicConfig {
  const vercelEnv = str('VERCEL_ENV', 'development')
  const environment: PublicConfig['environment'] =
    vercelEnv === 'production' ? 'production' : vercelEnv === 'preview' ? 'preview' : 'development'

  const durable = isDurableStoreConfigured()

  const notes: string[] = []
  if (!durable)
    notes.push(
      'No durable store attached. Traces and consent state are held in memory and reset when the runtime recycles. Attach Vercel KV (or any Redis-compatible REST store) for a persistent deployment.',
    )
  notes.push(
    'The browser node is never hosted here. CDP execution, Chromium, and the credential vault run on the subject-controlled machine; this deployment serves the trust and resilience core only.',
  )

  return {
    soulbotVersion: str('SOULBOT_VERSION', '3.0.0'),
    deploymentName: str('VERCEL_URL', 'localhost'),
    environment,
    persistence: durable ? 'durable' : 'ephemeral',
    defaults: {
      maxTokens: num('SOULBOT_DEFAULT_MAX_TOKENS', 500_000),
      maxCostUsd: num('SOULBOT_DEFAULT_MAX_COST_USD', 0.5),
    },
    browserNodeAvailable: false,
    vaultMode: 'reference_only',
    rateLimit: {
      requests: num('SOULBOT_RATE_LIMIT_REQUESTS', 120),
      windowMs: num('SOULBOT_RATE_LIMIT_WINDOW_MS', 60_000),
    },
    conformanceTiers: str('SOULBOT_CONFORMANCE_TIERS', 'T2,T3,T4,T5,T6')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    notes,
  }
}

/** Server-only secret presence flags. Never sent to the browser. */
export function secretConfig(): Record<string, boolean> {
  return {
    KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
    KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
    SENTINEL_SIGNING_KEY: Boolean(process.env.SENTINEL_SIGNING_KEY),
  }
}
