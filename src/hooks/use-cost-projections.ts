import type { IterationResult, UsageInfo } from "../types.js";

/**
 * Cost projection calculation result
 */
export interface CostProjection {
  /** Iteration cost in USD */
  iterationCost: number;
  /** Session total cost in USD */
  sessionTotal: number;
  /** Average cost per iteration in USD */
  avgCostPerIteration?: number;
  /** Projected total cost for all iterations in USD */
  projectedTotalCost?: number;
  /** Projected remaining cost in USD */
  projectedRemainingCost?: number;
  /** Whether projection would exceed limit */
  projectionWouldExceedLimit: boolean;
  /** Whether session total is approaching limit (80%+) */
  isApproachingLimit: boolean;
  /** Whether session total has exceeded limit */
  hasExceededLimit: boolean;
}

/**
 * Options for cost projection calculation
 */
export interface CostProjectionOptions {
  /** Current usage from iteration */
  usage: UsageInfo | null;
  /** Cumulative session cost so far in USD */
  sessionCostSoFar?: number;
  /** Maximum cost per session in USD */
  maxCostPerSession?: number;
  /** Current iteration number (1-based) */
  currentIteration: number;
  /** Total number of iterations planned */
  totalIterations: number;
  /** Previous iterations for cost projection */
  previousIterations?: IterationResult[];
}

/**
 * Calculate cost projections based on current usage and previous iterations
 *
 * @param options - Cost projection options
 * @returns Cost projection result with warnings
 */
export function useCostProjections(options: CostProjectionOptions): CostProjection | null {
  const {
    usage,
    sessionCostSoFar,
    maxCostPerSession,
    currentIteration,
    totalIterations,
    previousIterations,
  } = options;

  if (!usage) {
    return null;
  }

  const iterationCost = usage.totalCostUsd ?? 0;
  const sessionTotal = (sessionCostSoFar ?? 0) + iterationCost;

  // Calculate 80% threshold from maxCostPerSession
  const warnThreshold = maxCostPerSession !== undefined ? maxCostPerSession * 0.8 : undefined;
  const isApproachingLimit = warnThreshold !== undefined && sessionTotal >= warnThreshold;
  const hasExceededLimit = maxCostPerSession !== undefined && sessionTotal >= maxCostPerSession;

  // Calculate cost projection
  let avgCostPerIteration: number | undefined;
  let projectedTotalCost: number | undefined;
  let projectedRemainingCost: number | undefined;
  let projectionWouldExceedLimit = false;

  if (previousIterations && previousIterations.length > 0) {
    // Calculate average cost from completed iterations
    const costsFromPrevious = previousIterations
      .map((iter) => iter.usage?.totalCostUsd ?? 0)
      .filter((cost) => cost > 0);

    if (costsFromPrevious.length > 0) {
      avgCostPerIteration =
        costsFromPrevious.reduce((sum, cost) => sum + cost, 0) / costsFromPrevious.length;

      // Project total cost for all iterations
      const remainingIterations = totalIterations - currentIteration;
      projectedRemainingCost = avgCostPerIteration * remainingIterations;
      projectedTotalCost = sessionTotal + projectedRemainingCost;

      // Check if projection would exceed limit
      if (
        maxCostPerSession !== undefined &&
        projectedTotalCost !== undefined &&
        projectedTotalCost > maxCostPerSession
      ) {
        projectionWouldExceedLimit = true;
      }
    }
  }

  return {
    iterationCost,
    sessionTotal,
    avgCostPerIteration,
    projectedTotalCost,
    projectedRemainingCost,
    projectionWouldExceedLimit,
    isApproachingLimit,
    hasExceededLimit,
  };
}
