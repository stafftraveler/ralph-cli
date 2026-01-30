import { useCallback, useRef, useState } from "react";
import { type ClaudeRunResult, runClaude } from "../lib/claude.js";
import { appendOutput } from "../lib/webserver.js";
import type { IterationResult, RalphConfig, UsageInfo } from "../types.js";

/**
 * State exposed by the useClaude hook
 */
export interface UseClaudeState {
  /** Whether an iteration is currently running */
  isRunning: boolean;
  /** Current status/tool being used */
  currentStatus: string | null;
  /** Elapsed time in seconds */
  elapsedSeconds: number;
  /** Token usage info if available */
  usage: UsageInfo | null;
  /** Full output collected so far */
  output: string;
  /** All status messages seen */
  statusHistory: string[];
  /** SDK session ID for resuming */
  sessionId: string | null;
}

/**
 * Actions returned by the useClaude hook
 */
interface UseClaudeActions {
  /** Run a single Claude iteration */
  runIteration: (config: RalphConfig, options: RunIterationOptions) => Promise<IterationResult>;
  /** Cancel the current iteration */
  cancel: () => void;
  /** Reset state between iterations */
  reset: () => void;
}

/**
 * Options for running a single iteration
 */
interface RunIterationOptions {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Prompt to send to Claude */
  prompt: string;
  /** Iteration number (1-based) */
  iteration: number;
  /** Enable verbose output */
  verbose?: boolean;
  /** Enable debug mode */
  debug?: boolean;
  /** SDK session ID to resume (optional) */
  resumeSessionId?: string;
  /** Cumulative session cost so far in USD (for limit checking) */
  sessionCostSoFar?: number;
}

/**
 * Hook for running Claude iterations with real-time status tracking
 *
 * Uses the Claude Agent SDK for:
 * - Real-time status updates via tool use events
 * - Accurate token usage and cost tracking
 * - Session management for resume functionality
 * - Elapsed time tracking
 * - Cancellation support
 *
 * @returns Tuple of [state, actions]
 */
export function useClaude(): [UseClaudeState, UseClaudeActions] {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [output, setOutput] = useState("");
  const [statusHistory, setStatusHistory] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  /**
   * Resets all state for a new iteration
   */
  const reset = useCallback(() => {
    setIsRunning(false);
    setCurrentStatus(null);
    setElapsedSeconds(0);
    setUsage(null);
    setOutput("");
    setStatusHistory([]);
    // Don't reset sessionId - keep it for potential resume
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    abortControllerRef.current = null;
  }, []);

  /**
   * Cancels the current iteration
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  /**
   * Runs a single Claude iteration using the Agent SDK
   */
  const runIteration = useCallback(
    async (config: RalphConfig, options: RunIterationOptions): Promise<IterationResult> => {
      // Reset state but keep sessionId for continuity
      const previousSessionId = sessionId;
      reset();
      setIsRunning(true);

      // Setup abort controller
      abortControllerRef.current = new AbortController();

      // Start elapsed time tracking
      startTimeRef.current = Date.now();
      const startedAt = new Date().toISOString();

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);

      let collectedOutput = "";
      const seenStatuses = new Set<string>();

      // Callback to process streamed text output
      const handleStdout = (chunk: string) => {
        collectedOutput += chunk;
        setOutput(collectedOutput);
        // Also append to web server buffer for remote monitoring
        appendOutput(chunk);
      };

      // Callback for status/tool updates from SDK
      const handleStatus = (status: string) => {
        if (!seenStatuses.has(status)) {
          seenStatuses.add(status);
          setCurrentStatus(status);
          setStatusHistory((prev) => [...prev, status]);
        }
      };

      let result: ClaudeRunResult;
      try {
        result = await runClaude(config, {
          ralphDir: options.ralphDir,
          prompt: options.prompt,
          verbose: options.verbose,
          debug: options.debug,
          signal: abortControllerRef.current.signal,
          onStdout: handleStdout,
          onStatus: handleStatus,
          resumeSessionId: options.resumeSessionId ?? previousSessionId ?? undefined,
        });
      } catch (error) {
        // Cancelled or failed - log error details in debug mode
        if (process.env.DEBUG) {
          console.error("[use-claude] Iteration failed:", error);
          if (error instanceof Error) {
            console.error("[use-claude] Error name:", error.name);
            console.error("[use-claude] Error message:", error.message);
            if (error.stack) {
              console.error("[use-claude] Stack trace:", error.stack);
            }
          }
        }

        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsRunning(false);

        const completedAt = new Date().toISOString();
        const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);

        // Determine if this was a cancellation or actual failure
        const isCancelled =
          error instanceof Error &&
          (error.name === "AbortError" || error.message.includes("aborted"));
        const status = isCancelled ? "Cancelled" : "Failed";

        return {
          iteration: options.iteration,
          startedAt,
          completedAt,
          durationSeconds,
          success: false,
          output: collectedOutput,
          status,
          prdComplete: false,
        };
      }

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const completedAt = new Date().toISOString();
      const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);

      // Store session ID for potential resume
      if (result.sessionId) {
        setSessionId(result.sessionId);
      }

      // Update usage from SDK result
      if (result.usage) {
        setUsage(result.usage);
      }

      // Get final status
      const lastStatus =
        statusHistory.length > 0 ? statusHistory[statusHistory.length - 1] : undefined;

      setIsRunning(false);

      // Check cost limits
      const iterationCost = result.usage?.totalCostUsd ?? 0;
      const sessionCostSoFar = options.sessionCostSoFar ?? 0;
      const newSessionTotal = sessionCostSoFar + iterationCost;

      let costLimitExceeded = false;
      let costLimitReason: "iteration" | "session" | undefined;

      // Check per-iteration limit
      if (config.maxCostPerIteration !== undefined && iterationCost > config.maxCostPerIteration) {
        costLimitExceeded = true;
        costLimitReason = "iteration";
      }

      // Check session limit
      if (config.maxCostPerSession !== undefined && newSessionTotal > config.maxCostPerSession) {
        costLimitExceeded = true;
        costLimitReason = "session";
      }

      return {
        iteration: options.iteration,
        startedAt,
        completedAt,
        durationSeconds,
        success: result.success,
        output: result.output,
        status: lastStatus,
        usage: result.usage,
        prdComplete: result.prdComplete,
        costLimitExceeded,
        costLimitReason,
      };
    },
    [reset, sessionId, statusHistory],
  );

  const state: UseClaudeState = {
    isRunning,
    currentStatus,
    elapsedSeconds,
    usage,
    output,
    statusHistory,
    sessionId,
  };

  const actions: UseClaudeActions = {
    runIteration,
    cancel,
    reset,
  };

  return [state, actions];
}
