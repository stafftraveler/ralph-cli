import type { Server } from "node:http";
import { join } from "node:path";
import { Box, Text, useApp } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoExit } from "../hooks/use-auto-exit.js";
import { createBranch, getCurrentBranch, getRepoRoot } from "../hooks/use-git.js";
import { useKeyboardShortcuts } from "../hooks/use-keyboard.js";
import { useSummaryData } from "../hooks/use-summary-data.js";
import { useTunnel } from "../hooks/use-tunnel.js";
import { loadConfig } from "../lib/config.js";
import { notify } from "../lib/notify.js";
import {
  loadPlugins,
  runAfterIteration,
  runBeforeIteration,
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
import { formatCost, resetPrdAndProgress, writeIterationLog } from "../lib/utils.js";
import {
  setIterationsChangeHandler,
  setPauseAfterIterationHandler,
  setStopSessionHandler,
  startWebServer,
  stopWebServer,
  updateServerState,
} from "../lib/webserver.js";
import type {
  AppPhase,
  CliOptions,
  IterationResult,
  PluginContext,
  RalphConfig,
  RalphPlugin,
  SessionState,
} from "../types.js";
import { IterationRunner } from "./IterationRunner.js";
import { IterationsPrompt } from "./IterationsPrompt.js";
import { KeyboardShortcuts } from "./KeyboardShortcuts.js";
import { Preflight } from "./Preflight.js";
import { SessionPrompt } from "./SessionPrompt.js";
import { StatusBar } from "./StatusBar.js";
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
  const [totalIterations, setTotalIterations] = useState(options.iterations ?? 10);
  const [prdComplete, setPrdComplete] = useState(false);
  const [pauseAfterIteration, setPauseAfterIteration] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Track if we should show summary on exit
  const shouldShowSummaryRef = useRef(false);
  const isInterruptedRef = useRef(false);
  const hasRunDonePluginsRef = useRef(false);

  // Web server and cloudflared state
  const serverRef = useRef<Server | null>(null);
  const [currentStatus, setCurrentStatus] = useState("Starting...");
  const WEB_SERVER_PORT = 3737;

  // Start tunnel for web dashboard (only when running)
  const tunnelState = useTunnel(WEB_SERVER_PORT, phase === "running");

  // Handler for quit (shared between keyboard and dashboard)
  const handleQuit = useCallback(() => {
    isInterruptedRef.current = true;
    if (session && session.iterations.length > 0) {
      shouldShowSummaryRef.current = true;
      setPhase("summary");
    } else {
      exit();
    }
  }, [session, exit]);

  // Keyboard shortcuts
  const [keyboardState, keyboardActions] = useKeyboardShortcuts({
    isActive: phase === "running",
    onQuit: handleQuit,
    onTogglePause: useCallback(() => {
      setPauseAfterIteration((prev) => !prev);
    }, []),
    onIncrementIterations: useCallback(() => {
      setTotalIterations((prev) => prev + 1);
    }, []),
    onDecrementIterations: useCallback(() => {
      setTotalIterations((prev) => Math.max(prev - 1, currentIteration));
    }, [currentIteration]),
  });

  // Sync pause state between keyboard and external sources (dashboard)
  useEffect(() => {
    if (keyboardState.pauseAfterIteration !== pauseAfterIteration) {
      keyboardActions.setPauseAfterIteration(pauseAfterIteration);
    }
  }, [pauseAfterIteration, keyboardState.pauseAfterIteration, keyboardActions]);

  // Merge verbose/debug from CLI and keyboard toggles
  const verbose = options.verbose || keyboardState.verbose;
  const debug = options.debug || keyboardState.debug;

  // Initialize on mount
  useEffect(() => {
    async function initialize() {
      // Handle --reset flag early - reset and exit
      if (options.reset) {
        await resetPrdAndProgress(ralphDir);
        await clearSession(ralphDir);
        console.log("\n✓ Reset complete");
        console.log("  - PRD.md replaced with empty template");
        console.log("  - progress.txt cleared");
        console.log("  - session.json cleared\n");
        exit();
        return;
      }

      const [loadedConfig, root, currentBranch] = await Promise.all([
        loadConfig(ralphDir),
        getRepoRoot(),
        getCurrentBranch(),
      ]);

      // Override maxCostPerSession with CLI --max-cost flag if provided
      const mergedConfig = {
        ...loadedConfig,
        maxCostPerSession: options.maxCost ?? loadedConfig.maxCostPerSession,
      };

      setConfig(mergedConfig);
      setRepoRoot(root ?? "");
      setBranch(currentBranch ?? "");

      // Sync default iterations from config if not provided via CLI
      if (options.iterations === undefined) {
        setTotalIterations(mergedConfig.defaultIterations);
      }

      // Load plugins unless disabled
      if (!options.noPlugins) {
        const loadedPlugins = await loadPlugins(ralphDir);
        setPlugins(loadedPlugins);
      }
    }
    void initialize();
  }, [ralphDir, options.noPlugins, options.reset, options.maxCost, options.iterations, exit]);

  // Start/stop web server based on phase
  useEffect(() => {
    if (phase === "running") {
      // Set up handler for dashboard iteration adjustments
      setIterationsChangeHandler((newTotal) => {
        setTotalIterations(newTotal);
      });

      // Set up handler for dashboard pause toggle
      setPauseAfterIterationHandler((pause) => {
        setPauseAfterIteration(pause);
      });

      // Set up handler for dashboard stop button
      setStopSessionHandler(() => {
        handleQuit();
      });

      // Start web server when entering running phase
      startWebServer(WEB_SERVER_PORT)
        .then((server) => {
          serverRef.current = server;
        })
        .catch((err) => {
          if (debug) {
            console.error("Failed to start web server:", err);
          }
        });
    }

    return () => {
      // Cleanup web server when leaving running phase
      if (serverRef.current) {
        stopWebServer(serverRef.current).catch(() => {
          // Ignore errors
        });
        serverRef.current = null;
      }
    };
  }, [phase, debug, handleQuit]);

  // Update web server state whenever session or iteration changes
  useEffect(() => {
    if (phase === "running" && session) {
      updateServerState({
        session,
        currentIteration,
        totalIterations,
        status: currentStatus,
        ralphDir,
        isPausedAfterIteration: pauseAfterIteration,
      });
    }
  }, [
    phase,
    session,
    currentIteration,
    totalIterations,
    currentStatus,
    ralphDir,
    pauseAfterIteration,
  ]);

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
  const handleWelcomeComplete = useCallback(() => {
    // If iterations not specified via CLI, prompt for them
    if (options.iterations === undefined) {
      setPhase("iterations-prompt");
    } else {
      setPhase("preflight");
    }
  }, [options.iterations]);

  // Phase: Iterations prompt complete
  const handleIterationsSubmit = useCallback(
    async (iterations: number) => {
      setTotalIterations(iterations);

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
    },
    [options.skipPreflight, ralphDir],
  );

  // Phase: Preflight complete
  const handlePreflightComplete = useCallback((passed: boolean, hasTasks: boolean) => {
    if (!passed) {
      setError("Preflight checks failed. Please fix the issues and try again.");
      setPhase("error");
      return;
    }

    if (!hasTasks) {
      setPhase("template-select");
    } else {
      setPhase("session-prompt");
    }
  }, []);

  // Phase: Template selected
  const handleTemplateComplete = useCallback(async () => {
    // Re-check if PRD has tasks after template selection
    const prdPath = join(ralphDir, "PRD.md");
    const hasTasks = await prdHasTasks(prdPath);
    if (!hasTasks) {
      setError("PRD.md still has no tasks after editing. Please add tasks and try again.");
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
  const handleNewSession = useCallback(
    async (branchName?: string) => {
      if (!config) return;

      // Create new session
      let targetBranch = branch;

      // Priority: CLI --branch flag > prompt input > current branch
      const requestedBranch = options.branch ?? branchName;

      if (requestedBranch && requestedBranch !== branch) {
        const created = await createBranch(requestedBranch);
        if (created) {
          targetBranch = requestedBranch;
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

      // Run beforeIteration hook for the first iteration
      const firstIterationCtx = {
        ...ctx,
        iteration: 1,
        totalIterations,
      };
      await runBeforeIteration(plugins, firstIterationCtx);

      setPhase("running");
    },
    [
      config,
      branch,
      options.branch,
      options.dryRun,
      plugins,
      ralphDir,
      repoRoot,
      verbose,
      totalIterations,
    ],
  );

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
      // Adjust total iterations: add the requested iterations to the resume point
      // e.g., resuming at iteration 6 with 5 iterations = "Iteration 6 of 11"
      setTotalIterations((prev) => prev + resumeIteration);
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

      // Run beforeIteration hook for the resumed iteration
      const resumedIterationCtx = {
        ...ctx,
        iteration: resumeIteration,
        totalIterations: totalIterations + resumeIteration,
      };
      await runBeforeIteration(plugins, resumedIterationCtx);

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
      totalIterations,
    ],
  );

  // Handle iteration complete
  const handleIterationComplete = useCallback(
    async (result: IterationResult) => {
      if (!config || !session) return;

      // Add result to session
      const updatedSession = await addIterationResult(ralphDir, session, result);
      setSession(updatedSession);

      // Save checkpoint
      await saveCheckpoint(ralphDir, updatedSession, result.iteration);

      // Save iteration log if enabled
      const shouldSaveOutput = options.logs || config.saveOutput;
      if (shouldSaveOutput) {
        await writeIterationLog(ralphDir, config.outputDir, result);
      }

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

      // Check if pause after iteration was requested
      if (pauseAfterIteration) {
        isInterruptedRef.current = true;
        shouldShowSummaryRef.current = true;
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
        setError(`Iteration ${result.iteration} failed after ${maxRetries} retries.`);
        setPhase("error");
        return;
      }

      // Reset retry count on success
      setRetryCount(0);

      // Check cost limit before starting next iteration
      const sessionCost = updatedSession.totalCostUsd ?? 0;
      const maxCostPerSession = config.maxCostPerSession;

      if (maxCostPerSession !== undefined && sessionCost >= maxCostPerSession) {
        setError(
          `Session cost limit reached: ${formatCost(sessionCost)} / ${formatCost(maxCostPerSession)}. ` +
            `Stopping after iteration ${result.iteration} of ${totalIterations}.`,
        );
        setPhase("summary");
        return;
      }

      // Move to next iteration
      const nextIteration = result.iteration + 1;
      setCurrentIteration(nextIteration);

      // Run beforeIteration hook for the next iteration
      // Note: This fires slightly before the iteration actually starts (when React re-renders)
      const nextCtx = {
        config,
        session: updatedSession,
        repoRoot,
        branch,
        verbose,
        dryRun: options.dryRun,
        iteration: nextIteration,
        totalIterations,
      };
      await runBeforeIteration(plugins, nextCtx);
    },
    [
      config,
      session,
      ralphDir,
      repoRoot,
      branch,
      verbose,
      options.dryRun,
      options.logs,
      totalIterations,
      plugins,
      retryCount,
      pauseAfterIteration,
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
        notify("Ralph Complete", `Finished ${session?.iterations.length ?? 0} iterations`, {
          sound: config.notificationSound,
        });
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

      {phase === "iterations-prompt" && (
        <IterationsPrompt
          onSubmit={handleIterationsSubmit}
          defaultValue={config.defaultIterations}
        />
      )}

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
          config={config}
          onComplete={handleTemplateComplete}
          onCancel={handleTemplateCancel}
        />
      )}

      {phase === "session-prompt" && (
        <SessionPrompt
          ralphDir={ralphDir}
          currentBranch={branch}
          onNewSession={handleNewSession}
          onResumeSession={handleResumeSession}
          forceNew={options.reset}
          forceResume={options.resume}
          skipBranchPrompt={!!options.branch}
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
            onStatusChange={setCurrentStatus}
            verbose={verbose}
            debug={debug}
            sessionCostSoFar={session.totalCostUsd ?? 0}
            previousIterations={session.iterations}
          />
          <Box marginTop={1}>
            <KeyboardShortcuts
              verbose={verbose}
              debug={debug}
              pauseAfterIteration={pauseAfterIteration || keyboardState.pauseAfterIteration}
              totalIterations={totalIterations}
            />
          </Box>
          <StatusBar
            url={tunnelState.url}
            isConnecting={tunnelState.isConnecting}
            error={tunnelState.error}
            isReconnecting={tunnelState.isReconnecting}
            reconnectAttempts={tunnelState.reconnectAttempts}
          />
        </Box>
      )}

      {phase === "summary" && session && (
        <SummaryView
          session={session}
          prdComplete={prdComplete}
          isInterrupted={isInterruptedRef.current}
          onExit={exit}
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
  isInterrupted,
  onExit,
}: {
  session: SessionState;
  prdComplete: boolean;
  isInterrupted: boolean;
  onExit: () => void;
}) {
  const { filesChanged, commits, isLoaded } = useSummaryData(session.startCommit);

  // Auto-exit after showing summary
  useAutoExit(isLoaded, isInterrupted, onExit);

  const summary = createSummary({
    iterations: session.iterations,
    commits,
    filesChanged,
  });

  // Override prdComplete if detected
  if (prdComplete && !summary.prdComplete) {
    summary.prdComplete = true;
  }

  return (
    <Box flexDirection="column">
      {isInterrupted && (
        <Box marginBottom={1}>
          <Text color="yellow">Interrupted - showing summary of completed work</Text>
        </Box>
      )}
      <Summary summary={summary} />
    </Box>
  );
}
