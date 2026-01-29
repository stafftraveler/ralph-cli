import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import { formatDuration } from "../lib/utils.js";
import type { CommitInfo, DiffStat, SessionSummary } from "../types.js";
import { DiffPreview } from "./DiffPreview.js";

/**
 * Props for the Summary component
 */
export interface SummaryProps {
  /** Session summary data */
  summary: SessionSummary;
}

/**
 * Format cost as $X.XXXX
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Single stat display with label and value
 */
function StatItem({
  label,
  value,
  color = "white",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <Box marginRight={3}>
      <Text color="gray">{label}: </Text>
      <Text color={color} bold>
        {value}
      </Text>
    </Box>
  );
}

/**
 * Commit list display
 */
function CommitList({
  commits,
  maxCommits = 5,
}: {
  commits: CommitInfo[];
  maxCommits?: number;
}) {
  if (commits.length === 0) {
    return (
      <Text color="gray" italic>
        No commits
      </Text>
    );
  }

  const displayCommits = commits.slice(0, maxCommits);
  const remaining = commits.length - displayCommits.length;

  return (
    <Box flexDirection="column">
      {displayCommits.map((commit) => (
        <Box key={commit.sha}>
          <Text color="yellow">{commit.shortSha}</Text>
          <Text color="gray"> </Text>
          <Text>
            {commit.message.length > 60
              ? `${commit.message.slice(0, 57)}...`
              : commit.message}
          </Text>
        </Box>
      ))}
      {remaining > 0 && (
        <Text color="gray" italic>
          ... and {remaining} more commit{remaining !== 1 ? "s" : ""}
        </Text>
      )}
    </Box>
  );
}

/**
 * Summary component
 *
 * Displays session completion summary with:
 * - Gradient "Session Complete" header
 * - Stats row (Iterations, Duration, Cost, Commits)
 * - Files Changed section
 * - Commits section
 * - PR link if created
 */
export function Summary({ summary }: SummaryProps) {
  const {
    totalIterations,
    totalDurationSeconds,
    totalCost,
    commits,
    filesChanged,
    prdComplete,
    prUrl,
  } = summary;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Gradient name="pastel">
          <Text bold>Session Complete</Text>
        </Gradient>
        {prdComplete && (
          <Text color="green" bold>
            {" "}
            ✓ PRD Complete
          </Text>
        )}
      </Box>

      {/* Stats Row */}
      <Box marginBottom={1}>
        <StatItem label="Iterations" value={totalIterations} color="cyan" />
        <StatItem
          label="Duration"
          value={formatDuration(totalDurationSeconds)}
          color="cyan"
        />
        {totalCost !== undefined && (
          <StatItem label="Cost" value={formatCost(totalCost)} color="yellow" />
        )}
        <StatItem label="Commits" value={commits.length} color="green" />
      </Box>

      {/* Files Changed Section */}
      {filesChanged.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray" bold>
            Files Changed
          </Text>
          <Box marginLeft={1}>
            <DiffPreview stats={filesChanged} maxFiles={8} />
          </Box>
        </Box>
      )}

      {/* Commits Section */}
      {commits.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray" bold>
            Commits
          </Text>
          <Box marginLeft={1}>
            <CommitList commits={commits} />
          </Box>
        </Box>
      )}

      {/* PR Link */}
      {prUrl && (
        <Box marginTop={1}>
          <Text color="green" bold>
            Pull Request:
          </Text>
          <Text color="cyan"> {prUrl}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Create a SessionSummary from session data
 */
export function createSummary({
  iterations,
  commits,
  filesChanged,
  prUrl,
}: {
  iterations: Array<{
    durationSeconds: number;
    usage?: { totalCostUsd?: number };
  }>;
  commits: CommitInfo[];
  filesChanged: DiffStat[];
  prUrl?: string;
}): SessionSummary {
  const totalDurationSeconds = iterations.reduce(
    (sum, it) => sum + it.durationSeconds,
    0,
  );

  const totalCost = iterations.reduce((sum, it) => {
    if (it.usage?.totalCostUsd !== undefined) {
      return sum + it.usage.totalCostUsd;
    }
    return sum;
  }, 0);

  const prdComplete = iterations.some(
    (it) => "prdComplete" in it && it.prdComplete,
  );

  return {
    totalIterations: iterations.length,
    totalDurationSeconds,
    totalCost: totalCost > 0 ? totalCost : undefined,
    commits,
    filesChanged,
    prdComplete,
    prUrl,
  };
}
