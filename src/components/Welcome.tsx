import { Box, Text } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import { useEffect, useState } from "react";
import { getCurrentBranch, getRepoRoot } from "../hooks/use-git.js";

/**
 * Props for the Welcome component
 */
export interface WelcomeProps {
  /** Called when welcome screen animation completes */
  onComplete?: () => void;
  /** Duration to show the welcome screen (ms) */
  duration?: number;
}

/**
 * Welcome screen component with ASCII art logo, gradient colors,
 * version from package.json, repository name, and current branch.
 */
export function Welcome({ onComplete, duration = 1500 }: WelcomeProps) {
  const [repoName, setRepoName] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    async function loadRepoInfo() {
      const [root, currentBranch] = await Promise.all([
        getRepoRoot(),
        getCurrentBranch(),
      ]);

      if (root) {
        // Extract repo name from path (last component)
        const parts = root.split("/");
        setRepoName(parts[parts.length - 1] ?? null);
      }
      setBranch(currentBranch);
    }

    void loadRepoInfo();
  }, []);

  // Auto-complete after duration
  useEffect(() => {
    if (!onComplete) return;

    const timer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  // Get version from package.json (hardcoded for now, will be injected at build)
  const version = "1.0.0";

  return (
    <Box flexDirection="column" alignItems="center" marginY={1}>
      {/* ASCII Art Logo with Gradient */}
      <Box marginBottom={1}>
        <Gradient name="pastel">
          <BigText text="Ralph" font="chrome" />
        </Gradient>
      </Box>

      {/* Tagline */}
      <Box marginBottom={1}>
        <Text color="gray" italic>
          Claude Code iteration runner
        </Text>
      </Box>

      {/* Version and Repository Info */}
      <Box flexDirection="column" alignItems="center">
        <Box>
          <Text color="gray">v{version}</Text>
        </Box>

        {repoName && (
          <Box marginTop={1}>
            <Text color="cyan" bold>
              {repoName}
            </Text>
            {branch && (
              <Text color="gray">
                {" "}
                on <Text color="green">{branch}</Text>
              </Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
