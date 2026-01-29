import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import { useCallback, useMemo, useState } from "react";
import { hasApiKey, isClaudeCodeInstalled } from "../lib/claude.js";
import { prdHasTasks } from "../lib/prd.js";
import type { PreflightCheck, PreflightResult } from "../types.js";
import { isGitRepo } from "./use-git.js";

/**
 * State returned by usePreflight hook
 */
interface UsePreflightState {
  /** Whether preflight checks are running */
  isChecking: boolean;
  /** Results for all checks */
  results: PreflightResult | null;
  /** Whether all checks passed */
  allPassed: boolean;
  /** Whether PRD has tasks (vs needs template selection) */
  prdHasTasks: boolean;
}

/**
 * Actions returned by usePreflight hook
 */
interface UsePreflightActions {
  /** Run all preflight checks in parallel */
  runChecks: (ralphDir: string) => Promise<PreflightResult>;
  /** Mark API key check as passed (after user provides key) */
  markApiKeyPassed: () => void;
  /** Reset to initial state */
  reset: () => void;
}

function createCheckingCheck(name: string): PreflightCheck {
  return { name, status: "checking" };
}

function createPassedCheck(name: string, message?: string): PreflightCheck {
  return { name, status: "passed", message };
}

function createFailedCheck(name: string, error: string): PreflightCheck {
  return { name, status: "failed", error };
}

function createWarningCheck(name: string, message: string): PreflightCheck {
  return { name, status: "warning", message };
}

/**
 * Check if we're in a git repository
 */
async function checkGitRepo(): Promise<PreflightCheck> {
  const inRepo = await isGitRepo();
  if (inRepo) {
    return createPassedCheck("Git", "Inside git repository");
  }
  return createFailedCheck("Git", "Not inside a git repository. Run 'git init' first.");
}

/**
 * Check if PRD.md exists and has valid tasks
 */
async function checkPrd(ralphDir: string): Promise<{ check: PreflightCheck; hasTasks: boolean }> {
  const prdPath = join(ralphDir, "PRD.md");

  try {
    await access(prdPath, constants.R_OK);
  } catch {
    return {
      check: createFailedCheck("PRD", `PRD.md not found at ${prdPath}. Run 'ralph init' first.`),
      hasTasks: false,
    };
  }

  const hasTasks = await prdHasTasks(prdPath);
  if (hasTasks) {
    return {
      check: createPassedCheck("PRD", "PRD.md found with tasks"),
      hasTasks: true,
    };
  }

  return {
    check: createWarningCheck("PRD", "PRD.md exists but has no tasks. Will prompt for template."),
    hasTasks: false,
  };
}

/**
 * Check if Claude Code is installed (required for SDK runtime)
 */
async function checkClaudeCode(): Promise<PreflightCheck> {
  const installed = await isClaudeCodeInstalled();
  if (installed) {
    return createPassedCheck("Claude Code", "Claude Code installed");
  }
  return createFailedCheck(
    "Claude Code",
    "Claude Code not installed. Run: brew install --cask claude-code",
  );
}

/**
 * Check if ANTHROPIC_API_KEY is available (env var or keychain)
 */
async function checkApiKey(): Promise<PreflightCheck> {
  const hasKey = await hasApiKey();
  if (hasKey) {
    return createPassedCheck("API Key", "ANTHROPIC_API_KEY is set");
  }
  return createFailedCheck("API Key", "ANTHROPIC_API_KEY not found. Enter it when prompted.");
}

/**
 * Check if CLAUDE.md exists in the project root (warning only)
 */
async function checkClaudeMd(repoRoot: string): Promise<PreflightCheck> {
  const claudeMdPath = join(repoRoot, "CLAUDE.md");

  try {
    await access(claudeMdPath, constants.R_OK);
    return createPassedCheck("CLAUDE.md", "Project instructions found");
  } catch {
    return createWarningCheck(
      "CLAUDE.md",
      "CLAUDE.md not found. Consider adding project instructions.",
    );
  }
}

/**
 * React hook for running preflight checks
 *
 * Runs all checks in parallel and updates UI incrementally as each completes.
 */
