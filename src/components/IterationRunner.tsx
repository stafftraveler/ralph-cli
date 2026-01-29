import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef } from "react";
import { type UseClaudeState, useClaude } from "../hooks/use-claude.js";
import { formatDuration } from "../lib/utils.js";
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
  /** Called when user cancels */
  onCancel?: () => void;
  /** Enable verbose output */
  verbose?: boolean;
  /** Enable debug mode */
  debug?: boolean;
}

/**
 * Format cost as dollars with 4 decimal places
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
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
  const displayStatus =
    status.length > maxLength ? `${status.slice(0, maxLength)}...` : status;

  return <Text color="cyan">{displayStatus}</Text>;
}

/**
 * Cost and usage display
 */
function UsageDisplay({ state }: { state: UseClaudeState }) {
  const { usage } = state;

  if (!usage) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text color="gray">
        Tokens: {usage.inputTokens.toLocaleString()} in /{" "}
        {usage.outputTokens.toLocaleString()} out
        {usage.totalCostUsd !== undefined && (
          <Text> · Cost: {formatCost(usage.totalCostUsd)}</Text>
        )}
      </Text>
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
  onCancel: _onCancel,
  verbose,
  debug,
}: IterationRunnerProps) {
  const [state, actions] = useClaude();
  const { isRunning, currentStatus, elapsedSeconds } = state;
  const hasStartedRef = useRef(false);

  // Start iteration on mount
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
      })
      .then((result) => {
        onComplete(result);
      });
  }, [
    actions,
    config,
    ralphDir,
    prompt,
    iteration,
    verbose,
    debug,
    onComplete,
  ]);

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
        <UsageDisplay state={state} />
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
      <UsageDisplay state={state} />
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
    </Box>
  );
}

/**
 * Compact iteration status for summary views
 */
export function IterationSummary({ result }: { result: IterationResult }) {
  const statusIcon = result.success ? "✓" : "✗";
  const statusColor = result.success ? "green" : "red";

  return (
    <Box>
      <Text color={statusColor}>{statusIcon} </Text>
      <Text>Iteration {result.iteration}</Text>
      <Text color="gray"> · {formatDuration(result.durationSeconds)}</Text>
      {result.usage?.totalCostUsd !== undefined && (
        <Text color="gray"> · {formatCost(result.usage.totalCostUsd)}</Text>
      )}
      {result.prdComplete && <Text color="green"> · PRD Complete</Text>}
    </Box>
  );
}
