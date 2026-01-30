#!/usr/bin/env node

/**
 * Postinstall script - shows helpful setup instructions after package installation
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

const isGlobalInstall = !process.env.npm_config_local_prefix;

console.log(chalk.bold.cyan("\n═══ Ralph CLI Installed ═══\n"));

if (isGlobalInstall) {
  console.log(chalk.green("Ralph has been installed globally!"));
  console.log("\nTo use Ralph in any git repository:");
  console.log(chalk.cyan("  1. cd /path/to/your/project"));
  console.log(chalk.cyan("  2. ralph init"));
  console.log(chalk.cyan("  3. Edit .ralph/PRD.md with your tasks"));
  console.log(chalk.cyan("  4. ralph 5"));
} else {
  // Check if we're in the ralph-cli repo itself
  const cwd = process.cwd();
  const isRalphCliRepo = existsSync(join(cwd, "bin", "ralph"));

  if (isRalphCliRepo) {
    console.log(chalk.dim("Installed in development mode - skipping setup instructions"));
  } else {
    console.log(chalk.green("Ralph has been installed as a dependency!"));
    console.log("\nNext steps:");
    console.log(chalk.cyan("  1. npx ralph init"));
    console.log(chalk.cyan("  2. Edit .ralph/PRD.md with your tasks"));
    console.log(chalk.cyan("  3. pnpm ralph 5"));

    console.log(chalk.dim("\nTip: ralph init will add a 'ralph' script to your package.json"));
  }
}

console.log(chalk.dim("\nDocumentation: https://github.com/stafftraveler/ralph-cli#readme"));
console.log("");
