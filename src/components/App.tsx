import { join } from "node:path";
import { Box, Text, useApp } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBranch,
  getCommitsSince,
  getCurrentBranch,
  getDiffStats,
  getRepoRoot,
} from "../hooks/use-git.js";
import { useKeyboardShortcuts } from "../hooks/use-keyboard.js";
import { loadConfig } from "../lib/config.js";
import { notify } from "../lib/notify.js";
import {
  loadPlugins,
  runAfterIteration,
  runBeforeRun,
  runDone,
  runOnError,
} from "../lib/plugins.js";
import { prdHasTasks } from "../lib/prd.js";
import {
  addIterationResult,
  clearSession,
  createSession,
  loadSession,
  saveCheckpoint,
  saveSession,
} from "../lib/session.js";
import type {
  AppPhase,
  CliOptions,
  DiffStat,
  IterationResult,
  PluginContext,
  RalphConfig,
  RalphPlugin,
  SessionState,
} from "../types.js";
import { IterationRunner } from "./IterationRunner.js";
import { KeyboardShortcuts } from "./KeyboardShortcuts.js";
import { Preflight } from "./Preflight.js";
import { SessionPrompt } from "./SessionPrompt.js";
import { createSummary, Summary } from "./Summary.js";
import { TemplateSelector } from "./TemplateSelector.js";
import { Welcome } from "./Welcome.js";

/**
 * Props for the App component
 */
export interface AppProps {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Prompt to send to Claude for each iteration */
  prompt: string;
  /** CLI options parsed from command line */
  options: CliOptions;
}

/**
 * Main App orchestration component
 *
 * Manages the full flow:
 * Welcome -> Preflight -> TemplateSelector (if needed) -> SessionPrompt ->
 * Branch creation -> Iteration loop with plugin hooks -> Summary -> Done plugins
 */
