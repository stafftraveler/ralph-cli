import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RalphConfig } from "../types.js";
import { createConfigError, createFileNotFoundError } from "./utils.js";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: RalphConfig = {
  maxRetries: 3,
  soundOnComplete: true,
  notificationSound: "/System/Library/Sounds/Glass.aiff",
  saveOutput: false,
  outputDir: "logs",
  prdTemplatesDir: "templates",
  defaultTemplate: "empty",
  defaultIterations: 10,
  maxCostPerIteration: undefined,
  maxCostPerSession: undefined,
  linearDefaultTeamId: undefined,
};

/**
 * Parse a key=value config line, handling quotes and shell variables
 */
function parseConfigValue(value: string): string {
  let parsed = value.trim();

  // Remove surrounding quotes (single or double)
  if (
    (parsed.startsWith('"') && parsed.endsWith('"')) ||
    (parsed.startsWith("'") && parsed.endsWith("'"))
  ) {
    parsed = parsed.slice(1, -1);
  }

  // Expand $SCRIPT_DIR to empty (will be resolved relative to .ralph/)
  parsed = parsed.replace(/\$SCRIPT_DIR\/?/g, "");

  return parsed;
}

/**
 * Convert SCREAMING_SNAKE_CASE to camelCase
 */
function toCamelCase(key: string): string {
  return key.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Parse boolean string values
 */
function parseBoolean(value: string): boolean {
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Load and parse .ralph/config file
 * @param ralphDir Path to .ralph directory
 * @returns Merged config with defaults
 */
export async function loadConfig(ralphDir: string): Promise<RalphConfig> {
  const configPath = join(ralphDir, "config");
  const config = { ...DEFAULT_CONFIG };

  try {
    const content = await readFile(configPath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse key=value
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        // Warn about lines without '=' but continue parsing
        const configError = createConfigError(
          `Invalid config line ${lineNumber}: missing '=' separator`,
          `Line: "${trimmed.slice(0, 50)}${trimmed.length > 50 ? "..." : ""}"`,
        );
        console.warn(`Warning: ${configError.format()}`);
        continue;
      }

      const key = trimmed.slice(0, eqIndex).trim();
      const rawValue = trimmed.slice(eqIndex + 1);
      const value = parseConfigValue(rawValue);
      const camelKey = toCamelCase(key);

      // Map to config properties
      switch (camelKey) {
        case "maxRetries": {
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed) || parsed < 0) {
            const configError = createConfigError(
              `Invalid value for MAX_RETRIES on line ${lineNumber}`,
              `Value "${value}" is not a valid positive integer. Using default: ${DEFAULT_CONFIG.maxRetries}`,
            );
            console.warn(`Warning: ${configError.format()}`);
            config.maxRetries = DEFAULT_CONFIG.maxRetries;
          } else {
            config.maxRetries = parsed;
          }
          break;
        }
        case "soundOnComplete":
          config.soundOnComplete = parseBoolean(value);
          break;
        case "notificationSound":
          config.notificationSound = value;
          break;
        case "saveOutput":
          config.saveOutput = parseBoolean(value);
          break;
        case "outputDir":
          if (!value) {
            const configError = createConfigError(
              `Empty value for OUTPUT_DIR on line ${lineNumber}`,
              `Using default: "${DEFAULT_CONFIG.outputDir}"`,
            );
            console.warn(`Warning: ${configError.format()}`);
            config.outputDir = DEFAULT_CONFIG.outputDir;
          } else {
            config.outputDir = value;
          }
          break;
        case "prdTemplatesDir":
          config.prdTemplatesDir = value || DEFAULT_CONFIG.prdTemplatesDir;
          break;
        case "defaultTemplate":
          config.defaultTemplate = value || DEFAULT_CONFIG.defaultTemplate;
          break;
        case "defaultIterations": {
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed) || parsed < 1) {
            const configError = createConfigError(
              `Invalid value for DEFAULT_ITERATIONS on line ${lineNumber}`,
              `Value "${value}" is not a valid positive integer. Using default: ${DEFAULT_CONFIG.defaultIterations}`,
            );
            console.warn(`Warning: ${configError.format()}`);
            config.defaultIterations = DEFAULT_CONFIG.defaultIterations;
          } else if (parsed > 100) {
            const configError = createConfigError(
              `Invalid value for DEFAULT_ITERATIONS on line ${lineNumber}`,
              `Value "${value}" exceeds maximum of 100. Using default: ${DEFAULT_CONFIG.defaultIterations}`,
            );
            console.warn(`Warning: ${configError.format()}`);
            config.defaultIterations = DEFAULT_CONFIG.defaultIterations;
          } else {
            config.defaultIterations = parsed;
          }
          break;
        }
        case "maxCostPerIteration": {
          const parsed = Number.parseFloat(value);
          if (Number.isNaN(parsed)) {
            const configError = createConfigError(
              `Invalid value for MAX_COST_PER_ITERATION on line ${lineNumber}`,
              `Value "${value}" is not a valid number. Expected format: 0.50 (USD)`,
            );
            console.warn(`Warning: ${configError.format()}`);
          } else if (parsed <= 0) {
            const configError = createConfigError(
              `Invalid value for MAX_COST_PER_ITERATION on line ${lineNumber}`,
              `Value "${value}" must be positive. Expected format: 0.50 (USD)`,
            );
            console.warn(`Warning: ${configError.format()}`);
          } else {
            config.maxCostPerIteration = parsed;
          }
          break;
        }
        case "maxCostPerSession": {
          const parsed = Number.parseFloat(value);
          if (Number.isNaN(parsed)) {
            const configError = createConfigError(
              `Invalid value for MAX_COST_PER_SESSION on line ${lineNumber}`,
              `Value "${value}" is not a valid number. Expected format: 5.00 (USD)`,
            );
            console.warn(`Warning: ${configError.format()}`);
          } else if (parsed <= 0) {
            const configError = createConfigError(
              `Invalid value for MAX_COST_PER_SESSION on line ${lineNumber}`,
              `Value "${value}" must be positive. Expected format: 5.00 (USD)`,
            );
            console.warn(`Warning: ${configError.format()}`);
          } else {
            config.maxCostPerSession = parsed;
          }
          break;
        }
        case "linearDefaultTeamId":
          config.linearDefaultTeamId = value || undefined;
          break;
        default:
          // Unknown config key - warn but continue
          if (key) {
            const configError = createConfigError(
              `Unknown config key on line ${lineNumber}: ${key}`,
              `Valid keys: MAX_RETRIES, SOUND_ON_COMPLETE, NOTIFICATION_SOUND, SAVE_OUTPUT, OUTPUT_DIR, DEFAULT_ITERATIONS, MAX_COST_PER_ITERATION, MAX_COST_PER_SESSION, LINEAR_DEFAULT_TEAM_ID`,
            );
            console.warn(`Warning: ${configError.format()}`);
          }
          break;
      }
    }
  } catch (error) {
    // Config file doesn't exist or can't be read - use defaults
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      // File not found is expected for fresh installations - silently use defaults
      // User will get helpful message if they run 'ralph init'
    } else {
      // Other errors (permissions, etc.) should show helpful message
      const ralphError = createFileNotFoundError(
        configPath,
        "Run 'npx ralph init' to create a default config file, or check file permissions",
      );
      console.error(`Warning: ${ralphError.format()}`);
    }
    // Fall through to return defaults
  }

  return config;
}
