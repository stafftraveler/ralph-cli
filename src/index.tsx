import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";
import { render } from "ink";
import { findRalphDir, runCli, showDebugInfo, showDryRunInfo } from "./cli.js";
import { runInit } from "./commands/init.js";
import { App } from "./components/App.js";
import { getRepoRoot } from "./hooks/use-git.js";

/**
 * Load prompt from .ralph/prompt.md
 */
async function loadPrompt(ralphDir: string): Promise<string> {
  const promptPath = join(ralphDir, "prompt.md");
  try {
    return await readFile(promptPath, "utf-8");
  } catch {
    throw new Error(`Could not read prompt file: ${promptPath}`);
  }
}

/**
 * Prompt user for number of iterations using stdin
 */
async function promptForIterations(): Promise<number> {
  process.stdout.write(chalk.cyan("Number of iterations: "));

  return new Promise((resolve) => {
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      const input = data.toString().trim();
      const parsed = Number.parseInt(input, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        console.log(chalk.yellow("Invalid input, using 1 iteration"));
        resolve(1);
      } else {
        resolve(parsed);
      }
    });
  });
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

    // Load the prompt
    const prompt = await loadPrompt(ralphDir);

    // Determine iterations
    let iterations = options.iterations;
    if (iterations === undefined) {
      iterations = await promptForIterations();
    }

    // Update options with resolved iterations
    const resolvedOptions = {
      ...options,
      iterations,
    };

    // Render the Ink app
    const { waitUntilExit } = render(
      <App ralphDir={ralphDir} prompt={prompt} options={resolvedOptions} />,
    );

    // Wait for the app to finish
    await waitUntilExit();
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      console.error(chalk.red("An unknown error occurred"));
    }
    process.exit(1);
  }
}

// Run main
void main();
