/**
 * Conformance CLI.
 *
 *   npm run conformance
 *   npm run conformance -- --tiers T2,T3 --recipes examples/recipes.json
 *
 * Runs the tiers that can run in this runtime and reports the rest as skipped.
 * Exits non-zero when a blocking tier fails, so it is usable as a gate in CI.
 *
 * T0 and T1 are build-pipeline tiers: they are covered by `npm run typecheck`
 * and `npm run lint`, and this script says so rather than pretending to run
 * them.
 */

import { readFile } from 'node:fs/promises'
import { runConformance, TIER_ORDER, type ConformanceInput, type TierId } from '../src/core/index.js'

interface Args {
  tiers: TierId[]
  recipes: string | null
  flows: string | null
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : null
  }
  const tierArg = get('--tiers')
  const tiers = tierArg
    ? tierArg
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter((t): t is TierId => TIER_ORDER.includes(t as TierId))
    : ([...TIER_ORDER] as TierId[])

  return { tiers, recipes: get('--recipes'), flows: get('--flows'), json: argv.includes('--json') }
}

async function loadJson(path: string | null, label: string): Promise<unknown[]> {
  if (!path) return []
  const raw = await readFile(path, 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`${label}: ${path} must contain a JSON array.`)
  }
  return parsed
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const input: ConformanceInput = {
    availableTiers: args.tiers,
    recipes: await loadJson(args.recipes, 'recipes'),
    flows: await loadJson(args.flows, 'flows'),
  }

  const report = await runConformance(input)

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    for (const tier of report.tiers) {
      const mark = tier.status === 'pass' ? '✓' : tier.status === 'fail' ? '✗' : '–'
      console.log(`${mark} ${tier.tier}  ${tier.name}`)
      console.log(`    ${tier.message}`)
      for (const check of tier.checks) {
        if (!check.ok) console.log(`      ✗ ${check.name}: ${check.detail}`)
      }
    }
    console.log('')
    console.log(
      `${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped — ${report.message}`,
    )
    if (report.skipped > 0) {
      console.log('A skipped tier did not pass. Run `npm run typecheck` and `npm run lint` for T0/T1.')
    }
  }

  process.exit(report.ok ? 0 : 1)
}

main().catch((err: unknown) => {
  console.error(`conformance failed to run: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
})
