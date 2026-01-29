import { readFile } from "node:fs/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execa } from "execa";
import type { RalphConfig, UsageInfo } from "../types.js";

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
export function isPrdComplete(output: string): boolean {
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
  } catch {
    return {
      success: false,
      output: "",
      prdComplete: false,
      error: `Failed to read PRD.md at ${prdPath}`,
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
        permissionMode: "acceptEdits",
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

      // Stream assistant text messages
      if (message.type === "assistant") {
        const textBlocks = message.message.content.filter(
          (block: { type: string }): block is { type: "text"; text: string } =>
            block.type === "text",
        );
        const text = textBlocks.map((b: { text: string }) => b.text).join("");

        if (text) {
          output += text;
          options.onStdout?.(text);
        }
      }

      // Capture tool use for status updates
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            // Extract status from tool names for progress display
            const toolName = block.name;
            if (toolName) {
              options.onStatus?.(`Using tool: ${toolName}`);
            }
          }
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

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
 * Checks if ANTHROPIC_API_KEY environment variable is set
 *
 * @returns True if API key is configured
 */
export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Validates the API key by making a simple request
 * Note: This is a basic check; actual validation happens on first SDK call
 *
 * @returns Promise resolving to true if API key appears valid
 */
export async function validateApiKey(): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return false;
  }

  // Basic format validation (sk-ant-api03-...)
  if (!apiKey.startsWith("sk-ant-")) {
    return false;
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
