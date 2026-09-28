/**
 * Budget enforcement (STRIDE D-002).
 *
 * A budget is a hard ceiling, not an average. Once projected spend reaches the
 * ceiling the harness stops and escalates rather than reporting a near-miss as
 * a success.
 */

export interface Budget {
  maxTokens: number
  maxCostUsd: number
}

export interface Spend {
  tokens: number
  costUsd: number
}

export interface BudgetVerdict {
  ok: boolean
  /** Utilisation of the binding constraint, 0–1+. */
  utilisation: number
  bindingConstraint: 'tokens' | 'cost' | 'none'
  remaining: { tokens: number; costUsd: number }
  /** Spend that would breach the ceiling if incurred. */
  headroomTokens: number
  headroomCostUsd: number
  message: string
}

export function evaluateBudget(budget: Budget, spent: Spend): BudgetVerdict {
  const tokenUse = spent.tokens / budget.maxTokens
  const costUse = spent.costUsd / budget.maxCostUsd

  const bindingConstraint: BudgetVerdict['bindingConstraint'] =
    tokenUse >= costUse ? (tokenUse >= 1 ? 'tokens' : 'none') : costUse >= 1 ? 'cost' : 'none'

  const ok = spent.tokens < budget.maxTokens && spent.costUsd < budget.maxCostUsd
  const remaining = {
    tokens: Math.max(0, budget.maxTokens - spent.tokens),
    costUsd: Math.max(0, Number((budget.maxCostUsd - spent.costUsd).toFixed(6))),
  }

  return {
    ok,
    utilisation: Math.max(tokenUse, costUse),
    bindingConstraint,
    remaining,
    headroomTokens: remaining.tokens,
    headroomCostUsd: remaining.costUsd,
    message: ok
      ? `Within budget: ${(Math.max(tokenUse, costUse) * 100).toFixed(1)}% of binding ceiling consumed.`
      : `Budget exhausted (${bindingConstraint}): stop and escalate.`,
  }
}

/** True when admitting `delta` would breach the ceiling. */
export function wouldBreach(budget: Budget, spent: Spend, delta: Spend): boolean {
  return spent.tokens + delta.tokens > budget.maxTokens || spent.costUsd + delta.costUsd > budget.maxCostUsd
}
