import chalk from "chalk";
import { runPreflightChecks } from "../hooks/use-preflight.js";
import { runClaude } from "../lib/claude.js";
import { loadConfig } from "../lib/config.js";
import type { CliOptions, IterationResult } from "../types.js";

/**
 * Format duration in human-readable format
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

/**
 * Format cost in USD
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Run Ralph in CI mode (non-interactive)
 */
export async function runCi(
  ralphDir: string,
  prompt: string,
  options: CliOptions,
): Promise<void> {
  const config = await loadConfig(ralphDir);
  const iterations = options.iterations ?? 1;

  console.log(chalk.bold.cyan("\n═══ Ralph CI Mode ═══\n"));
  console.log(`Iterations: ${iterations}`);
  console.log(`Ralph Dir:  ${ralphDir}`);
  console.log("");

  // Run preflight checks unless skipped
  if (!options.skipPreflight) {
    console.log(chalk.bold("Preflight Checks:"));
    const { results, allPassed, prdHasTasks } =
      await runPreflightChecks(ralphDir);

    for (const [_key, check] of Object.entries(results)) {
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

    if (!allPassed) {
      console.log(chalk.red("\nPreflight checks failed. Exiting."));
      process.exit(1);
    }

    if (!prdHasTasks) {
      console.log(
        chalk.yellow("\nPRD has no tasks. Please add tasks to PRD.md."),
      );
      process.exit(1);
    }

    console.log(chalk.green("\nAll preflight checks passed!\n"));
  }

  // Run iterations
  const results: IterationResult[] = [];
  let totalCost = 0;
  let sessionId: string | undefined;

  for (let i = 1; i <= iterations; i++) {
    console.log(chalk.bold(`\n═══ Iteration ${i}/${iterations} ═══\n`));
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    try {
      const result = await runClaude(config, {
        ralphDir,
        prompt,
        verbose: options.verbose,
        debug: options.debug,
        resumeSessionId: sessionId,
        onStdout: (chunk) => {
          if (options.verbose) {
            process.stdout.write(chunk);
          }
        },
        onStatus: (status) => {
          console.log(chalk.dim(`  ${status}`));
        },
      });

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const completedAt = new Date().toISOString();

      // Store session ID for next iteration
      if (result.sessionId) {
        sessionId = result.sessionId;
      }

      // Track cost
      if (result.usage) {
        totalCost += result.usage.totalCostUsd;
      }

      const iterationResult: IterationResult = {
        iteration: i,
        startedAt,
        completedAt,
        durationSeconds,
        success: result.success,
        output: result.output,
        usage: result.usage,
        prdComplete: result.prdComplete,
      };
      results.push(iterationResult);

      // Print summary
      console.log("");
      if (result.success) {
        console.log(
          chalk.green(
            `✓ Iteration ${i} completed in ${formatDuration(durationSeconds)}`,
          ),
        );
      } else {
        console.log(
          chalk.red(
            `✗ Iteration ${i} failed: ${result.error || "Unknown error"}`,
          ),
        );
      }

      if (result.usage) {
        console.log(
          chalk.dim(
            `  Tokens: ${result.usage.inputTokens.toLocaleString()} in / ${result.usage.outputTokens.toLocaleString()} out`,
          ),
        );
        console.log(
          chalk.dim(`  Cost: ${formatCost(result.usage.totalCostUsd)}`),
        );
      }

      // Check if PRD is complete
      if (result.prdComplete) {
        console.log(chalk.green.bold("\n🎉 PRD Complete! All tasks finished."));
        break;
      }

      // Check if iteration failed
      if (!result.success) {
        console.log(chalk.red("\nIteration failed. Stopping."));
        break;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.log(chalk.red(`\n✗ Iteration ${i} error: ${errorMessage}`));
      break;
    }
  }

  // Print final summary
  console.log(chalk.bold.cyan("\n═══ Session Summary ═══\n"));
  console.log(`Total Iterations: ${results.length}`);
  console.log(
    `Total Duration:   ${formatDuration(results.reduce((sum, r) => sum + r.durationSeconds, 0))}`,
  );
  console.log(`Total Cost:       ${formatCost(totalCost)}`);

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Successful:       ${successful}`);
  if (failed > 0) {
    console.log(chalk.red(`Failed:           ${failed}`));
  }

  const prdComplete = results.some((r) => r.prdComplete);
  if (prdComplete) {
    console.log(chalk.green(`PRD Status:       Complete`));
  } else {
    console.log(chalk.yellow(`PRD Status:       In Progress`));
  }

  console.log(chalk.cyan("\n═══ End Session ═══\n"));

  // Exit with error if any iteration failed
  if (failed > 0) {
    process.exit(1);
  }
}
