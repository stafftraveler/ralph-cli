import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IterationResult } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Format a duration in seconds to a human-readable string.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "1h 30m 45s", "5m 30s", "45s")
 */
export function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  }

  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }

  return `${seconds}s`;
}

/**
 * Check if progress.txt exists and has content.
 * Used to detect if there's existing progress from a previous session.
 *
 * @param ralphDir - Path to .ralph directory
 * @returns true if progress.txt exists and has non-whitespace content
 */
export async function progressHasContent(ralphDir: string): Promise<boolean> {
  const progressPath = join(ralphDir, "progress.txt");
  try {
    const stats = await stat(progressPath);
    if (stats.size === 0) {
      return false;
    }
    const content = await readFile(progressPath, "utf-8");
    return content.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Clear progress.txt content.
 * Used when starting a new session.
 *
 * @param ralphDir - Path to .ralph directory
 */
export async function clearProgress(ralphDir: string): Promise<void> {
  const progressPath = join(ralphDir, "progress.txt");
  try {
    await writeFile(progressPath, "", "utf-8");
  } catch {
    // Ignore errors - file might not exist
  }
}

/**
 * Write iteration output to a log file.
 *
 * @param ralphDir - Path to .ralph directory
 * @param outputDir - Output directory name (relative to ralphDir)
 * @param result - Iteration result containing output to save
 */
export async function writeIterationLog(
  ralphDir: string,
  outputDir: string,
  result: IterationResult,
): Promise<void> {
  const logsDir = join(ralphDir, outputDir);

  // Ensure logs directory exists
  try {
    await mkdir(logsDir, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }

  // Format log filename with iteration number and timestamp
  const timestamp = new Date(result.startedAt)
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const filename = `iteration-${result.iteration.toString().padStart(2, "0")}-${timestamp}.log`;
  const logPath = join(logsDir, filename);

  // Format log content with metadata header
  const metadata = [
    `=== Iteration ${result.iteration} ===`,
    `Started:  ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    `Duration: ${formatDuration(result.durationSeconds)}`,
    `Success:  ${result.success}`,
    result.status ? `Status:   ${result.status}` : null,
    result.usage
      ? `Tokens:   ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`
      : null,
    result.usage?.totalCostUsd
      ? `Cost:     $${result.usage.totalCostUsd.toFixed(4)}`
      : null,
    `PRD Complete: ${result.prdComplete}`,
    "",
    "=== Output ===",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const logContent = `${metadata}${result.output}\n`;

  await writeFile(logPath, logContent, "utf-8");
}

/**
 * Reset PRD.md to empty template and clear progress.txt.
 * Used with --reset flag to start a fresh session.
 *
 * @param ralphDir - Path to .ralph directory
 */
export async function resetPrdAndProgress(ralphDir: string): Promise<void> {
  // Copy empty.md template to PRD.md
  const emptyTemplatePath = join(
    __dirname,
    "..",
    "templates",
    "prd",
    "empty.md",
  );
  const prdPath = join(ralphDir, "PRD.md");
  await copyFile(emptyTemplatePath, prdPath);

  // Clear progress.txt
  await clearProgress(ralphDir);
}
