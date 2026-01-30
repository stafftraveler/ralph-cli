import { useEffect, useState } from "react";
import { getCommitsSince, getDiffStats } from "./use-git.js";
import type { DiffStat } from "../types.js";

/**
 * Return type for useSummaryData hook
 */
export interface SummaryData {
  filesChanged: DiffStat[];
  commits: Array<{
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    timestamp: string;
  }>;
  isLoaded: boolean;
}

/**
 * Hook to load summary data (diff stats and commits) for a session
 *
 * @param startCommit - The commit SHA to compare against
 * @returns Summary data with loading state
 */
export function useSummaryData(startCommit: string): SummaryData {
  const [filesChanged, setFilesChanged] = useState<DiffStat[]>([]);
  const [commits, setCommits] = useState<
    Array<{
      sha: string;
      shortSha: string;
      message: string;
      author: string;
      timestamp: string;
    }>
  >([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadData() {
      const [diffStats, commitList] = await Promise.all([
        getDiffStats(startCommit),
        getCommitsSince(startCommit),
      ]);
      setFilesChanged(diffStats);
      setCommits(commitList);
      setIsLoaded(true);
    }
    void loadData();
  }, [startCommit]);

  return {
    filesChanged,
    commits,
    isLoaded,
  };
}
