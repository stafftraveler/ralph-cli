import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef } from "react";
import { type UseClaudeState, useClaude } from "../hooks/use-claude.js";
import { formatCost, formatDuration } from "../lib/utils.js";
import type { IterationResult, RalphConfig } from "../types.js";

/**
 * Props for the IterationRunner component
 */
export interface IterationRunnerProps {
  /** Configuration loaded from .ralph/config */
  config: RalphConfig;
  /** Path to .ralph directory */
  ralphDir: string;
  /** Prompt to send to Claude */
  prompt: string;
  /** Current iteration number (1-based) */
  iteration: number;
  /** Total number of iterations planned */
  totalIterations: number;
  /** Called when iteration completes */
  onComplete: (result: IterationResult) => void;
  /** Enable verbose output */
  verbose?: boolean;
  /** Enable debug mode */
  debug?: boolean;
  /** Cumulative session cost so far in USD */
  sessionCostSoFar?: number;
}

/**
 * Status display showing current action from <status> tags
 */
function StatusDisplay({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Text color="gray" italic>
        Waiting for status...
      </Text>
    );
  }

  // Truncate long status messages
  const maxLength = 60;
  const displayStatus = status.length > maxLength ? `${status.slice(0, maxLength)}...` : status;

  return <Text color="cyan">{displayStatus}</Text>;
}

/**
 * Props for UsageDisplay component
 */
interface UsageDisplayProps {
  state: UseClaudeState;
  sessionCostSoFar?: number;
  warnCostThreshold?: number;
}

/**
 * Cost and usage display with optional session total and warning
 */
function UsageDisplay({ state, sessionCostSoFar, warnCostThreshold }: UsageDisplayProps) {
  const { usage } = state;

  if (!usage) {
    return null;
  }

  const iterationCost = usage.totalCostUsd ?? 0;
  const sessionTotal = (sessionCostSoFar ?? 0) + iterationCost;
  const isApproachingThreshold =
    warnCostThreshold !== undefined && sessionTotal >= warnCostThreshold * 0.8;
  const hasExceededThreshold = warnCostThreshold !== undefined && sessionTotal >= warnCostThreshold;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">
        Tokens: {usage.inputTokens.toLocaleString()} in / {usage.outputTokens.toLocaleString()} out
        {usage.totalCostUsd !== undefined && <Text> · Cost: {formatCost(usage.totalCostUsd)}</Text>}
      </Text>
      {sessionCostSoFar !== undefined && sessionCostSoFar > 0 && (
        <Text color="gray">
          Session total: {formatCost(sessionTotal)}
          {warnCostThreshold !== undefined && <Text> / {formatCost(warnCostThreshold)} limit</Text>}
        </Text>
      )}
      {hasExceededThreshold && (
        <Text color="red" bold>
          ⚠ Cost threshold exceeded!
        </Text>
      )}
      {isApproachingThreshold && !hasExceededThreshold && (
        <Text color="yellow">
          ⚠ Approaching cost threshold ({Math.round((sessionTotal / warnCostThreshold) * 100)}%)
        </Text>
      )}
    </Box>
  );
}

/**
 * IterationRunner component
 *
 * Displays iteration progress with:
 * - Spinner and "Iteration X of Y" header
 * - Elapsed time updating every second
 * - Current status from <status> tags
 * - Estimated cost from <usage> tags
 */
export function IterationRunner({
  config,
  ralphDir,
  prompt,
  iteration,
  totalIterations,
  onComplete,
  verbose,
  debug,
  sessionCostSoFar,
}: IterationRunnerProps) {
  const [state, actions] = useClaude();
  const { isRunning, currentStatus, elapsedSeconds } = state;
  const hasStartedRef = useRef(false);
  const lastIterationRef = useRef(iteration);

  // Reset hasStartedRef when iteration number changes
  if (lastIterationRef.current !== iteration) {
    hasStartedRef.current = false;
    lastIterationRef.current = iteration;
  }

  // Start iteration on mount or when iteration changes
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    void actions
      .runIteration(config, {
        ralphDir,
        prompt,
        iteration,
        verbose,
        debug,
        sessionCostSoFar,
      })
      .then((result) => {
        onComplete(result);
      });
  }, [actions, config, ralphDir, prompt, iteration, verbose, debug, onComplete, sessionCostSoFar]);

  // Show completion state briefly before parent handles transition
  if (!isRunning && hasStartedRef.current) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box>
          <Text color="green">✓ </Text>
          <Text bold>
            Iteration {iteration} of {totalIterations}
          </Text>
          <Text color="gray"> · {formatDuration(elapsedSeconds)}</Text>
        </Box>
        <Box marginLeft={2} marginTop={1}>
          <Text color="green">Completed</Text>
        </Box>
        <UsageDisplay
          state={state}
          sessionCostSoFar={sessionCostSoFar}
          warnCostThreshold={config.warnCostThreshold}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> </Text>
        <Text bold>
          Iteration {iteration} of {totalIterations}
        </Text>
        <Text color="gray"> · {formatDuration(elapsedSeconds)}</Text>
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <StatusDisplay status={currentStatus} />
      </Box>
      <UsageDisplay
        state={state}
        sessionCostSoFar={sessionCostSoFar}
        warnCostThreshold={config.warnCostThreshold}
      />
      {debug && state.statusHistory.length > 0 && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color="gray" dimColor>
            Status history:
          </Text>
          {state.statusHistory.slice(-5).map((s, i) => (
            <Text key={`status-${i}-${s.slice(0, 20)}`} color="gray" dimColor>
              · {s}
            </Text>
          ))}
        </Box>
      )}
      {verbose && state.output && <VerboseOutput output={state.output} />}
    </Box>
  );
}

/**
 * Maximum number of lines to display in verbose output
 */
const VERBOSE_MAX_LINES = 20;

/**
 * Verbose output display showing the last N lines of Claude's response
 */
function VerboseOutput({ output }: { output: string }) {
  // Split into lines and take the last N
  const lines = output.split("\n");
  const displayLines = lines.length > VERBOSE_MAX_LINES ? lines.slice(-VERBOSE_MAX_LINES) : lines;
  const truncated = lines.length > VERBOSE_MAX_LINES;

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Text color="gray" dimColor>
        Claude output:{truncated && ` (last ${VERBOSE_MAX_LINES} lines)`}
      </Text>
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        {displayLines.map((line, i) => (
          <Text key={`output-${i}-${line.slice(0, 10)}`} color="white" dimColor>
            {line || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
