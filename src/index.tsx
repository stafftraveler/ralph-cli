import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";
import { render } from "ink";
import { findRalphDir, runCli, showDebugInfo, showDryRunInfo } from "./cli.js";
import { runInit } from "./commands/init.js";
import { runCi } from "./commands/run-ci.js";
import { App } from "./components/App.js";
import { getRepoRoot } from "./hooks/use-git.js";
import { startCaffeinate, stopCaffeinate } from "./lib/caffeinate.js";
import { createFileNotFoundError, debugLog, wrapError } from "./lib/utils.js";
import { RalphError } from "./types.js";

/**
 * Load prompt from .ralph/prompt.md
 */
async function loadPrompt(ralphDir: string): Promise<string> {
  const promptPath = join(ralphDir, "prompt.md");
  try {
    return await readFile(promptPath, "utf-8");
  } catch (error) {
    const ralphError =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? createFileNotFoundError(
            promptPath,
            "Run 'npx ralph init' to create the prompt.md template file",
          )
        : wrapError(error, `Could not read prompt file at ${promptPath}`);
    throw ralphError;
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Parse CLI arguments
    const { command, options } = await runCli();

    // Handle init command
    if (command === "init") {
      const repoRoot = await getRepoRoot();
      if (!repoRoot) {
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }
      const success = await runInit(repoRoot);
      process.exit(success ? 0 : 1);
    }

    // Run command - find ralph directory
    const ralphDir = await findRalphDir();
    if (!ralphDir || !existsSync(ralphDir)) {
      console.error(chalk.red("No .ralph/ directory found."));
      console.error(chalk.dim("Run 'ralph init' to set up the project."));
      process.exit(1);
    }

    // Handle debug info
    if (options.debug) {
      await showDebugInfo(ralphDir);
    }

    // Handle dry run
    if (options.dryRun) {
      await showDryRunInfo(ralphDir, options);
      process.exit(0);
    }

    // Start caffeinate to prevent system sleep while running
    startCaffeinate(options.debug);

    // Load the prompt
    const prompt = await loadPrompt(ralphDir);

    // For CI mode, default iterations to 1 if not specified
    const resolvedOptions =
      options.ci && options.iterations === undefined ? { ...options, iterations: 1 } : options;

    // Use CI mode if requested or if stdin is not a TTY
    if (options.ci || !process.stdin.isTTY) {
      await runCi(ralphDir, prompt, resolvedOptions);
      stopCaffeinate(options.debug);
      return;
    }

    // Render the Ink app (iterations prompt is shown inside App if not specified)
    const { waitUntilExit } = render(<App ralphDir={ralphDir} prompt={prompt} options={options} />);

    // Wait for the app to finish
    await waitUntilExit();

    // Stop caffeinate and exit cleanly
    stopCaffeinate(options.debug);
    process.exit(0);
  } catch (error) {
    // Ensure caffeinate is stopped on error
    stopCaffeinate();
    if (error instanceof RalphError) {
      console.error(chalk.red("\nError occurred:"));
      console.error(error.format());
      if (process.env.DEBUG && error.context?.originalError) {
        console.error(chalk.dim("\nOriginal error stack:"));
        console.error(error.context.originalError.stack);
      }
    } else if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
      debugLog("Error stack:", error.stack);
    } else {
      console.error(chalk.red("An unknown error occurred"));
    }
    process.exit(1);
  }
}

// Run main
void main();
