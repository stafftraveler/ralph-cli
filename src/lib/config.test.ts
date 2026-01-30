import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("config", () => {
  const mockRalphDir = "/test/repo/.ralph";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadConfig", () => {
    it("should return default config when file does not exist", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(readFile).mockRejectedValue(error);

      const config = await loadConfig(mockRalphDir);

      expect(config).toEqual({
        maxRetries: 3,
        soundOnComplete: true,
        notificationSound: "/System/Library/Sounds/Glass.aiff",
        saveOutput: false,
        outputDir: "logs",
        prdTemplatesDir: "templates",
        defaultTemplate: "empty",
        maxCostPerIteration: undefined,
        maxCostPerSession: undefined,
      });
    });

    it("should parse valid config file", async () => {
      const configContent = `
MAX_RETRIES=5
SOUND_ON_COMPLETE=false
NOTIFICATION_SOUND=/custom/sound.aiff
SAVE_OUTPUT=true
OUTPUT_DIR=custom-logs
PRD_TEMPLATES_DIR=my-templates
DEFAULT_TEMPLATE=new-feature
MAX_COST_PER_ITERATION=1.50
MAX_COST_PER_SESSION=10.00
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config).toEqual({
        maxRetries: 5,
        soundOnComplete: false,
        notificationSound: "/custom/sound.aiff",
        saveOutput: true,
        outputDir: "custom-logs",
        prdTemplatesDir: "my-templates",
        defaultTemplate: "new-feature",
        maxCostPerIteration: 1.5,
        maxCostPerSession: 10.0,
      });
    });

    it("should handle config with comments and empty lines", async () => {
      const configContent = `
# This is a comment
MAX_RETRIES=5

# Another comment
SOUND_ON_COMPLETE=false

# Empty lines above
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.maxRetries).toBe(5);
      expect(config.soundOnComplete).toBe(false);
      // Other values should be defaults
      expect(config.outputDir).toBe("logs");
    });

    it("should parse values with quotes", async () => {
      const configContent = `
NOTIFICATION_SOUND="/path/with spaces/sound.aiff"
OUTPUT_DIR='single-quoted'
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.notificationSound).toBe("/path/with spaces/sound.aiff");
      expect(config.outputDir).toBe("single-quoted");
    });

    it("should handle $SCRIPT_DIR variable", async () => {
      const configContent = `
OUTPUT_DIR=$SCRIPT_DIR/logs
PRD_TEMPLATES_DIR=$SCRIPT_DIRtemplates
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.outputDir).toBe("logs");
      expect(config.prdTemplatesDir).toBe("templates");
    });

    it("should parse boolean values correctly", async () => {
      const configContent = `
SOUND_ON_COMPLETE=true
SAVE_OUTPUT=false
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.soundOnComplete).toBe(true);
      expect(config.saveOutput).toBe(false);
    });

    it("should parse boolean values as 1/0", async () => {
      const configContent = `
SOUND_ON_COMPLETE=1
SAVE_OUTPUT=0
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.soundOnComplete).toBe(true);
      expect(config.saveOutput).toBe(false);
    });

    it("should handle invalid numeric values gracefully", async () => {
      const configContent = `
MAX_RETRIES=invalid
MAX_COST_PER_ITERATION=not-a-number
MAX_COST_PER_SESSION=
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      // Should fall back to defaults
      expect(config.maxRetries).toBe(3);
      expect(config.maxCostPerIteration).toBeUndefined();
      expect(config.maxCostPerSession).toBeUndefined();
    });

    it("should ignore negative cost values", async () => {
      const configContent = `
MAX_COST_PER_ITERATION=-1.5
MAX_COST_PER_SESSION=-10
WARN_COST_THRESHOLD=0
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.maxCostPerIteration).toBeUndefined();
      expect(config.maxCostPerSession).toBeUndefined();
    });

    it("should handle lines without equals sign", async () => {
      const configContent = `
MAX_RETRIES=5
INVALID_LINE_WITHOUT_EQUALS
SOUND_ON_COMPLETE=false
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      // Should parse valid lines and skip invalid ones
      expect(config.maxRetries).toBe(5);
      expect(config.soundOnComplete).toBe(false);
    });

    it("should handle empty string values", async () => {
      const configContent = `
OUTPUT_DIR=
NOTIFICATION_SOUND=
DEFAULT_TEMPLATE=
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      // Should use defaults for empty values
      expect(config.outputDir).toBe("logs");
      expect(config.notificationSound).toBe("");
      expect(config.defaultTemplate).toBe("empty");
    });

    it("should convert SCREAMING_SNAKE_CASE to camelCase", async () => {
      const configContent = `
MAX_RETRIES=7
SOUND_ON_COMPLETE=true
PRD_TEMPLATES_DIR=my-dir
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.maxRetries).toBe(7);
      expect(config.soundOnComplete).toBe(true);
      expect(config.prdTemplatesDir).toBe("my-dir");
    });

    it("should handle mixed case in boolean values", async () => {
      const configContent = `
SOUND_ON_COMPLETE=TRUE
SAVE_OUTPUT=False
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.soundOnComplete).toBe(true);
      expect(config.saveOutput).toBe(false);
    });

    it("should parse floating point cost values", async () => {
      const configContent = `
MAX_COST_PER_ITERATION=0.5
MAX_COST_PER_SESSION=15.99
WARN_COST_THRESHOLD=12.50
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.maxCostPerIteration).toBe(0.5);
      expect(config.maxCostPerSession).toBe(15.99);
    });

    it("should handle non-ENOENT errors and continue with defaults", async () => {
      const error = new Error("Permission denied") as NodeJS.ErrnoException;
      error.code = "EACCES";
      vi.mocked(readFile).mockRejectedValue(error);

      // Should not throw, just use defaults
      const config = await loadConfig(mockRalphDir);

      expect(config).toEqual({
        maxRetries: 3,
        soundOnComplete: true,
        notificationSound: "/System/Library/Sounds/Glass.aiff",
        saveOutput: false,
        outputDir: "logs",
        prdTemplatesDir: "templates",
        defaultTemplate: "empty",
        maxCostPerIteration: undefined,
        maxCostPerSession: undefined,
      });
    });

    it("should handle partial config with some defaults", async () => {
      const configContent = `
MAX_RETRIES=10
MAX_COST_PER_SESSION=5.00
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      // Should merge with defaults
      expect(config.maxRetries).toBe(10);
      expect(config.maxCostPerSession).toBe(5.0);
      expect(config.soundOnComplete).toBe(true); // default
      expect(config.outputDir).toBe("logs"); // default
      expect(config.maxCostPerIteration).toBeUndefined(); // default
    });

    it("should handle whitespace around keys and values", async () => {
      const configContent = `
  MAX_RETRIES  =  8
SOUND_ON_COMPLETE=  false
OUTPUT_DIR=   logs-dir
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.maxRetries).toBe(8);
      expect(config.soundOnComplete).toBe(false);
      expect(config.outputDir).toBe("logs-dir");
    });

    it("should ignore unknown config keys", async () => {
      const configContent = `
MAX_RETRIES=5
UNKNOWN_KEY=some-value
ANOTHER_UNKNOWN=123
`;
      vi.mocked(readFile).mockResolvedValue(configContent);

      const config = await loadConfig(mockRalphDir);

      expect(config.maxRetries).toBe(5);
      // Should not have unknown properties
      expect(config).not.toHaveProperty("unknownKey");
      expect(config).not.toHaveProperty("anotherUnknown");
    });
  });
});
