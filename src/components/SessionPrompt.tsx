import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { canResumeSession, loadSession } from "../lib/session.js";
import { clearProgress, formatDuration, progressHasContent } from "../lib/utils.js";
import type { SessionState } from "../types.js";

/**
 * Props for the SessionPrompt component
 */
export interface SessionPromptProps {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Called when user chooses to start a new session */
  onNewSession: () => void;
  /** Called when user chooses to resume, with iteration to resume from */
  onResumeSession: (resumeIteration: number) => void;
  /** Skip prompt and force new session */
  forceNew?: boolean;
  /** Skip prompt and force resume */
  forceResume?: boolean;
}

type Phase = "loading" | "prompt" | "no-session" | "progress-prompt";

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
  onNewSession,
  onResumeSession,
  forceNew,
  forceResume,
}: SessionPromptProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionState | null>(null);
  const [hasProgress, setHasProgress] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    async function checkSession() {
      // Check if progress.txt has content
      const progressExists = await progressHasContent(ralphDir);
      setHasProgress(progressExists);

      // Handle forced options
      if (forceNew) {
        // When forcing new session, clear progress.txt if it has content
        if (progressExists) {
          await clearProgress(ralphDir);
        }
        onNewSession();
        return;
      }

      const canResume = await canResumeSession(ralphDir);

      if (!canResume) {
        if (forceResume) {
          // User requested resume but no session exists
          setPhase("no-session");
          return;
        }

        // No resumable session checkpoint
        // But if progress.txt has content, offer to start fresh
        if (progressExists) {
          setPhase("progress-prompt");
          return;
        }

        // No progress, no session - start new
        onNewSession();
        return;
      }

      // Load session to display info
      const loaded = await loadSession(ralphDir);
      if (!loaded?.checkpoint) {
        // Session exists but no checkpoint
        // Check if progress.txt has content
        if (progressExists) {
          setPhase("progress-prompt");
          return;
        }
        onNewSession();
        return;
      }

      if (forceResume) {
        // Auto-resume
        onResumeSession(loaded.checkpoint.iteration + 1);
        return;
      }

      setSession(loaded);
      setPhase("prompt");
    }
    void checkSession();
  }, [ralphDir, forceNew, forceResume, onNewSession, onResumeSession]);

  // Handle selection
  const handleSelect = async (item: SelectItem) => {
    if (item.value === "resume" && session?.checkpoint) {
      onResumeSession(session.checkpoint.iteration + 1);
    } else if (item.value === "new-clear") {
      // Clear progress.txt and start new
      await clearProgress(ralphDir);
      onNewSession();
    } else if (item.value === "new-keep") {
      // Keep progress.txt and start new
      onNewSession();
    } else {
      // Default "new" - clear progress if it exists
      if (hasProgress) {
        await clearProgress(ralphDir);
      }
      onNewSession();
    }
  };

  // Render based on phase
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
