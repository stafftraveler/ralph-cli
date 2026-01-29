import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