export function App({ ralphDir, prompt, options }: AppProps) {
  const { exit } = useApp();

  // App state
  const [phase, setPhase] = useState<AppPhase>("welcome");
  const [config, setConfig] = useState<RalphConfig | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [plugins, setPlugins] = useState<RalphPlugin[]>([]);
  const [repoRoot, setRepoRoot] = useState<string>("");
  const [branch, setBranch] = useState<string>("");

  // Iteration state
  const [currentIteration, setCurrentIteration] = useState(1);
  const [totalIterations, _setTotalIterations] = useState(
    options.iterations ?? 1,
  );
  const [prdComplete, setPrdComplete] = useState(false);
  const [prUrl, _setPrUrl] = useState<string | undefined>();

  // Error state
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Track if we should show summary on exit
  const shouldShowSummaryRef = useRef(false);
  const isInterruptedRef = useRef(false);
  const hasRunDonePluginsRef = useRef(false);

  // Keyboard shortcuts
  const [keyboardState, _keyboardActions] = useKeyboardShortcuts({
    isActive: phase === "running",
    onQuit: useCallback(() => {
      isInterruptedRef.current = true;
      if (session && session.iterations.length > 0) {
        shouldShowSummaryRef.current = true;
        setPhase("summary");
      } else {
        exit();
      }
    }, [session, exit]),
  });

  // Merge verbose/debug from CLI and keyboard toggles
  const verbose = options.verbose || keyboardState.verbose;
  const debug = options.debug || keyboardState.debug;

  // Initialize on mount
  useEffect(() => {
    async function initialize() {
      const [loadedConfig, root, currentBranch] = await Promise.all([
        loadConfig(ralphDir),
        getRepoRoot(),
        getCurrentBranch(),
      ]);

      setConfig(loadedConfig);
      setRepoRoot(root ?? "");
      setBranch(currentBranch ?? "");

      // Load plugins unless disabled
      if (!options.noPlugins) {
        const loadedPlugins = await loadPlugins(ralphDir);
        setPlugins(loadedPlugins);
      }

      // Handle --reset flag
      if (options.reset) {
        await clearSession(ralphDir);
      }
    }
    void initialize();
  }, [ralphDir, options.noPlugins, options.reset]);

  // Handle SIGINT/SIGTERM
  useEffect(() => {
    const handleSignal = () => {
      isInterruptedRef.current = true;
      if (session && session.iterations.length > 0) {
        shouldShowSummaryRef.current = true;
        setPhase("summary");
      } else {
        exit();
      }
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);

    return () => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    };
  }, [session, exit]);

  // Build plugin context
  const getPluginContext = useCallback((): PluginContext | null => {
    if (!config || !session) return null;
    return {
      config,
      session,
      repoRoot,
      branch,
      verbose,
      dryRun: options.dryRun,
    };
  }, [config, session, repoRoot, branch, verbose, options.dryRun]);

  // Phase: Welcome complete
  const handleWelcomeComplete = useCallback(async () => {
    if (options.skipPreflight) {
      // Even when skipping preflight, we need to check if PRD has tasks
      const prdPath = join(ralphDir, "PRD.md");
      const hasTasks = await prdHasTasks(prdPath);
      if (!hasTasks) {
        setPhase("template-select");
      } else {
        setPhase("session-prompt");
      }
    } else {
      setPhase("preflight");
    }
  }, [options.skipPreflight, ralphDir]);

  // Phase: Preflight complete
  const handlePreflightComplete = useCallback(
    (passed: boolean, hasTasks: boolean) => {
      if (!passed) {
        setError(
          "Preflight checks failed. Please fix the issues and try again.",
        );
        setPhase("error");
        return;
      }

      if (!hasTasks) {
        setPhase("template-select");
      } else {
        setPhase("session-prompt");
      }
    },
    [],
  );

  // Phase: Template selected
  const handleTemplateComplete = useCallback(async () => {
    // Re-check if PRD has tasks after template selection
    const prdPath = join(ralphDir, "PRD.md");
    const hasTasks = await prdHasTasks(prdPath);
    if (!hasTasks) {
      setError(
        "PRD.md still has no tasks after editing. Please add tasks and try again.",
      );
      setPhase("error");
      return;
    }
    setPhase("session-prompt");
  }, [ralphDir]);

  // Phase: Template cancelled
  const handleTemplateCancel = useCallback(() => {
    exit();
  }, [exit]);

  // Phase: New session
  const handleNewSession = useCallback(async () => {
    if (!config) return;

    // Create new session
    let targetBranch = branch;

    // Create branch if --branch specified
    if (options.branch && options.branch !== branch) {
      const created = await createBranch(options.branch);
      if (created) {
        targetBranch = options.branch;
        setBranch(targetBranch);
      }
    }

    const newSession = await createSession(targetBranch);
    setSession(newSession);
    await saveSession(ralphDir, newSession);

    // Run beforeRun hook
    const ctx = {
      config,
      session: newSession,
      repoRoot,
      branch: targetBranch,
      verbose,
      dryRun: options.dryRun,
    };
    await runBeforeRun(plugins, ctx);

    setPhase("running");
  }, [
    config,
    branch,
    options.branch,
    options.dryRun,
    plugins,
    ralphDir,
    repoRoot,
    verbose,
  ]);

  // Phase: Resume session
  const handleResumeSession = useCallback(
    async (resumeIteration: number) => {
      if (!config) return;

      const loaded = await loadSession(ralphDir);
      if (!loaded) {
        // Fallback to new session
        await handleNewSession();
        return;
      }

      setSession(loaded);
      setCurrentIteration(resumeIteration);
      setBranch(loaded.branch);

      // Run beforeRun hook
      const ctx = {
        config,
        session: loaded,
        repoRoot,
        branch: loaded.branch,
        verbose,
        dryRun: options.dryRun,
      };
      await runBeforeRun(plugins, ctx);

      setPhase("running");
    },
    [
      config,
      ralphDir,
      repoRoot,
      verbose,
      options.dryRun,
      plugins,
      handleNewSession,
    ],
  );

  // Handle iteration complete
  const handleIterationComplete = useCallback(
    async (result: IterationResult) => {
      if (!config || !session) return;

      // Add result to session
      const updatedSession = await addIterationResult(
        ralphDir,
        session,
        result,
      );
      setSession(updatedSession);

      // Save checkpoint
      await saveCheckpoint(ralphDir, updatedSession, result.iteration);

      // Run afterIteration hook
      const ctx = {
        config,
        session: updatedSession,
        repoRoot,
        branch,
        verbose,
        dryRun: options.dryRun,
        iteration: result.iteration,
        totalIterations,
        result,
      };
      await runAfterIteration(plugins, ctx);

      // Check for PRD complete
      if (result.prdComplete) {
        setPrdComplete(true);
        setPhase("summary");
        return;
      }

      // Check if we've reached total iterations
      if (result.iteration >= totalIterations) {
        setPhase("summary");
        return;
      }

      // Handle retry on failure
      if (!result.success) {
        const maxRetries = config.maxRetries ?? 3;
        if (retryCount < maxRetries) {
          setRetryCount((prev) => prev + 1);
          // Stay on same iteration for retry
          return;
        }
        setError(
          `Iteration ${result.iteration} failed after ${maxRetries} retries.`,
        );
        setPhase("error");
        return;
      }

      // Reset retry count on success
      setRetryCount(0);

      // Move to next iteration
      setCurrentIteration((prev) => prev + 1);
    },
    [
      config,
      session,
      ralphDir,
      repoRoot,
      branch,
      verbose,
      options.dryRun,
      totalIterations,
      plugins,
      retryCount,
    ],
  );

  // Run done plugins when entering summary
  useEffect(() => {
    async function runDonePlugins() {
      if (phase !== "summary" || hasRunDonePluginsRef.current) return;
      hasRunDonePluginsRef.current = true;

      const ctx = getPluginContext();
      if (!ctx) return;

      try {
        await runDone(plugins, ctx);

        // Check for PR URL from plugin
        // (plugin may log it, but we could also track via plugin return values in future)
      } catch (pluginError) {
        if (verbose) {
          console.error("Plugin error:", pluginError);
        }
      }

      // Send notification
      if (config?.soundOnComplete) {
        notify(
          "Ralph Complete",
          `Finished ${session?.iterations.length ?? 0} iterations`,
          {
            sound: config.notificationSound,
          },
        );
      }
    }
    void runDonePlugins();
  }, [phase, plugins, getPluginContext, config, session, verbose]);

  // Run onError hook
  const runErrorHook = useCallback(
    async (err: Error) => {
      const ctx = getPluginContext();
      if (ctx) {
        await runOnError(plugins, ctx, err);
      }
    },
    [getPluginContext, plugins],
  );

  // Handle error with hook
  useEffect(() => {
    if (error && phase === "error") {
      void runErrorHook(new Error(error));
    }
  }, [error, phase, runErrorHook]);

  // Render loading state
  if (!config) {
    return (
      <Box>
        <Text color="gray">Loading configuration...</Text>
      </Box>
    );
  }

  // Render based on phase
  return (
    <Box flexDirection="column">
      {phase === "welcome" && <Welcome onComplete={handleWelcomeComplete} />}

      {phase === "preflight" && (
        <Preflight
          ralphDir={ralphDir}
          onComplete={handlePreflightComplete}
          skip={options.skipPreflight}
        />
      )}

      {phase === "template-select" && (
        <TemplateSelector
          ralphDir={ralphDir}
          onComplete={handleTemplateComplete}
          onCancel={handleTemplateCancel}
        />
      )}

      {phase === "session-prompt" && (
        <SessionPrompt
          ralphDir={ralphDir}
          onNewSession={handleNewSession}
          onResumeSession={handleResumeSession}
          forceNew={options.reset}
          forceResume={options.resume}
        />
      )}

      {phase === "running" && session && (
        <Box flexDirection="column">
          <IterationRunner
            config={config}
            ralphDir={ralphDir}
            prompt={prompt}
            iteration={currentIteration}
            totalIterations={totalIterations}
            onComplete={handleIterationComplete}
            verbose={verbose}
            debug={debug}
          />
          <Box marginTop={1}>
            <KeyboardShortcuts verbose={verbose} debug={debug} />
          </Box>
        </Box>
      )}

      {phase === "summary" && session && (
        <SummaryView
          session={session}
          prdComplete={prdComplete}
          prUrl={prUrl}
          isInterrupted={isInterruptedRef.current}
        />
      )}

      {phase === "error" && (
        <Box flexDirection="column" marginY={1}>
          <Text color="red" bold>
            Error
          </Text>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Summary view component
 */
function SummaryView({
  session,
  prdComplete,
  prUrl,
  isInterrupted,
}: {
  session: SessionState;
  prdComplete: boolean;
  prUrl?: string;
  isInterrupted: boolean;
}) {
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

  useEffect(() => {
    async function loadSummaryData() {
      const [diffStats, commitList] = await Promise.all([
        getDiffStats(session.startCommit),
        getCommitsSince(session.startCommit),
      ]);
      setFilesChanged(diffStats);
      setCommits(commitList);
    }
    void loadSummaryData();
  }, [session.startCommit]);

  const summary = createSummary({
    iterations: session.iterations,
    commits,
    filesChanged,
    prUrl,
  });

  // Override prdComplete if detected
  if (prdComplete && !summary.prdComplete) {
    summary.prdComplete = true;
  }

  return (
    <Box flexDirection="column">
      {isInterrupted && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Interrupted - showing summary of completed work
          </Text>
        </Box>
      )}
      <Summary summary={summary} />
    </Box>
  );
}