export function usePreflight(): [UsePreflightState, UsePreflightActions] {
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<PreflightResult | null>(null);
  const [allPassed, setAllPassed] = useState(false);
  const [hasTasks, setHasTasks] = useState(false);

  const runChecks = useCallback(async (ralphDir: string) => {
    setIsChecking(true);
    setAllPassed(false);
    setHasTasks(false);

    // Calculate repo root (parent of .ralph directory)
    const repoRoot = ralphDir.replace(/[/\\]\.ralph$/, "");

    // Initialize all checks as "checking"
    const initialResults: PreflightResult = {
      claudeCode: createCheckingCheck("Claude Code"),
      apiKey: createCheckingCheck("API Key"),
      git: createCheckingCheck("Git"),
      prd: createCheckingCheck("PRD"),
      claudeMd: createCheckingCheck("CLAUDE.md"),
    };
    setResults(initialResults);

    // Track PRD tasks result separately
    let prdTasksFound = false;

    // Create promises that update state incrementally as each check completes
    const claudeCodePromise = checkClaudeCode()
      .then((result) => {
        setResults((prev) => (prev ? { ...prev, claudeCode: result } : prev));
        return result;
      })
      .catch(() => {
        const failed = createFailedCheck("Claude Code", "Check failed unexpectedly");
        setResults((prev) => (prev ? { ...prev, claudeCode: failed } : prev));
        return failed;
      });

    const apiKeyPromise = checkApiKey()
      .then((result) => {
        setResults((prev) => (prev ? { ...prev, apiKey: result } : prev));
        return result;
      })
      .catch(() => {
        const failed = createFailedCheck("API Key", "Check failed unexpectedly");
        setResults((prev) => (prev ? { ...prev, apiKey: failed } : prev));
        return failed;
      });

    const gitPromise = checkGitRepo()
      .then((result) => {
        setResults((prev) => (prev ? { ...prev, git: result } : prev));
        return result;
      })
      .catch(() => {
        const failed = createFailedCheck("Git", "Check failed unexpectedly");
        setResults((prev) => (prev ? { ...prev, git: failed } : prev));
        return failed;
      });

    const prdPromise = checkPrd(ralphDir)
      .then((result) => {
        prdTasksFound = result.hasTasks;
        setResults((prev) => (prev ? { ...prev, prd: result.check } : prev));
        return result.check;
      })
      .catch(() => {
        const failed = createFailedCheck("PRD", "Check failed unexpectedly");
        setResults((prev) => (prev ? { ...prev, prd: failed } : prev));
        return failed;
      });

    const claudeMdPromise = checkClaudeMd(repoRoot)
      .then((result) => {
        setResults((prev) => (prev ? { ...prev, claudeMd: result } : prev));
        return result;
      })
      .catch(() => {
        const warning = createWarningCheck("CLAUDE.md", "Check failed unexpectedly");
        setResults((prev) => (prev ? { ...prev, claudeMd: warning } : prev));
        return warning;
      });

    // Wait for all checks to complete
    const [finalClaudeCode, finalApiKey, finalGit, finalPrd, finalClaudeMd] = await Promise.all([
      claudeCodePromise,
      apiKeyPromise,
      gitPromise,
      prdPromise,
      claudeMdPromise,
    ]);

    const finalResults: PreflightResult = {
      claudeCode: finalClaudeCode,
      apiKey: finalApiKey,
      git: finalGit,
      prd: finalPrd,
      claudeMd: finalClaudeMd,
    };

    setHasTasks(prdTasksFound);

    // Check if all passed (warnings are OK, only failures block)
    const allChecks = [finalClaudeCode, finalApiKey, finalGit, finalPrd, finalClaudeMd];
    const passed = allChecks.every((c) => c.status !== "failed");
    setAllPassed(passed);

    setIsChecking(false);
    return finalResults;
  }, []);

  const reset = useCallback(() => {
    setIsChecking(false);
    setResults(null);
    setAllPassed(false);
    setHasTasks(false);
  }, []);

  /**
   * Mark API key check as passed after user provides the key.
   * This avoids re-running all checks and prevents race conditions.
   */
  const markApiKeyPassed = useCallback(() => {
    // Update results with passed API key check
    setResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        apiKey: createPassedCheck("API Key", "ANTHROPIC_API_KEY is set"),
      };
    });

    // If API key was the only failing check, all checks now pass
    // (we only show the API key prompt when other checks passed)
    setAllPassed(true);
  }, []);

  const state = useMemo<UsePreflightState>(
    () => ({ isChecking, results, allPassed, prdHasTasks: hasTasks }),
    [isChecking, results, allPassed, hasTasks],
  );

  const actions = useMemo<UsePreflightActions>(
    () => ({ runChecks, markApiKeyPassed, reset }),
    [runChecks, markApiKeyPassed, reset],
  );

  return [state, actions] as const;
}

/**
 * Run preflight checks without React hooks (for non-component use)
 */
export async function runPreflightChecks(ralphDir: string): Promise<{
  results: PreflightResult;
  allPassed: boolean;
  prdHasTasks: boolean;
}> {
  // Calculate repo root (parent of .ralph directory)
  const repoRoot = ralphDir.replace(/[/\\]\.ralph$/, "");

  const [claudeCodeResult, apiKeyResult, gitResult, prdResult, claudeMdResult] =
    await Promise.allSettled([
      checkClaudeCode(),
      checkApiKey(),
      checkGitRepo(),
      checkPrd(ralphDir),
      checkClaudeMd(repoRoot),
    ]);

  const claudeCode =
    claudeCodeResult.status === "fulfilled"
      ? claudeCodeResult.value
      : createFailedCheck("Claude Code", "Check failed unexpectedly");

  const apiKey =
    apiKeyResult.status === "fulfilled"
      ? apiKeyResult.value
      : createFailedCheck("API Key", "Check failed unexpectedly");

  const git =
    gitResult.status === "fulfilled"
      ? gitResult.value
      : createFailedCheck("Git", "Check failed unexpectedly");

  const prd =
    prdResult.status === "fulfilled"
      ? prdResult.value.check
      : createFailedCheck("PRD", "Check failed unexpectedly");

  const prdHasTasksResult = prdResult.status === "fulfilled" ? prdResult.value.hasTasks : false;

  const claudeMd =
    claudeMdResult.status === "fulfilled"
      ? claudeMdResult.value
      : createWarningCheck("CLAUDE.md", "Check failed unexpectedly");

  const results: PreflightResult = { claudeCode, apiKey, git, prd, claudeMd };
  const allChecks = [claudeCode, apiKey, git, prd, claudeMd];
  const allPassed = allChecks.every((c) => c.status !== "failed");

  return { results, allPassed, prdHasTasks: prdHasTasksResult };
}
