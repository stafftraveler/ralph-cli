import { readFile } from "node:fs/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execa } from "execa";
import type { RalphConfig, UsageInfo } from "../types.js";
import { getApiKeyFromKeychain, saveApiKeyToKeychain } from "./keychain.js";
import { createApiKeyError, createFileNotFoundError, wrapError } from "./utils.js";

/**
 * Content block with text from assistant messages
 */
interface TextBlock {
  type: "text";
  text: string;
}

/**
 * Content block representing a tool invocation
 */
interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input?: Record<string, unknown>;
}

/**
 * Union type for all content block types in assistant messages
 */
type ContentBlock = TextBlock | ToolUseBlock | { type: string };

/**
 * Type guard to check if a content block is a text block
 */
function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

/**
 * Type guard to check if a content block is a tool use block
 */
function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

/**
 * Human-friendly descriptions for Claude SDK tools
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  StrReplace: "Editing",
  Bash: "Running command",
  Shell: "Running command",
  Grep: "Searching",
  Glob: "Finding files",
  LS: "Listing directory",
  Task: "Running subtask",
  TodoWrite: "Updating tasks",
  WebFetch: "Fetching URL",
  WebSearch: "Searching web",
  NotebookEdit: "Editing notebook",
};

/**
 * Extracts a file path from tool input if available
 */
function extractFilePath(toolInput: unknown): string | undefined {
  if (typeof toolInput !== "object" || toolInput === null) {
    return undefined;
  }

  const input = toolInput as Record<string, unknown>;

  // Common file path field names used by various tools
  if (typeof input.file_path === "string") {
    return input.file_path;
  }
  if (typeof input.path === "string") {
    return input.path;
  }
  if (typeof input.notebook_path === "string") {
    return input.notebook_path;
  }

  return undefined;
}

/**
 * Shortens a file path to just the filename or last few path segments
 */
function shortenPath(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join("/");
  }
  // Show last 2 segments for context
  return parts.slice(-2).join("/");
}

/**
 * Formats a tool use event into a human-friendly status message
 *
 * @param toolName - The raw tool name from the SDK
 * @param toolInput - The tool input object (optional)
 * @returns Human-friendly status string
 */
function formatToolStatus(toolName: string, toolInput?: unknown): string {
  const description = TOOL_DESCRIPTIONS[toolName] ?? `Using tool: ${toolName}`;

  const filePath = extractFilePath(toolInput);
  if (filePath) {
    return `${description} ${shortenPath(filePath)}`;
  }

  return description;
}

/**
 * Options for running Claude via SDK
 */
export interface RunClaudeOptions {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Prompt to send to Claude */
  prompt: string;
  /** Whether to enable verbose output */
  verbose?: boolean;
  /** Whether to enable debug mode */
  debug?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Callback for streaming text output */
  onStdout?: (data: string) => void;
  /** Callback for status/progress updates */
  onStatus?: (status: string) => void;
  /** SDK session ID to resume (optional) */
  resumeSessionId?: string;
}

/**
 * Result from running Claude
 */
