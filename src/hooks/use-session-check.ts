import { useEffect, useState } from "react";
import { canResumeSession, loadSession } from "../lib/session.js";
import { clearProgress, progressHasContent } from "../lib/utils.js";
import type { SessionState } from "../types.js";

/**
 * Phase for the session checking flow
 */
export type SessionCheckPhase =
  | "loading"
  | "prompt"
  | "no-session"
  | "progress-prompt"
  | "branch-prompt";

/**
 * Props for the session check hook
 */
export interface UseSessionCheckProps {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Whether to force a new session (skip prompts) */
  forceNew?: boolean;
  /** Whether to force resume (skip prompts) */
  forceResume?: boolean;
  /** Callback when user should start a new session */
  onNewSession: () => void;
  /** Callback when user should resume from given iteration */
  onResumeSession: (iteration: number) => void;
}

/**
 * State returned by the session check hook
 */
export interface UseSessionCheckState {
  /** Current phase of the checking flow */
  phase: SessionCheckPhase;
  /** Loaded session state (if any) */
  session: SessionState | null;
  /** Whether progress.txt has content */
  hasProgress: boolean;
}

/**
 * Hook to check for existing sessions and determine what action to take.
 *
 * Handles the complex logic of:
 * - Checking if a session can be resumed
 * - Loading session state
 * - Checking if progress.txt has content
 * - Handling forced new/resume options
 * - Setting appropriate phase for UI
 */
export function useSessionCheck(props: UseSessionCheckProps): UseSessionCheckState {
  const { ralphDir, forceNew, forceResume, onNewSession, onResumeSession } = props;

  const [phase, setPhase] = useState<SessionCheckPhase>("loading");
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

  return {
    phase,
    session,
    hasProgress,
  };
}
