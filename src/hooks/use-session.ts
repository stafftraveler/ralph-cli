import { useCallback, useState } from "react";
import {
  addIterationResult,
  canResumeSession,
  clearSession,
  createSession,
  loadSession,
  resumeFromCheckpoint,
  saveCheckpoint,
  saveSession,
} from "../lib/session.js";
import type { IterationResult, SessionState } from "../types.js";

/**
 * State exposed by the useSession hook
 */
interface UseSessionState {
  /** Current session state */
  session: SessionState | null;
  /** Whether a session operation is in progress */
  isLoading: boolean;
  /** Whether a previous session can be resumed */
  canResume: boolean;
  /** Error message if last operation failed */
  error: string | null;
}

/**
 * Actions returned by the useSession hook
 */
interface UseSessionActions {
  /** Load existing session from disk */
  load: () => Promise<SessionState | null>;
  /** Start a new session */
  startNew: (branch?: string) => Promise<SessionState>;
  /** Resume from checkpoint, returns iteration to resume from */
  resume: () => Promise<{
    session: SessionState;
    resumeIteration: number;
  } | null>;
  /** Save current session to disk */
  save: () => Promise<void>;
  /** Add an iteration result to the session */
  addIteration: (result: IterationResult) => Promise<void>;
  /** Save a checkpoint after successful iteration */
  checkpoint: (iteration: number) => Promise<void>;
  /** Check if a session can be resumed */
  checkCanResume: () => Promise<boolean>;
  /** Clear session (for --reset) */
  clear: () => Promise<void>;
  /** Update session state directly */
  setSession: (session: SessionState | null) => void;
}

/**
 * Hook for managing Ralph session state in React components
 *
 * Wraps session.ts library functions with React state management
 * for use in Ink components.
 *
 * @param ralphDir - Path to .ralph directory
 * @returns Tuple of [state, actions]
 */
export function useSession(ralphDir: string): [UseSessionState, UseSessionActions] {
  const [session, setSession] = useState<SessionState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load existing session from disk
   */
  const load = useCallback(async (): Promise<SessionState | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await loadSession(ralphDir);
      setSession(loaded);
      setCanResume(loaded?.checkpoint !== undefined);
      return loaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load session";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [ralphDir]);

  /**
   * Start a new session
   */
  const startNew = useCallback(
    async (branch?: string): Promise<SessionState> => {
      setIsLoading(true);
      setError(null);
      try {
        const newSession = await createSession(branch);
        await saveSession(ralphDir, newSession);
        setSession(newSession);
        setCanResume(false);
        return newSession;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create session";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ralphDir],
  );

  /**
   * Resume from checkpoint
   */
  const resume = useCallback(async (): Promise<{
    session: SessionState;
    resumeIteration: number;
  } | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await resumeFromCheckpoint(ralphDir);
      if (result) {
        setSession(result.session);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resume session";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [ralphDir]);

  /**
   * Save current session to disk
   */
  const save = useCallback(async (): Promise<void> => {
    if (!session) {
      setError("No session to save");
      return;
    }
    setError(null);
    try {
      await saveSession(ralphDir, session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save session";
      setError(message);
      throw err;
    }
  }, [ralphDir, session]);

  /**
   * Add an iteration result to the session
   */
  const addIteration = useCallback(
    async (result: IterationResult): Promise<void> => {
      if (!session) {
        setError("No active session");
        return;
      }
      setError(null);
      try {
        const updated = await addIterationResult(ralphDir, session, result);
        setSession(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add iteration";
        setError(message);
        throw err;
      }
    },
    [ralphDir, session],
  );

  /**
   * Save a checkpoint after successful iteration
   */
  const checkpoint = useCallback(
    async (iteration: number): Promise<void> => {
      if (!session) {
        setError("No active session");
        return;
      }
      setError(null);
      try {
        await saveCheckpoint(ralphDir, session, iteration);
        // Reload to get updated checkpoint
        const updated = await loadSession(ralphDir);
        if (updated) {
          setSession(updated);
          setCanResume(true);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save checkpoint";
        setError(message);
        throw err;
      }
    },
    [ralphDir, session],
  );

  /**
   * Check if a session can be resumed
   */
  const checkCanResume = useCallback(async (): Promise<boolean> => {
    try {
      const result = await canResumeSession(ralphDir);
      setCanResume(result);
      return result;
    } catch {
      setCanResume(false);
      return false;
    }
  }, [ralphDir]);

  /**
   * Clear session (for --reset)
   */
  const clear = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await clearSession(ralphDir);
      setSession(null);
      setCanResume(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear session";
      setError(message);
      throw err;
    }
  }, [ralphDir]);

  const state: UseSessionState = {
    session,
    isLoading,
    canResume,
    error,
  };

  const actions: UseSessionActions = {
    load,
    startNew,
    resume,
    save,
    addIteration,
    checkpoint,
    checkCanResume,
    clear,
    setSession,
  };

  return [state, actions];
}
