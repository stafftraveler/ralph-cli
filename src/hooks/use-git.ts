import { execa } from "execa";
import type { CommitInfo, DiffStat } from "../types.js";

/**
 * Get the root directory of the current git repository
 */
export async function getRepoRoot(): Promise<string | null> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
    // Branch might exist, try switching
    try {
      await execa("git", ["checkout", name]);
      return true;
    } catch {
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
  } catch {
    return [];
  }
}

/**
 * Get the number of commits between two SHAs
 */
export async function getCommitCount(fromSha: string, toSha = "HEAD"): Promise<number> {
  try {
    const { stdout } = await execa("git", ["rev-list", "--count", `${fromSha}..${toSha}`]);
    return Number.parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
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
  } catch {
    return [];
  }
}

/**
 * Check if working directory has uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    // Check staged changes
    const { exitCode: stagedExit } = await execa("git", ["diff", "--cached", "--quiet"], {
      reject: false,
    });
    if (stagedExit !== 0) return true;

    // Check unstaged changes
    const { exitCode: unstagedExit } = await execa("git", ["diff", "--quiet"], {
      reject: false,
    });
    return unstagedExit !== 0;
  } catch {
    return false;
  }
}

/**
 * Check if there are untracked files (excluding .ralph/ directory)
 */
export async function hasUntrackedFiles(): Promise<boolean> {
  try {
    const { stdout } = await execa("git", ["ls-files", "--others", "--exclude-standard"]);
    const files = stdout
      .trim()
      .split("\n")
      .filter((f) => f && !f.startsWith(".ralph/"));
    return files.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if currently on main or master branch
 */
export async function isOnMainBranch(): Promise<boolean> {
  const branch = await getCurrentBranch();
  return branch === "main" || branch === "master";
}