export interface ClaudeRunResult {
  /** Whether the run was successful */
  success: boolean;
  /** Complete text output */
  output: string;
  /** Whether PRD is marked complete */
  prdComplete: boolean;
  /** Token usage and cost info */
  usage?: UsageInfo;
  /** SDK session ID for resuming */
  sessionId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Checks if output indicates PRD is complete
 */
function isPrdComplete(output: string): boolean {
  return output.includes("<promise>COMPLETE</promise>");
}

/**
 * Runs Claude via the Agent SDK and streams output
 *
 * @param config - Ralph configuration
 * @param options - Run options
 * @returns Promise resolving to run result
 */
export async function runClaude(
  _config: RalphConfig,
  options: RunClaudeOptions,
): Promise<ClaudeRunResult> {
  const prdPath = `${options.ralphDir}/PRD.md`;
  const progressPath = `${options.ralphDir}/progress.txt`;

  // Read PRD and progress as context
  let prdContent: string;
  let progressContent: string;

  try {
    prdContent = await readFile(prdPath, "utf-8");
  } catch (error) {
    const ralphError =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? createFileNotFoundError(
            prdPath,
            "Run 'npx ralph init' to initialize a Ralph session with a PRD template",
          )
        : wrapError(error, `Failed to read PRD.md at ${prdPath}`);

    return {
      success: false,
      output: "",
      prdComplete: false,
      error: ralphError.format(),
    };
  }

  try {
    progressContent = await readFile(progressPath, "utf-8");
  } catch {
    progressContent = "";
  }

  // Build the full prompt with context
  const fullPrompt = `# PRD (Product Requirements Document)

${prdContent}

---

# Progress Log

${progressContent || "(No progress yet)"}

---

# Task

${options.prompt}

After completing work, update the progress.txt file with what you accomplished.
If all tasks in the PRD are complete, include <promise>COMPLETE</promise> in your response.`;

  if (options.debug) {
    console.log("[DEBUG] Running Claude SDK with prompt:");
    console.log(`${fullPrompt.slice(0, 500)}...`);
  }

  let output = "";
  let sessionId: string | undefined;
  let usage: UsageInfo | undefined;

  // Calculate project root (parent of .ralph directory)
  const projectRoot = options.ralphDir.replace(/[/\\]\.ralph$/, "");

  try {
    const response = query({
      prompt: fullPrompt,
      options: {
        permissionMode: "bypassPermissions",
        settingSources: ["project"], // Load CLAUDE.md and .claude/skills/
        cwd: projectRoot,
        ...(options.resumeSessionId && { resume: options.resumeSessionId }),
      },
    });

    for await (const message of response) {
      // Capture session ID from init message
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
        if (options.debug) {
          console.log(`[DEBUG] SDK session ID: ${sessionId}`);
        }
      }

      // Process assistant messages: stream text and capture tool use
      if (message.type === "assistant") {
        const contentBlocks = message.message.content as ContentBlock[];

        // Extract and stream text content
        const textBlocks = contentBlocks.filter(isTextBlock);
        const text = textBlocks.map((b) => b.text).join("");
        if (text) {
          output += text;
          options.onStdout?.(text);
        }

        // Report tool use for status updates
        const toolUseBlocks = contentBlocks.filter(isToolUseBlock);
        for (const block of toolUseBlocks) {
          const status = formatToolStatus(block.name, block.input);
          options.onStatus?.(status);
        }
      }

      // Capture final result with usage
      if (message.type === "result") {
        if (message.usage) {
          usage = {
            inputTokens: message.usage.input_tokens ?? 0,
            outputTokens: message.usage.output_tokens ?? 0,
            totalCostUsd: message.usage.total_cost_usd ?? 0,
            cacheReadInputTokens: message.usage.cache_read_input_tokens,
            cacheCreationInputTokens: message.usage.cache_creation_input_tokens,
          };
        }

        if (options.debug) {
          console.log("[DEBUG] SDK result received");
          if (usage) {
            console.log(
              `[DEBUG] Usage: ${usage.inputTokens} in, ${usage.outputTokens} out, $${usage.totalCostUsd.toFixed(4)}`,
            );
          }
        }
      }
    }

    return {
      success: true,
      output,
      prdComplete: isPrdComplete(output),
      usage,
      sessionId,
    };
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Detect authentication/API key errors and provide better messages
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("authentication") ||
        msg.includes("api key") ||
        msg.includes("unauthorized") ||
        msg.includes("invalid_api_key") ||
        msg.includes("401")
      ) {
        const apiKeyError = createApiKeyError(
          "API key authentication failed",
          true, // isInvalid = true
        );
        errorMessage = apiKeyError.format();
      }
    }

    if (options.debug) {
      console.log(`[DEBUG] SDK error: ${errorMessage}`);
    }

    return {
      success: false,
      output,
      prdComplete: false,
      error: errorMessage,
      sessionId,
    };
  }
}

/**
 * Checks if ANTHROPIC_API_KEY is available (environment variable or keychain)
 *
 * This function checks the environment variable first, then falls back to
 * the macOS Keychain. If found in the keychain, it loads the key into the
 * environment for use by the SDK.
 *
 * @returns Promise resolving to true if API key is configured
 */
export async function hasApiKey(): Promise<boolean> {
  // Check environment variable first
  if (process.env.ANTHROPIC_API_KEY) {
    return true;
  }

  // Try to load from keychain
  const keychainKey = await getApiKeyFromKeychain();
  if (keychainKey) {
    // Load into environment for SDK to use
    process.env.ANTHROPIC_API_KEY = keychainKey;
    return true;
  }

  return false;
}

/**
 * Synchronous check if ANTHROPIC_API_KEY environment variable is set
 *
 * Use this only when you know the key has already been loaded (after hasApiKey was called)
 *
 * @returns True if API key is in environment
 */
export function hasApiKeySync(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Saves the API key to the environment and optionally to the macOS Keychain
 *
 * @param apiKey - The API key to save
 * @param persistToKeychain - Whether to save to keychain for future sessions (default: true)
 * @returns Promise resolving to true if keychain save succeeded (or was skipped)
 */
export async function setApiKey(apiKey: string, persistToKeychain = true): Promise<boolean> {
  // Always set in environment for current session
  process.env.ANTHROPIC_API_KEY = apiKey;

  // Optionally persist to keychain
  if (persistToKeychain) {
    return await saveApiKeyToKeychain(apiKey);
  }

  return true;
}

/**
 * Checks if Claude Code is installed (required for SDK runtime)
 *
 * @returns Promise resolving to true if Claude Code is installed
 */
export async function isClaudeCodeInstalled(): Promise<boolean> {
  try {
    const result = await execa("claude", ["--version"], {
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Gets the installed Claude Code version
 *
 * @returns Promise resolving to version string or null
 */
export async function getClaudeCodeVersion(): Promise<string | null> {
  try {
    const result = await execa("claude", ["--version"], {
      reject: false,
    });
    if (result.exitCode === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}
