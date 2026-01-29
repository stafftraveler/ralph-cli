import { Box, Text } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { IterationRunner } from "../components/IterationRunner.js";
import { KeyboardShortcuts } from "../components/KeyboardShortcuts.js";
import { runAfterIteration, runBeforeIteration } from "../lib/plugins.js";
import { addIterationResult, saveCheckpoint } from "../lib/session.js";
import type {
  IterationContext,
  IterationResult,
  PluginContext,
  RalphConfig,
  RalphPlugin,
  SessionState,
} from "../types.js";

/**
 * Props for the IterationLoop component
 */
export interface IterationLoopProps {
  /** Ralph configuration */
  config: RalphConfig;
  /** Path to .ralph directory */
  ralphDir: string;
  /** Prompt to send to Claude */
  prompt: string;
  /** Current session state */
  session: SessionState;
  /** Loaded plugins */
  plugins: RalphPlugin[];
  /** Repository root path */
  repoRoot: string;
  /** Current branch name */
  branch: string;
  /** Starting iteration number (for resume) */
  startIteration: number;
  /** Total iterations to run */
  totalIterations: number;
  /** Verbose mode enabled */
  verbose: boolean;
  /** Debug mode enabled */
  debug: boolean;
  /** Dry run mode (no actual execution) */
  dryRun: boolean;
  /** Called when session is updated */
  onSessionUpdate: (session: SessionState) => void;
  /** Called when all iterations complete */
  onComplete: (prdComplete: boolean) => void;
  /** Called when an error occurs that can't be retried */
  onError: (error: string) => void;
  /** Called when iteration fails but can be retried */
  onRetryExhausted?: (iteration: number, attempts: number) => void;
  /** Called when cost limit is exceeded */
  onCostLimitExceeded?: (
    reason: "iteration" | "session",
    cost: number,
    limit: number,
  ) => void;
}

/**
 * IterationLoop component
 *
 * Manages the iteration loop, including:
 * - Running iterations via IterationRunner
 * - Plugin lifecycle hooks (beforeIteration, afterIteration)
 * - Retry logic with exponential backoff
 * - Session checkpointing
 * - PRD completion detection
 */
export function IterationLoop({
  config,
  ralphDir,
  prompt,
  session,
  plugins,
  repoRoot,
  branch,
  startIteration,
  totalIterations,
  verbose,
  debug,
  dryRun,
  onSessionUpdate,
  onComplete,
  onError,
  onRetryExhausted,
  onCostLimitExceeded,
}: IterationLoopProps) {
  const [currentIteration, setCurrentIteration] = useState(startIteration);
  const [retryCount, setRetryCount] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [sessionCostSoFar, setSessionCostSoFar] = useState(
    session.totalCostUsd ?? 0,
  );
  const sessionRef = useRef(session);

  // Keep session ref in sync
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * Build plugin context for hooks
   */
  const getPluginContext = useCallback((): PluginContext => {
    return {
      config,
      session: sessionRef.current,
      repoRoot,
      branch,
      verbose,
      dryRun,
    };
  }, [config, repoRoot, branch, verbose, dryRun]);

  /**
   * Build iteration context for hooks
   */
  const getIterationContext = useCallback(
    (result?: IterationResult): IterationContext => {
      return {
        ...getPluginContext(),
        iteration: currentIteration,
        totalIterations,
        result,
      };
    },
    [getPluginContext, currentIteration, totalIterations],
  );

  /**
   * Handle iteration completion
   */
  const handleIterationComplete = useCallback(
    async (result: IterationResult) => {
      const currentSession = sessionRef.current;

      // Update session cost tracking
      const iterationCost = result.usage?.totalCostUsd ?? 0;
      const newSessionCost = sessionCostSoFar + iterationCost;
      setSessionCostSoFar(newSessionCost);

      // Add result to session
      const updatedSession = await addIterationResult(
        ralphDir,
        currentSession,
        result,
      );
      // Also update totalCostUsd on session
      updatedSession.totalCostUsd = newSessionCost;
      sessionRef.current = updatedSession;
      onSessionUpdate(updatedSession);

      // Save checkpoint
      await saveCheckpoint(ralphDir, updatedSession, result.iteration);

      // Run afterIteration plugin hook
      await runAfterIteration(plugins, getIterationContext(result));

      // Check for cost limit exceeded
      if (result.costLimitExceeded && result.costLimitReason) {
        setIsRunning(false);
        const limit =
          result.costLimitReason === "iteration"
            ? config.maxCostPerIteration
            : config.maxCostPerSession;
        const cost =
          result.costLimitReason === "iteration"
            ? iterationCost
            : newSessionCost;
        onCostLimitExceeded?.(result.costLimitReason, cost, limit ?? 0);
        onError(
          result.costLimitReason === "iteration"
            ? `Cost limit exceeded: iteration cost $${iterationCost.toFixed(4)} exceeds limit of $${config.maxCostPerIteration?.toFixed(2)}`
            : `Cost limit exceeded: session total $${newSessionCost.toFixed(4)} exceeds limit of $${config.maxCostPerSession?.toFixed(2)}`,
        );
        return;
      }

      // Check for PRD complete
      if (result.prdComplete) {
        setIsRunning(false);
        onComplete(true);
        return;
      }

      // Check if we've reached total iterations
      if (result.iteration >= totalIterations) {
        setIsRunning(false);
        onComplete(false);
        return;
      }

      // Handle retry on failure
      if (!result.success) {
        const maxRetries = config.maxRetries ?? 3;
        if (retryCount < maxRetries) {
          setRetryCount((prev) => prev + 1);
          // Stay on same iteration for retry
          return;
        }
        setIsRunning(false);
        onRetryExhausted?.(result.iteration, maxRetries);
        onError(
          `Iteration ${result.iteration} failed after ${maxRetries} retries.`,
        );
        return;
      }

      // Reset retry count on success
      setRetryCount(0);

      // Move to next iteration
      setCurrentIteration((prev) => prev + 1);
    },
    [
      ralphDir,
      plugins,
      getIterationContext,
      totalIterations,
      config.maxRetries,
      config.maxCostPerIteration,
      config.maxCostPerSession,
      retryCount,
      sessionCostSoFar,
      onSessionUpdate,
      onComplete,
      onError,
      onRetryExhausted,
      onCostLimitExceeded,
    ],
  );

  /**
   * Run beforeIteration hook before starting each iteration
   */
  useEffect(() => {
    async function runBeforeIterationHook() {
      if (!isRunning) return;
      await runBeforeIteration(plugins, getIterationContext());
    }
    void runBeforeIterationHook();
  }, [plugins, getIterationContext, isRunning]);

  if (!isRunning) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <IterationRunner
        config={config}
        ralphDir={ralphDir}
        prompt={prompt}
        iteration={currentIteration}
        totalIterations={totalIterations}
        onComplete={handleIterationComplete}
        verbose={verbose}
        debug={debug}
        sessionCostSoFar={sessionCostSoFar}
      />
      {retryCount > 0 && (
        <Box marginTop={1}>
          <Text color="yellow">
            Retry attempt {retryCount} of {config.maxRetries ?? 3}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        <KeyboardShortcuts verbose={verbose} debug={debug} />
      </Box>
    </Box>
  );
}

