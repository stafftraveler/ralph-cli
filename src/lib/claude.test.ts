import { readFile } from "node:fs/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RalphConfig } from "../types.js";
import { hasApiKey, hasApiKeySync, type RunClaudeOptions, runClaude, setApiKey } from "./claude.js";
import * as keychain from "./keychain.js";

// Mock dependencies
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("./keychain.js", () => ({
  getApiKeyFromKeychain: vi.fn(),
  saveApiKeyToKeychain: vi.fn(),
}));

describe("claude", () => {
  const mockConfig: RalphConfig = {
    maxRetries: 3,
    soundOnComplete: true,
    notificationSound: "/System/Library/Sounds/Glass.aiff",
    saveOutput: false,
    outputDir: "logs",
    prdTemplatesDir: "templates",
    defaultTemplate: "empty",
    defaultIterations: 10,
  };

  // Helper to create async iterable from array
  async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
      yield item;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variable
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe("runClaude", () => {
    const mockOptions: RunClaudeOptions = {
      ralphDir: "/test/.ralph",
      prompt: "Test prompt",
      verbose: false,
    };

    it("should return error if PRD.md cannot be read", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(readFile).mockRejectedValue(error);

      const result = await runClaude(mockOptions);

      expect(result.success).toBe(false);
      // New error format includes error code and suggestion
      expect(result.error).toContain("ENOENT");
      expect(result.error).toContain("/test/.ralph/PRD.md");
      expect(result.error).toContain("ralph init");
      expect(result.prdComplete).toBe(false);
    });

    it("should handle missing progress.txt gracefully", async () => {
      vi.mocked(readFile).mockImplementation((path) => {
        if (path === "/test/.ralph/PRD.md") {
          return Promise.resolve("# PRD Content");
        }
        return Promise.reject(new Error("ENOENT"));
      });

      // Mock query to return immediately
      const mockResponse = [
        {
          type: "result",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_cost_usd: 0.01,
          },
        },
      ];
      vi.mocked(query).mockReturnValue(
        createAsyncIterable(mockResponse) as ReturnType<typeof query>,
      );

      const result = await runClaude(mockOptions);

      // Should succeed with empty progress
      expect(result.success).toBe(true);
    });

    it("should successfully run Claude with valid inputs", async () => {
      vi.mocked(readFile).mockImplementation((path) => {
        if (path === "/test/.ralph/PRD.md") {
          return Promise.resolve("# PRD Content");
        }
        if (path === "/test/.ralph/progress.txt") {
          return Promise.resolve("Progress log");
        }
        return Promise.reject(new Error("Unknown file"));
      });

      const mockResponse = [
        {
          type: "system",
          subtype: "init",
          session_id: "test-session-id",
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello from Claude" }],
          },
        },
        {
          type: "result",
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            total_cost_usd: 0.25,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 50,
          },
        },
      ];
      vi.mocked(query).mockReturnValue(
        createAsyncIterable(mockResponse) as ReturnType<typeof query>,
      );

      const result = await runClaude(mockOptions);

      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello from Claude");
      expect(result.sessionId).toBe("test-session-id");
      expect(result.usage).toEqual({
        inputTokens: 1000,
        outputTokens: 500,
        totalCostUsd: 0.25,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 50,
      });
    });

    it("should detect PRD completion", async () => {
      vi.mocked(readFile).mockImplementation((path) => {
        if (path === "/test/.ralph/PRD.md") {
          return Promise.resolve("# PRD");
        }
        return Promise.resolve("");
      });

      const mockResponse = [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "All done! <promise>COMPLETE</promise>",
              },
            ],
          },
        },
        {
          type: "result",
          usage: { input_tokens: 100, output_tokens: 50, total_cost_usd: 0.01 },
        },
      ];
      vi.mocked(query).mockReturnValue(
        createAsyncIterable(mockResponse) as ReturnType<typeof query>,
      );

      const result = await runClaude(mockOptions);

      expect(result.success).toBe(true);
      expect(result.prdComplete).toBe(true);
      expect(result.output).toContain("<promise>COMPLETE</promise>");
    });

    it("should call onStdout callback with text output", async () => {
      vi.mocked(readFile).mockResolvedValue("# PRD");

      const onStdout = vi.fn();
      const mockResponse = [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "First part" }],
          },
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Second part" }],
          },
        },
        {
          type: "result",
          usage: { input_tokens: 100, output_tokens: 50, total_cost_usd: 0.01 },
        },
      ];
      vi.mocked(query).mockReturnValue(
        createAsyncIterable(mockResponse) as ReturnType<typeof query>,
      );

      await runClaude({ ...mockOptions, onStdout });

      expect(onStdout).toHaveBeenCalledWith("First part");
      expect(onStdout).toHaveBeenCalledWith("Second part");
    });

    it("should call onStatus callback with tool use", async () => {
      vi.mocked(readFile).mockResolvedValue("# PRD");

      const onStatus = vi.fn();
      const mockResponse = [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "Read",
                input: { file_path: "/test/file.ts" },
              },
            ],
          },
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "tool_use", name: "Bash", input: {} }],
          },
        },
        {
          type: "result",
          usage: { input_tokens: 100, output_tokens: 50, total_cost_usd: 0.01 },
        },
      ];
      vi.mocked(query).mockReturnValue(
        createAsyncIterable(mockResponse) as ReturnType<typeof query>,
      );

      await runClaude({ ...mockOptions, onStatus });

      expect(onStatus).toHaveBeenCalledWith("Reading test/file.ts");
      expect(onStatus).toHaveBeenCalledWith("Running command");
    });

    it("should handle SDK errors gracefully", async () => {
      vi.mocked(readFile).mockResolvedValue("# PRD");

      vi.mocked(query).mockImplementation(() => {
        throw new Error("SDK connection failed");
      });

      const result = await runClaude(mockOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe("SDK connection failed");
    });

    it("should pass resumeSessionId to SDK", async () => {
      vi.mocked(readFile).mockResolvedValue("# PRD");

      const mockResponse = [
        {
          type: "result",
          usage: { input_tokens: 100, output_tokens: 50, total_cost_usd: 0.01 },
        },
      ];
      vi.mocked(query).mockReturnValue(
        createAsyncIterable(mockResponse) as ReturnType<typeof query>,
      );

      await runClaude({
        ...mockOptions,
        resumeSessionId: "previous-session-id",
      });

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            resume: "previous-session-id",
          }),
        }),
      );
    });

    it("should handle multiple text blocks in single message", async () => {
      vi.mocked(readFile).mockResolvedValue("# PRD");

      const mockResponse = [
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Part 1" },
              { type: "text", text: "Part 2" },
              { type: "text", text: "Part 3" },
            ],
          },
        },
        {
          type: "result",
          usage: { input_tokens: 100, output_tokens: 50, total_cost_usd: 0.01 },
        },
      ];
      vi.mocked(query).mockReturnValue(
        createAsyncIterable(mockResponse) as ReturnType<typeof query>,
      );

      const result = await runClaude(mockOptions);

      expect(result.output).toBe("Part 1Part 2Part 3");
    });
  });

  describe("hasApiKey", () => {
    it("should return true if ANTHROPIC_API_KEY env var is set", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const result = await hasApiKey();

      expect(result).toBe(true);
      expect(keychain.getApiKeyFromKeychain).not.toHaveBeenCalled();
    });

    it("should check keychain if env var is not set", async () => {
      vi.mocked(keychain.getApiKeyFromKeychain).mockResolvedValue("sk-ant-keychain-key");

      const result = await hasApiKey();

      expect(result).toBe(true);
      expect(keychain.getApiKeyFromKeychain).toHaveBeenCalled();
      expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-keychain-key");
    });

    it("should return false if no key is found", async () => {
      vi.mocked(keychain.getApiKeyFromKeychain).mockResolvedValue(null);

      const result = await hasApiKey();

      expect(result).toBe(false);
    });
  });

  describe("hasApiKeySync", () => {
    it("should return true if env var is set", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const result = hasApiKeySync();

      expect(result).toBe(true);
    });

    it("should return false if env var is not set", () => {
      const result = hasApiKeySync();

      expect(result).toBe(false);
    });
  });

  describe("setApiKey", () => {
    it("should set API key in environment", async () => {
      await setApiKey("sk-ant-new-key", false);

      expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-new-key");
      expect(keychain.saveApiKeyToKeychain).not.toHaveBeenCalled();
    });

    it("should save to keychain when persistToKeychain is true", async () => {
      vi.mocked(keychain.saveApiKeyToKeychain).mockResolvedValue(true);

      const result = await setApiKey("sk-ant-new-key", true);

      expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-new-key");
      expect(keychain.saveApiKeyToKeychain).toHaveBeenCalledWith("sk-ant-new-key");
      expect(result).toBe(true);
    });

    it("should default to persisting to keychain", async () => {
      vi.mocked(keychain.saveApiKeyToKeychain).mockResolvedValue(true);

      await setApiKey("sk-ant-new-key");

      expect(keychain.saveApiKeyToKeychain).toHaveBeenCalled();
    });

    it("should return false if keychain save fails", async () => {
      vi.mocked(keychain.saveApiKeyToKeychain).mockResolvedValue(false);

      const result = await setApiKey("sk-ant-new-key", true);

      expect(result).toBe(false);
    });
  });
});
