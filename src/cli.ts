import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { getCurrentBranch, getRepoRoot } from "./hooks/use-git.js";
import { runPreflightChecks } from "./hooks/use-preflight.js";
import { loadConfig } from "./lib/config.js";
import { prdHasTasks } from "./lib/prd.js";
import type { CliOptions } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get package version from package.json
 */
async function getVersion(): Promise<string> {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

/**
 * Get .ralph directory path (searches up from cwd)
 */
export async function findRalphDir(): Promise<string | null> {
  const repoRoot = await getRepoRoot();
  if (!repoRoot) return null;
  return join(repoRoot, ".ralph");
}

/**
 * Enhanced dry-run output showing config, PRD analysis, and prompt preview
 */
async function showDryRunInfo(
  ralphDir: string,
  options: CliOptions,
): Promise<void> {
  console.log(chalk.bold.cyan("\n═══ Ralph Dry Run ═══\n"));

  // Load and display config
  const config = await loadConfig(ralphDir);
  console.log(chalk.bold("Configuration:"));
  console.log(`  Max Retries:    ${config.maxRetries}`);
  console.log(
    `  Sound:          ${config.soundOnComplete ? "enabled" : "disabled"}`,
  );
  console.log(
    `  Save Output:    ${options.saveOutput || config.saveOutput ? "yes" : "no"}`,
  );
  console.log(`  Output Dir:     ${config.outputDir}`);
  console.log("");

  // CLI options
  console.log(chalk.bold("CLI Options:"));
  console.log(`  Iterations:     ${options.iterations ?? "not specified"}`);
  console.log(`  Verbose:        ${options.verbose ? "yes" : "no"}`);
  console.log(`  Debug:          ${options.debug ? "yes" : "no"}`);
  console.log(`  Skip Preflight: ${options.skipPreflight ? "yes" : "no"}`);
  console.log(`  Branch:         ${options.branch ?? "current"}`);
  console.log(`  Resume:         ${options.resume ? "yes" : "no"}`);
  console.log(`  No Plugins:     ${options.noPlugins ? "yes" : "no"}`);
  console.log(`  Create PR:      ${options.createPr ? "yes" : "no"}`);
  console.log("");

  // PRD analysis
  const prdPath = join(ralphDir, "PRD.md");
  const hasTasks = await prdHasTasks(prdPath);
  console.log(chalk.bold("PRD Analysis:"));
  console.log(`  Path:           ${prdPath}`);
  console.log(
    `  Has Tasks:      ${hasTasks ? chalk.green("yes") : chalk.yellow("no (will prompt for template)")}`,
  );

  // Count tasks in PRD
  try {
    const prdContent = await readFile(prdPath, "utf-8");
    const taskPattern = /^[\s]*(?:[-*]|\d+\.)\s+(?!\.\.\.)(?!\s*$).+/gm;
    const matches = prdContent.match(taskPattern);
    const taskCount = matches?.length ?? 0;
    console.log(`  Task Count:     ${taskCount}`);

    // Show first few tasks
    if (matches && matches.length > 0) {
      console.log(`  Tasks Preview:`);
      const preview = matches.slice(0, 3);
      for (const task of preview) {
        const trimmed = task.trim().slice(0, 60);
        console.log(`    ${trimmed}${task.length > 60 ? "..." : ""}`);
      }
      if (matches.length > 3) {
        console.log(`    ... and ${matches.length - 3} more`);
      }
    }
  } catch {
    console.log(`  Task Count:     ${chalk.red("(unable to read PRD)")}`);
  }
  console.log("");

  // Prompt preview
  const promptPath = join(ralphDir, "prompt.md");
  console.log(chalk.bold("Prompt Preview:"));
  try {
    const promptContent = await readFile(promptPath, "utf-8");
    const preview = promptContent
      .slice(0, 200)
      .split("\n")
      .slice(0, 5)
      .join("\n");
    console.log(chalk.dim(preview));
    if (promptContent.length > 200) {
      console.log(chalk.dim(`... (${promptContent.length} chars total)`));
    }
  } catch {
    console.log(chalk.red(`  Prompt file not found: ${promptPath}`));
  }
  console.log("");

  // Preflight check preview
  if (!options.skipPreflight) {
    console.log(chalk.bold("Preflight Checks:"));
    const { results } = await runPreflightChecks(ralphDir);
    for (const [_name, check] of Object.entries(results)) {
      const icon =
        check.status === "passed"
          ? chalk.green("✓")
          : check.status === "warning"
            ? chalk.yellow("⚠")
            : chalk.red("✗");
      console.log(
        `  ${icon} ${check.name}: ${check.message || check.error || ""}`,
      );
    }
    console.log("");
  }

  console.log(chalk.cyan("═══ End Dry Run ═══\n"));
}

/**
 * Show debug information about the environment
 */
async function showDebugInfo(ralphDir: string): Promise<void> {
  console.log(chalk.bold.magenta("\n═══ Debug Info ═══\n"));

  // Environment
  console.log(chalk.bold("Environment:"));
  console.log(`  Node Version:   ${process.version}`);
  console.log(`  Platform:       ${process.platform}`);
  console.log(`  Arch:           ${process.arch}`);
  console.log(`  CWD:            ${process.cwd()}`);
  console.log(`  Ralph Dir:      ${ralphDir}`);
  console.log("");

  // Git info
  const repoRoot = await getRepoRoot();
  const branch = await getCurrentBranch();
  console.log(chalk.bold("Git:"));
  console.log(`  Repo Root:      ${repoRoot ?? "not found"}`);
  console.log(`  Branch:         ${branch ?? "not found"}`);
  console.log("");

  // Claude command that would be executed
  console.log(chalk.bold("Claude Command:"));
  console.log(chalk.dim("  claude --permission-mode acceptEdits \\"));
  console.log(
    chalk.dim(
      `    -p "@${ralphDir}/PRD.md @${ralphDir}/progress.txt <prompt>"`,
    ),
  );
  console.log("");

  console.log(chalk.magenta("═══ End Debug ═══\n"));
}

/**
 * Parse CLI arguments and return options
 */
export interface ParsedArgs {
  options: CliOptions;
  command: "run" | "init";
}

// Module-level state for command tracking (Commander action callbacks)
let _parsedResult: ParsedArgs | null = null;

/**
 * Create and configure the CLI program
 */
export async function createProgram(): Promise<Command> {
  const version = await getVersion();

  // Reset state for fresh parsing
  _parsedResult = null;

  const program = new Command()
    .name("ralph")
    .description("Interactive CLI for running Claude Code iterations")
    .version(version)
    .allowUnknownOption(false)
    .allowExcessArguments(false);

  // Run subcommand (explicit, so positional arg works with init)
  program
    .command("run", { isDefault: true })
    .description("Run Claude Code iterations (default command)")
    .argument("[iterations]", "Number of iterations to run")
    .option("-v, --verbose", "Show full Claude output", false)
    .option(
      "--dry-run",
      "Show what would be executed without running Claude",
      false,
    )
    .option("--skip-preflight", "Skip all preflight checks", false)
    .option("-b, --branch <name>", "Create or switch to a git branch")
    .option(
      "--save-output",
      "Save each iteration's output to .ralph/logs/",
      false,
    )
    .option(
      "--reset",
      "Reset PRD.md and progress.txt for a fresh session",
      false,
    )
    .option(
      "--debug",
      "Show docker commands, timings, and environment info",
      false,
    )
    .option("--resume", "Resume from last checkpoint", false)
    .option("--no-plugins", "Disable all plugins")
    .option("--create-pr", "Force create PR on completion", false)
    .action((iterations, opts) => {
      let parsedIterations: number | undefined;
      if (iterations) {
        const parsed = Number.parseInt(iterations, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          parsedIterations = parsed;
        }
      }

      _parsedResult = {
        command: "run",
        options: {
          verbose: opts.verbose ?? false,
          dryRun: opts.dryRun ?? false,
          skipPreflight: opts.skipPreflight ?? false,
          branch: opts.branch,
          saveOutput: opts.saveOutput ?? false,
          reset: opts.reset ?? false,
          debug: opts.debug ?? false,
          resume: opts.resume ?? false,
          noPlugins: opts.plugins === false, // --no-plugins sets plugins to false
          createPr: opts.createPr ?? false,
          iterations: parsedIterations,
        },
      };
    });

  // Init subcommand
  program
    .command("init")
    .description("Initialize .ralph/ directory with templates")
    .action(() => {
      _parsedResult = {
        command: "init",
        options: {
          verbose: false,
          dryRun: false,
          skipPreflight: false,
          saveOutput: false,
          reset: false,
          debug: false,
          resume: false,
          noPlugins: false,
          createPr: false,
        },
      };
    });

  return program;
}

/**
 * Get parsed arguments after program.parse()
 */
export function getParsedArgs(): ParsedArgs {
  if (!_parsedResult) {
    // Default to run command with no options
    return {
      command: "run",
      options: {
        verbose: false,
        dryRun: false,
        skipPreflight: false,
        saveOutput: false,
        reset: false,
        debug: false,
        resume: false,
        noPlugins: false,
        createPr: false,
      },
    };
  }
  return _parsedResult;
}

/**
 * Main CLI entry point
 */
export async function runCli(
  argv: string[] = process.argv,
): Promise<ParsedArgs> {
  const program = await createProgram();
  await program.parseAsync(argv);
  return getParsedArgs();
}

// Export dry-run and debug utilities for use by App component
export { showDryRunInfo, showDebugInfo };
