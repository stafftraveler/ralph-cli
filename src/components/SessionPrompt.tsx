import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useState } from "react";
import { useSessionCheck } from "../hooks/use-session-check.js";
import { clearProgress, formatDuration } from "../lib/utils.js";

/** Default branch names that trigger the branch prompt */
const DEFAULT_BRANCHES = ["main", "master"];

/**
 * Check if the given branch is a default branch (main/master)
 */
function isDefaultBranch(branch: string): boolean {
  return DEFAULT_BRANCHES.includes(branch);
}

/**
 * Props for the SessionPrompt component
 */
export interface SessionPromptProps {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Current git branch name */
  currentBranch: string;
  /** Called when user chooses to start a new session, optionally with a new branch name */
  onNewSession: (branchName?: string) => void;
  /** Called when user chooses to resume, with iteration to resume from */
  onResumeSession: (resumeIteration: number) => void;
  /** Skip prompt and force new session */
  forceNew?: boolean;
  /** Skip prompt and force resume */
  forceResume?: boolean;
  /** Skip branch prompt (e.g., when --branch CLI flag is used) */
  skipBranchPrompt?: boolean;
}

interface SelectItem {
  label: string;
  value: "resume" | "new" | "new-keep" | "new-clear";
}

/**
 * SessionPrompt component for choosing to resume or start new session.
 *
 * Shows session info when a previous session exists with a checkpoint,
 * allowing user to either resume or start fresh.
 */
export function SessionPrompt({
  ralphDir,
  currentBranch,
  onNewSession,
  onResumeSession,
  forceNew,
  forceResume,
  skipBranchPrompt,
}: SessionPromptProps) {
  // Local state for branch prompt phase
  const [localPhase, setLocalPhase] = useState<"branch-prompt" | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchError, setBranchError] = useState<string | null>(null);

  /**
   * Proceed to new session, conditionally showing branch prompt if on default branch
   */
  const proceedToNewSession = () => {
    // Skip branch prompt if CLI --branch is specified or not on default branch
    if (skipBranchPrompt || !isDefaultBranch(currentBranch)) {
      onNewSession();
    } else {
      setLocalPhase("branch-prompt");
    }
  };

  /**
   * Handle branch name submission
   */
  const handleBranchSubmit = (input: string) => {
    const trimmed = input.trim();

    // Empty = stay on current branch
    if (!trimmed) {
      onNewSession();
      return;
    }

    // Basic validation: no spaces, no special chars except / - _ .
    if (!/^[\w.\-/]+$/.test(trimmed)) {
      setBranchError("Invalid branch name");
      return;
    }

    setBranchError(null);
    onNewSession(trimmed);
  };

  // Use the session check hook
  const { phase, session, hasProgress } = useSessionCheck({
    ralphDir,
    forceNew,
    forceResume,
    onNewSession: proceedToNewSession,
    onResumeSession,
  });

  // Handle selection
  const handleSelect = async (item: SelectItem) => {
    if (item.value === "resume" && session?.checkpoint) {
      onResumeSession(session.checkpoint.iteration + 1);
    } else if (item.value === "new-clear") {
      // Clear progress.txt and start new
      await clearProgress(ralphDir);
      proceedToNewSession();
    } else if (item.value === "new-keep") {
      // Keep progress.txt and start new
      proceedToNewSession();
    } else {
      // Default "new" - clear progress if it exists
      if (hasProgress) {
        await clearProgress(ralphDir);
      }
      proceedToNewSession();
    }
  };

  // Render based on phase (prioritize local branch-prompt phase)
  if (localPhase === "branch-prompt") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold>Branch name</Text>
          <Text color="gray"> (Enter to stay on {currentBranch})</Text>
        </Box>

        <Box>
          <Text color="cyan">❯ </Text>
          <TextInput
            value={branchName}
            onChange={setBranchName}
            onSubmit={handleBranchSubmit}
            placeholder={currentBranch}
          />
        </Box>

        {branchError && (
          <Box marginTop={1}>
            <Text color="red">{branchError}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === "loading") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Checking for existing session...</Text>
      </Box>
    );
  }

  if (phase === "no-session") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="yellow">No session to resume.</Text>
        <Text color="gray">Starting a new session...</Text>
      </Box>
    );
  }

  if (phase === "progress-prompt") {
    const items: SelectItem[] = [
      {
        label: "Start new session (clear progress.txt)",
        value: "new-clear",
      },
      {
        label: "Start new session (keep progress.txt)",
        value: "new-keep",
      },
    ];

    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">
            Previous progress found
          </Text>
        </Box>

        <Box marginBottom={1} paddingLeft={2}>
          <Text color="gray">progress.txt contains content from a previous session.</Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold>What would you like to do?</Text>
        </Box>

        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
    );
  }

  if (phase === "prompt" && session?.checkpoint) {
    const completedIterations = session.checkpoint.iteration;
    const totalDuration = session.iterations.reduce((acc, iter) => acc + iter.durationSeconds, 0);
    const lastCheckpoint = new Date(session.checkpoint.timestamp);
    const timeSince = Math.floor((Date.now() - lastCheckpoint.getTime()) / 1000);

    const items: SelectItem[] = [
      {
        label: `Resume from iteration ${completedIterations + 1}`,
        value: "resume",
      },
      {
        label: "Start new session",
        value: "new",
      },
    ];

    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold>Previous session found</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
          <Text>
            <Text color="gray">Branch:</Text> <Text color="green">{session.branch}</Text>
          </Text>
          <Text>
            <Text color="gray">Completed:</Text>{" "}
            <Text color="cyan">{completedIterations} iteration(s)</Text>
          </Text>
          <Text>
            <Text color="gray">Duration:</Text> <Text>{formatDuration(totalDuration)}</Text>
          </Text>
          <Text>
            <Text color="gray">Last checkpoint:</Text> <Text>{formatDuration(timeSince)} ago</Text>
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold>What would you like to do?</Text>
        </Box>

        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
    );
  }

  return null;
}
