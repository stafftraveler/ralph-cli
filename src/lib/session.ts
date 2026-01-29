import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { getCurrentBranch, getCurrentCommit } from "../hooks/use-git.js";
import type { IterationResult, SessionCheckpoint, SessionState } from "../types.js";

const SESSION_FILE = "session.json";

/**
 * Get the path to the session file
 */
function getSessionPath(ralphDir: string): string {
  return path.join(ralphDir, SESSION_FILE);
}

/**
 * Load existing session from .ralph/session.json
 * Returns null if no session exists or file is invalid
 */
export async function loadSession(ralphDir: string): Promise<SessionState | null> {
  const sessionPath = getSessionPath(ralphDir);

  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = await readFile(sessionPath, "utf-8");
    const session = JSON.parse(content) as SessionState;

    // Validate required fields
    if (!session.id || !session.startedAt || !session.branch) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Save session state to .ralph/session.json
 */
export async function saveSession(ralphDir: string, session: SessionState): Promise<void> {
  const sessionPath = getSessionPath(ralphDir);

  // Ensure .ralph directory exists
  if (!existsSync(ralphDir)) {
    await mkdir(ralphDir, { recursive: true });
  }

  await writeFile(sessionPath, JSON.stringify(session, null, 2), "utf-8");
}

/**
 * Create a new session state
 */
export async function createSession(branch?: string): Promise<SessionState> {
  const currentBranch = branch ?? (await getCurrentBranch()) ?? "unknown";
  const startCommit = (await getCurrentCommit()) ?? "unknown";

  return {
    id: uuidv4(),
    startedAt: new Date().toISOString(),
    startCommit,
    branch: currentBranch,
    iterations: [],
  };
}

/**
 * Save a checkpoint for resume functionality
 * Called after each successful iteration
 */
export async function saveCheckpoint(
  ralphDir: string,
  session: SessionState,
  iteration: number,
): Promise<void> {
  const commit = (await getCurrentCommit()) ?? "unknown";

  const checkpoint: SessionCheckpoint = {
    iteration,
    timestamp: new Date().toISOString(),
    commit,
  };

  const updatedSession: SessionState = {
    ...session,
    checkpoint,
  };

  await saveSession(ralphDir, updatedSession);
}

/**
 * Resume from a checkpoint
 * Returns the iteration number to resume from (1-indexed)
 * Returns null if no valid checkpoint exists
 */
export async function resumeFromCheckpoint(
  ralphDir: string,
): Promise<{ session: SessionState; resumeIteration: number } | null> {
  const session = await loadSession(ralphDir);

  if (!session?.checkpoint) {
    return null;
  }

  // Resume from the next iteration after the checkpoint
  const resumeIteration = session.checkpoint.iteration + 1;

  return {
    session,
    resumeIteration,
  };
}

/**
 * Add an iteration result to the session
 */
export async function addIterationResult(
  ralphDir: string,
  session: SessionState,
  result: IterationResult,
): Promise<SessionState> {
  const updatedSession: SessionState = {
    ...session,
    iterations: [...session.iterations, result],
  };

  await saveSession(ralphDir, updatedSession);
  return updatedSession;
}

/**
 * Clear session file (used with --reset flag)
 */
export async function clearSession(ralphDir: string): Promise<void> {
  const sessionPath = getSessionPath(ralphDir);

  if (existsSync(sessionPath)) {
    await writeFile(sessionPath, "{}", "utf-8");
  }
}

/**
 * Check if a session can be resumed
 */
export async function canResumeSession(ralphDir: string): Promise<boolean> {
  const session = await loadSession(ralphDir);
  return session?.checkpoint !== undefined;
}
