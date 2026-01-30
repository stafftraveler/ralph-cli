import { execa } from "execa";
import { debugLog } from "../lib/utils.js";
import type { CommitInfo, DiffStat } from "../types.js";

/**
 * Get the root directory of the current git repository
 */
export async function getRepoRoot(): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch (error) {
    debugLog("[use-git] Failed to get repo root:", error);
    return null;
  }
}

/**
 * Check if we're inside a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--git-dir"]);
    return true;
  } catch (error) {
    debugLog("[use-git] Not a git repository:", error);
    return false;
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["branch", "--show-current"]);
    return stdout.trim() || null;
  } catch (error) {
    debugLog("[use-git] Failed to get current branch:", error);
    return null;
  }
}

/**
 * Get the current HEAD commit SHA
 */
export async function getCurrentCommit(): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch (error) {
    debugLog("[use-git] Failed to get current commit:", error);
    return null;
  }
}

/**
 * Create and switch to a new branch, or switch to existing branch
 */
export async function createBranch(name: string): Promise<boolean> {
  try {
    // Try to create new branch
    await execa("git", ["checkout", "-b", name]);
    return true;
  } catch (error) {
    debugLog("[use-git] Failed to create new branch, trying to switch:", error);
    // Branch might exist, try switching
    try {
      await execa("git", ["checkout", name]);
      return true;
    } catch (switchError) {
      debugLog("[use-git] Failed to switch to existing branch:", switchError);
      return false;
    }
  }
}

/**
 * Get commits since a specific SHA
 */
export async function getCommitsSince(sha: string): Promise<CommitInfo[]> {
  try {
    const { stdout } = await execa("git", ["log", `${sha}..HEAD`, "--format=%H|%h|%s|%an|%aI"]);

    if (!stdout.trim()) {
      return [];
    }

    return stdout
      .trim()
      .split("\n")
      .map((line) => {
        const parts = line.split("|");
        return {
          sha: parts[0] ?? "",
          shortSha: parts[1] ?? "",
          message: parts[2] ?? "",
          author: parts[3] ?? "",
          timestamp: parts[4] ?? "",
        };
      });
  } catch (error) {
    debugLog(`[use-git] Failed to get commits since ${sha}:`, error);
    return [];
  }
}

/**
 * Get diff statistics between a commit and HEAD
 */
export async function getDiffStats(fromCommit: string): Promise<DiffStat[]> {
  try {
    // Get name-status for file status (M/A/D/R/C/U)
    const { stdout: nameStatus } = await execa("git", [
      "diff",
      "--name-status",
      `${fromCommit}..HEAD`,
    ]);

    if (!nameStatus.trim()) {
      return [];
    }

    // Get numstat for additions/deletions
    const { stdout: numstat } = await execa("git", ["diff", "--numstat", `${fromCommit}..HEAD`]);

    const statusMap = new Map<string, DiffStat["status"]>();
    for (const line of nameStatus.trim().split("\n")) {
      if (!line) continue;
      const [status, ...pathParts] = line.split("\t");
      const file = pathParts.join("\t"); // Handle filenames with tabs
      if (status) {
        statusMap.set(file, status.charAt(0) as DiffStat["status"]);
      }
    }

    const stats: DiffStat[] = [];
    for (const line of numstat.trim().split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      const additions = parts[0] ?? "0";
      const deletions = parts[1] ?? "0";
      const file = parts.slice(2).join("\t");

      stats.push({
        file,
        status: statusMap.get(file) ?? "M",
        additions: additions === "-" ? 0 : Number.parseInt(additions, 10) || 0,
        deletions: deletions === "-" ? 0 : Number.parseInt(deletions, 10) || 0,
      });
    }

    return stats;
  } catch (error) {
    debugLog(`[use-git] Failed to get diff stats from ${fromCommit}:`, error);
    return [];
  }
}
