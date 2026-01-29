import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { hasApiKey, isClaudeCodeInstalled, setApiKey } from "../lib/claude.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to bundled templates directory */
function getTemplatesDir(): string {
  return join(__dirname, "..", "templates");
}

/** Add ralph script to package.json */
async function addRalphScript(repoRoot: string): Promise<boolean> {
  const pkgPath = join(repoRoot, "package.json");

  if (!existsSync(pkgPath)) {
    console.log(
      chalk.yellow("No package.json found, skipping script addition."),
    );
    return false;
  }

  try {
    const pkgContent = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);

    if (!pkg.scripts) {
      pkg.scripts = {};
    }

    if (pkg.scripts.ralph) {
      console.log(chalk.dim('Script "ralph" already exists in package.json'));
      return true;
    }

    pkg.scripts.ralph = "npx ralph";

    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(chalk.green('Added "ralph" script to package.json'));
    return true;
  } catch (error) {
    console.error(chalk.red("Failed to update package.json:"), error);
    return false;
  }
}

/** Prompt user for yes/no confirmation */
async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(chalk.cyan(`${question} (y/N): `));
    rl.close();
    return answer.trim().toLowerCase() === "y";
  } catch {
    rl.close();
    return false;
  }
}

/** Copy file, optionally overwriting if it exists */
async function copyTemplate(
  src: string,
  dest: string,
  name: string,
  shouldOverwrite: boolean,
): Promise<boolean> {
  const alreadyExists = existsSync(dest);

  if (alreadyExists && !shouldOverwrite) {
    console.log(chalk.dim(`${name} already exists, skipping`));
    return false;
  }

  try {
    await copyFile(src, dest);
    const action = alreadyExists ? "Updated" : "Created";
    console.log(chalk.green(`${action} ${name}`));
    return true;
  } catch (error) {
    console.error(chalk.red(`Failed to create ${name}:`), error);
    return false;
  }
}

export type InitOptions = Record<string, never>;

/**
 * Prompt user for API key interactively
 */
async function promptForApiKey(): Promise<string | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(
    chalk.dim(
      "\nGet your API key from: https://console.anthropic.com/settings/keys",
    ),
  );

  try {
    const apiKey = await rl.question(
      chalk.cyan("Enter API key (or press Enter to skip): "),
    );
    rl.close();

    const trimmed = apiKey.trim();
    if (!trimmed) {
      return null;
    }

    if (!trimmed.startsWith("sk-ant-")) {
      console.log(chalk.red("Invalid API key format. Expected: sk-ant-..."));
      return null;
    }

    // Save API key to environment and keychain
    const savedToKeychain = await setApiKey(trimmed, true);

    if (savedToKeychain) {
      console.log(chalk.green("✓ API key saved to macOS Keychain"));
      console.log(chalk.dim("  Key will persist between sessions"));
    } else {
      console.log(chalk.green("✓ API key set for this session"));
      console.log(chalk.yellow("  Could not save to Keychain"));
      console.log(
        chalk.dim(
          `\nTo persist manually, add to your shell profile (~/.zshrc or ~/.bashrc):`,
        ),
      );
      console.log(
        chalk.yellow(`  export ANTHROPIC_API_KEY=${trimmed.slice(0, 15)}...`),
      );
    }

    return trimmed;
  } catch {
    rl.close();
    return null;
  }
}

/**
 * Initialize .ralph/ directory with templates
 */
export async function runInit(
  repoRoot: string,
  _options: InitOptions = {},
): Promise<boolean> {
  console.log(chalk.bold.cyan("\n═══ Ralph Init ═══\n"));

  const ralphDir = join(repoRoot, ".ralph");
  const templatesDir = getTemplatesDir();

  // Create .ralph directory
  if (!existsSync(ralphDir)) {
    await mkdir(ralphDir, { recursive: true });
    console.log(chalk.green("Created .ralph/ directory"));
  } else {
    console.log(chalk.dim(".ralph/ directory already exists"));
  }

  // Create prd directory
  const prdTemplatesDir = join(ralphDir, "prd");
  if (!existsSync(prdTemplatesDir)) {
    await mkdir(prdTemplatesDir, { recursive: true });
    console.log(chalk.green("Created .ralph/prd/ directory"));
  }

  // Discover available PRD templates from the bundled templates directory
  const prdSourceDir = join(templatesDir, "prd");
  const templateFiles = (await readdir(prdSourceDir)).filter((f) =>
    f.endsWith(".md"),
  );

  // Check if any templates already exist
  const existingTemplates: string[] = [];
  if (existsSync(join(ralphDir, "prompt.md"))) {
    existingTemplates.push("prompt.md");
  }
  for (const file of templateFiles) {
    if (existsSync(join(prdTemplatesDir, file))) {
      existingTemplates.push(`prd/${file}`);
    }
  }

  // Ask user if they want to overwrite existing templates
  let shouldPromptOverwrite = false;
  if (existingTemplates.length > 0) {
    console.log(chalk.yellow("\nExisting templates found:"));
    for (const file of existingTemplates) {
      console.log(chalk.dim(`  - ${file}`));
    }
    shouldPromptOverwrite = await promptYesNo(
      "\nWould you like to overwrite these templates?",
    );
    console.log("");
  }

  // Copy prompt.md
  await copyTemplate(
    join(templatesDir, "init", "prompt.md"),
    join(ralphDir, "prompt.md"),
    "prompt.md",
    shouldPromptOverwrite,
  );

  // Copy initial PRD.md from empty template (never overwrite PRD.md as it contains user's tasks)
  const prdSource = join(templatesDir, "prd", "empty.md");
  if (!existsSync(join(ralphDir, "PRD.md"))) {
    await copyTemplate(prdSource, join(ralphDir, "PRD.md"), "PRD.md", false);
  } else {
    console.log(chalk.dim("PRD.md already exists, skipping"));
  }

  // Create empty progress.txt
  const progressPath = join(ralphDir, "progress.txt");
  if (!existsSync(progressPath)) {
    await writeFile(progressPath, "");
    console.log(chalk.green("Created progress.txt"));
  } else {
    console.log(chalk.dim("progress.txt already exists"));
  }

  // Copy prd templates
  for (const file of templateFiles) {
    await copyTemplate(
      join(prdSourceDir, file),
      join(prdTemplatesDir, file),
      `prd/${file}`,
      shouldPromptOverwrite,
    );
  }

  // Add ralph script to package.json
  await addRalphScript(repoRoot);

  console.log("");

  // Check if Claude Code is installed (required for SDK runtime)
  const claudeInstalled = await isClaudeCodeInstalled();
  if (!claudeInstalled) {
    console.log(chalk.yellow("Claude Code is not installed."));
    console.log(chalk.dim("Install it with: brew install --cask claude-code"));
    return false;
  }
  console.log(chalk.green("✓ Claude Code is installed"));

  // Check if API key is set (checks env var and keychain)
  let hasKey = await hasApiKey();
  if (!hasKey) {
    console.log(chalk.yellow("\nANTHROPIC_API_KEY is not set."));
    const providedKey = await promptForApiKey();
    hasKey = !!providedKey;
  } else {
    console.log(chalk.green("✓ API key is configured"));
  }

  console.log(chalk.bold.cyan("\n═══ Init Complete ═══\n"));
  console.log("Next steps:");
  console.log(chalk.dim("  1. Edit .ralph/PRD.md with your tasks"));
  console.log(chalk.dim("  2. Run: pnpm ralph 5"));
  console.log("");

  return true;
}
