import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RalphConfig } from "../types.js";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: RalphConfig = {
  maxRetries: 3,
  soundOnComplete: true,
  notificationSound: "/System/Library/Sounds/Glass.aiff",
  saveOutput: false,
  outputDir: "logs",
  prdTemplatesDir: "prd",
  defaultTemplate: "empty",
  maxCostPerIteration: undefined,
  maxCostPerSession: undefined,
  warnCostThreshold: undefined,
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

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse key=value
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, eqIndex).trim();
      const value = parseConfigValue(trimmed.slice(eqIndex + 1));
      const camelKey = toCamelCase(key);

      // Map to config properties
      switch (camelKey) {
        case "maxRetries":
          config.maxRetries = Number.parseInt(value, 10) || DEFAULT_CONFIG.maxRetries;
          break;
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
          config.outputDir = value || DEFAULT_CONFIG.outputDir;
          break;
        case "prdTemplatesDir":
          config.prdTemplatesDir = value || DEFAULT_CONFIG.prdTemplatesDir;
          break;
        case "defaultTemplate":
          config.defaultTemplate = value || DEFAULT_CONFIG.defaultTemplate;
          break;
        case "maxCostPerIteration": {
          const parsed = Number.parseFloat(value);
          if (!Number.isNaN(parsed) && parsed > 0) {
            config.maxCostPerIteration = parsed;
          }
          break;
        }
        case "maxCostPerSession": {
          const parsed = Number.parseFloat(value);
          if (!Number.isNaN(parsed) && parsed > 0) {
            config.maxCostPerSession = parsed;
          }
          break;
        }
        case "warnCostThreshold": {
          const parsed = Number.parseFloat(value);
          if (!Number.isNaN(parsed) && parsed > 0) {
            config.warnCostThreshold = parsed;
          }
          break;
        }
      }
    }
  } catch (error) {
    // Config file doesn't exist or can't be read - use defaults
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Warning: Could not read config file at ${configPath}:`, error);
    }
    // Fall through to return defaults
  }

  return config;
}
