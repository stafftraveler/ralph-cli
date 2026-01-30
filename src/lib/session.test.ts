import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as useGit from "../hooks/use-git.js";
import type { IterationResult, SessionState } from "../types.js";
import {
  addIterationResult,
  canResumeSession,
  clearSession,
  createSession,
  loadSession,
  resumeFromCheckpoint,
  saveCheckpoint,
  saveSession,
} from "./session.js";

// Mock node:fs and node:fs/promises
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock use-git hooks
vi.mock("../hooks/use-git.js", () => ({
  getCurrentBranch: vi.fn(),
  getCurrentCommit: vi.fn(),
}));

describe("session", () => {
  const mockRalphDir = "/test/repo/.ralph";
  const mockSessionPath = "/test/repo/.ralph/session.json";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("loadSession", () => {
    it("should return null if session file does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await loadSession(mockRalphDir);

      expect(result).toBeNull();
      expect(existsSync).toHaveBeenCalledWith(mockSessionPath);
    });

    it("should return null if session file is invalid JSON", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue("invalid json");

      const result = await loadSession(mockRalphDir);

      expect(result).toBeNull();
    });

    it("should return null if required fields are missing", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: "test-id" }));

      const result = await loadSession(mockRalphDir);

      expect(result).toBeNull();
    });

    it("should load valid session successfully", async () => {
      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession));

      const result = await loadSession(mockRalphDir);

      expect(result).toEqual(mockSession);
    });

    it("should load session with checkpoint", async () => {
      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
        checkpoint: {
          iteration: 3,
          timestamp: "2024-01-01T00:10:00.000Z",
          commit: "def456",
        },
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession));

      const result = await loadSession(mockRalphDir);

      expect(result).toEqual(mockSession);
      expect(result?.checkpoint?.iteration).toBe(3);
    });
  });

  describe("saveSession", () => {
    it("should create ralph directory if it does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      await saveSession(mockRalphDir, mockSession);

      expect(mkdir).toHaveBeenCalledWith(mockRalphDir, { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        mockSessionPath,
        JSON.stringify(mockSession, null, 2),
        "utf-8",
      );
    });

    it("should save session without creating directory if it exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      await saveSession(mockRalphDir, mockSession);

      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith(
        mockSessionPath,
        JSON.stringify(mockSession, null, 2),
        "utf-8",
      );
    });
  });

  describe("createSession", () => {
    it("should create session with provided branch", async () => {
      vi.mocked(useGit.getCurrentCommit).mockResolvedValue("abc123");

      const result = await createSession("feature-branch");

      expect(result.branch).toBe("feature-branch");
      expect(result.startCommit).toBe("abc123");
      expect(result.id).toBeDefined();
      expect(result.startedAt).toBeDefined();
      expect(result.iterations).toEqual([]);
    });

    it("should use current branch if no branch provided", async () => {
      vi.mocked(useGit.getCurrentBranch).mockResolvedValue("main");
      vi.mocked(useGit.getCurrentCommit).mockResolvedValue("abc123");

      const result = await createSession();

      expect(result.branch).toBe("main");
      expect(result.startCommit).toBe("abc123");
      expect(useGit.getCurrentBranch).toHaveBeenCalled();
    });

    it("should use 'unknown' if git operations fail", async () => {
      vi.mocked(useGit.getCurrentBranch).mockResolvedValue(null);
      vi.mocked(useGit.getCurrentCommit).mockResolvedValue(null);

      const result = await createSession();

      expect(result.branch).toBe("unknown");
      expect(result.startCommit).toBe("unknown");
    });

    it("should generate unique session IDs", async () => {
      vi.mocked(useGit.getCurrentBranch).mockResolvedValue("main");
      vi.mocked(useGit.getCurrentCommit).mockResolvedValue("abc123");

      const session1 = await createSession();
      const session2 = await createSession();

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe("saveCheckpoint", () => {
    it("should save checkpoint with current commit", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(useGit.getCurrentCommit).mockResolvedValue("def456");

      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      await saveCheckpoint(mockRalphDir, mockSession, 3);

      expect(writeFile).toHaveBeenCalledOnce();
      const savedData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string);
      expect(savedData.checkpoint).toEqual({
        iteration: 3,
        commit: "def456",
        timestamp: expect.any(String),
      });
    });

    it("should use 'unknown' if getCurrentCommit fails", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(useGit.getCurrentCommit).mockResolvedValue(null);

      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      await saveCheckpoint(mockRalphDir, mockSession, 2);

      const savedData = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string);
      expect(savedData.checkpoint.commit).toBe("unknown");
    });
  });

  describe("resumeFromCheckpoint", () => {
    it("should return null if no session exists", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await resumeFromCheckpoint(mockRalphDir);

      expect(result).toBeNull();
    });

    it("should return null if session has no checkpoint", async () => {
      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession));

      const result = await resumeFromCheckpoint(mockRalphDir);

      expect(result).toBeNull();
    });

    it("should return session and next iteration number", async () => {
      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
        checkpoint: {
          iteration: 3,
          timestamp: "2024-01-01T00:10:00.000Z",
          commit: "def456",
        },
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession));

      const result = await resumeFromCheckpoint(mockRalphDir);

      expect(result).not.toBeNull();
      expect(result?.session).toEqual(mockSession);
      expect(result?.resumeIteration).toBe(4); // checkpoint.iteration + 1
    });
  });

  describe("addIterationResult", () => {
    it("should add iteration result and calculate cumulative cost", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
        totalCostUsd: 0.5,
      };

      const mockResult: IterationResult = {
        iteration: 1,
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: "2024-01-01T00:02:00.000Z",
        durationSeconds: 60,
        success: true,
        output: "Test output",
        prdComplete: false,
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          totalCostUsd: 0.25,
        },
      };

      const result = await addIterationResult(mockRalphDir, mockSession, mockResult);

      expect(result.iterations).toHaveLength(1);
      expect(result.iterations[0]).toEqual(mockResult);
      expect(result.totalCostUsd).toBe(0.75); // 0.5 + 0.25
    });

    it("should handle missing usage data", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      const mockResult: IterationResult = {
        iteration: 1,
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: "2024-01-01T00:02:00.000Z",
        durationSeconds: 60,
        success: true,
        output: "Test output",
        prdComplete: false,
      };

      const result = await addIterationResult(mockRalphDir, mockSession, mockResult);

      expect(result.totalCostUsd).toBe(0);
    });

    it("should initialize totalCostUsd if not present", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      const mockResult: IterationResult = {
        iteration: 1,
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: "2024-01-01T00:02:00.000Z",
        durationSeconds: 60,
        success: true,
        output: "Test output",
        prdComplete: false,
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          totalCostUsd: 0.3,
        },
      };

      const result = await addIterationResult(mockRalphDir, mockSession, mockResult);

      expect(result.totalCostUsd).toBe(0.3);
    });
  });

  describe("clearSession", () => {
    it("should write empty object if session file exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await clearSession(mockRalphDir);

      expect(writeFile).toHaveBeenCalledWith(mockSessionPath, "{}", "utf-8");
    });

    it("should not write if session file does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await clearSession(mockRalphDir);

      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe("canResumeSession", () => {
    it("should return false if no session exists", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await canResumeSession(mockRalphDir);

      expect(result).toBe(false);
    });

    it("should return false if session has no checkpoint", async () => {
      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession));

      const result = await canResumeSession(mockRalphDir);

      expect(result).toBe(false);
    });

    it("should return true if session has checkpoint", async () => {
      const mockSession: SessionState = {
        id: "test-id",
        startedAt: "2024-01-01T00:00:00.000Z",
        startCommit: "abc123",
        branch: "main",
        iterations: [],
        checkpoint: {
          iteration: 2,
          timestamp: "2024-01-01T00:05:00.000Z",
          commit: "def456",
        },
      };

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockSession));

      const result = await canResumeSession(mockRalphDir);

      expect(result).toBe(true);
    });
  });
});
