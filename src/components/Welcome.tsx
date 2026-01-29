import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { getCurrentBranch, getRepoRoot } from "../hooks/use-git.js";

/**
 * ASCII art logo for Ralph - each line separate for vertical gradient
 */
const RALPH_LOGO_LINES = [
  "    ██████╗  █████╗ ██╗     ██████╗ ██╗  ██╗",
  "    ██╔══██╗██╔══██╗██║     ██╔══██╗██║  ██║",
  "    ██████╔╝███████║██║     ██████╔╝███████║",
  "    ██╔══██╗██╔══██║██║     ██╔═══╝ ██╔══██║",
  "    ██║  ██║██║  ██║███████╗██║     ██║  ██║",
  "    ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝",
];

/**
 * Simpsons yellow gradient colors (top to bottom, bright to darker)
 */
const YELLOW_GRADIENT = [
  "#FFD800", // Bright Simpsons yellow
  "#F5C800", // Slightly darker
  "#E8B800", // Medium
  "#D4A800", // Darker
  "#C49800", // Even darker
  "#B08800", // Darkest
];

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
      {/* ASCII Art Logo with Vertical Yellow Gradient */}
      <Box flexDirection="column" marginBottom={1}>
        {RALPH_LOGO_LINES.map((line, index) => (
          <Text key={index} color={YELLOW_GRADIENT[index]}>
            {line}
          </Text>
        ))}
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
