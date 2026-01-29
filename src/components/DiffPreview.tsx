import { Box, Text } from "ink";
import type { DiffStat } from "../types.js";

/**
 * Props for the DiffPreview component
 */
export interface DiffPreviewProps {
  /** Array of diff statistics */
  stats: DiffStat[];
  /** Maximum number of files to show (default: 10) */
  maxFiles?: number;
  /** Show compact view (single line) */
  compact?: boolean;
}

/**
 * Get color for file status
 */
function getStatusColor(
  status: DiffStat["status"],
): "yellow" | "green" | "red" | "cyan" | "magenta" | "gray" {
  switch (status) {
    case "M":
      return "yellow";
    case "A":
      return "green";
    case "D":
      return "red";
    case "R":
      return "cyan";
    case "C":
      return "magenta";
    default:
      return "gray";
  }
}

/**
 * Get status label for display
 * @internal Reserved for future verbose mode
 */
function _getStatusLabel(status: DiffStat["status"]): string {
  switch (status) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "U":
      return "unmerged";
    default:
      return status;
  }
}

/**
 * Single file diff line
 */
function DiffLine({ stat }: { stat: DiffStat }) {
  const color = getStatusColor(stat.status);
  const hasChanges = stat.additions > 0 || stat.deletions > 0;

  return (
    <Box>
      <Text color={color}>{stat.status}</Text>
      <Text> </Text>
      <Text color={color}>{stat.file}</Text>
      {hasChanges && (
        <Text color="gray">
          {" "}
          <Text color="green">+{stat.additions}</Text>
          <Text>/</Text>
          <Text color="red">-{stat.deletions}</Text>
        </Text>
      )}
    </Box>
  );
}

/**
 * Compact summary of changes
 */
function DiffSummary({ stats }: { stats: DiffStat[] }) {
  const modified = stats.filter((s) => s.status === "M").length;
  const added = stats.filter((s) => s.status === "A").length;
  const deleted = stats.filter((s) => s.status === "D").length;
  const other = stats.length - modified - added - deleted;

  const totalAdditions = stats.reduce((sum, s) => sum + s.additions, 0);
  const totalDeletions = stats.reduce((sum, s) => sum + s.deletions, 0);

  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} modified`);
  if (added > 0) parts.push(`${added} added`);
  if (deleted > 0) parts.push(`${deleted} deleted`);
  if (other > 0) parts.push(`${other} other`);

  return (
    <Box>
      <Text color="gray">
        {stats.length} file{stats.length !== 1 ? "s" : ""} changed
        {parts.length > 0 && ` (${parts.join(", ")})`}
        {" · "}
        <Text color="green">+{totalAdditions}</Text>
        <Text>/</Text>
        <Text color="red">-{totalDeletions}</Text>
      </Text>
    </Box>
  );
}

/**
 * DiffPreview component
 *
 * Displays files changed with color-coded status:
 * - M (modified) = yellow
 * - A (added) = green
 * - D (deleted) = red
 * - R (renamed) = cyan
 * - C (copied) = magenta
 *
 * Also shows +/- counts for additions and deletions
 */
export function DiffPreview({ stats, maxFiles = 10, compact = false }: DiffPreviewProps) {
  if (stats.length === 0) {
    return (
      <Box>
        <Text color="gray" italic>
          No files changed
        </Text>
      </Box>
    );
  }

  if (compact) {
    return <DiffSummary stats={stats} />;
  }

  const displayStats = stats.slice(0, maxFiles);
  const remaining = stats.length - displayStats.length;

  return (
    <Box flexDirection="column">
      <DiffSummary stats={stats} />
      <Box flexDirection="column" marginTop={1}>
        {displayStats.map((stat) => (
          <DiffLine key={stat.file} stat={stat} />
        ))}
        {remaining > 0 && (
          <Text color="gray" italic>
            ... and {remaining} more file{remaining !== 1 ? "s" : ""}
          </Text>
        )}
      </Box>
    </Box>
  );
}
