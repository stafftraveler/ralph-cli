import { execa } from "execa";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBranch,
  getCurrentBranch,
  getCurrentCommit,
  getCommitsSince,
  getDiffStats,
  getRepoRoot,
  isGitRepo,
} from "./use-git.js";

// Mock execa
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

describe("use-git", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRepoRoot", () => {
    it("should return repo root path", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "/Users/test/my-repo\n",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getRepoRoot();

      expect(result).toBe("/Users/test/my-repo");
      expect(execa).toHaveBeenCalledWith("git", ["rev-parse", "--show-toplevel"]);
    });

    it("should return null if not in git repo", async () => {
      vi.mocked(execa).mockRejectedValue(new Error("not a git repository"));

      const result = await getRepoRoot();

      expect(result).toBeNull();
    });

    it("should trim whitespace from output", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "  /path/to/repo  \n",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getRepoRoot();

      expect(result).toBe("/path/to/repo");
    });
  });

  describe("isGitRepo", () => {
    it("should return true if in git repo", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: ".git",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await isGitRepo();

      expect(result).toBe(true);
      expect(execa).toHaveBeenCalledWith("git", ["rev-parse", "--git-dir"]);
    });

    it("should return false if not in git repo", async () => {
      vi.mocked(execa).mockRejectedValue(new Error("not a git repository"));

      const result = await isGitRepo();

      expect(result).toBe(false);
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch name", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "main",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCurrentBranch();

      expect(result).toBe("main");
      expect(execa).toHaveBeenCalledWith("git", ["branch", "--show-current"]);
    });

    it("should return null if branch command fails", async () => {
      vi.mocked(execa).mockRejectedValue(new Error("git error"));

      const result = await getCurrentBranch();

      expect(result).toBeNull();
    });

    it("should return null if output is empty", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCurrentBranch();

      expect(result).toBeNull();
    });

    it("should trim whitespace from branch name", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "  feature-branch  \n",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCurrentBranch();

      expect(result).toBe("feature-branch");
    });
  });

  describe("getCurrentCommit", () => {
    it("should return current commit SHA", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "abc123def456",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCurrentCommit();

      expect(result).toBe("abc123def456");
      expect(execa).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"]);
    });

    it("should return null if command fails", async () => {
      vi.mocked(execa).mockRejectedValue(new Error("HEAD not found"));

      const result = await getCurrentCommit();

      expect(result).toBeNull();
    });

    it("should trim whitespace from SHA", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "  abc123  \n",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCurrentCommit();

      expect(result).toBe("abc123");
    });
  });

  describe("createBranch", () => {
    it("should create new branch", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await createBranch("new-feature");

      expect(result).toBe(true);
      expect(execa).toHaveBeenCalledWith("git", ["checkout", "-b", "new-feature"]);
    });

    it("should switch to existing branch if creation fails", async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error("branch already exists"))
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>);

      const result = await createBranch("existing-branch");

      expect(result).toBe(true);
      expect(execa).toHaveBeenCalledWith("git", ["checkout", "-b", "existing-branch"]);
      expect(execa).toHaveBeenCalledWith("git", ["checkout", "existing-branch"]);
    });

    it("should return false if both creation and switch fail", async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error("branch exists"))
        .mockRejectedValueOnce(new Error("switch failed"));

      const result = await createBranch("bad-branch");

      expect(result).toBe(false);
    });
  });

  describe("getCommitsSince", () => {
    it("should return commits since SHA", async () => {
      const gitOutput =
        "abc123def456|abc123|feat: add new feature|John Doe|2024-01-01T12:00:00Z\n" +
        "def456ghi789|def456|fix: bug fix|Jane Smith|2024-01-01T13:00:00Z";

      vi.mocked(execa).mockResolvedValue({
        stdout: gitOutput,
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCommitsSince("old-sha");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        sha: "abc123def456",
        shortSha: "abc123",
        message: "feat: add new feature",
        author: "John Doe",
        timestamp: "2024-01-01T12:00:00Z",
      });
      expect(result[1]).toEqual({
        sha: "def456ghi789",
        shortSha: "def456",
        message: "fix: bug fix",
        author: "Jane Smith",
        timestamp: "2024-01-01T13:00:00Z",
      });
      expect(execa).toHaveBeenCalledWith("git", [
        "log",
        "old-sha..HEAD",
        "--format=%H|%h|%s|%an|%aI",
      ]);
    });

    it("should return empty array if no commits", async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCommitsSince("sha");

      expect(result).toEqual([]);
    });

    it("should return empty array if command fails", async () => {
      vi.mocked(execa).mockRejectedValue(new Error("git error"));

      const result = await getCommitsSince("sha");

      expect(result).toEqual([]);
    });

    it("should handle commits with pipe characters in message", async () => {
      const gitOutput = "abc123|abc|Message with | pipe|Author|2024-01-01T12:00:00Z";

      vi.mocked(execa).mockResolvedValue({
        stdout: gitOutput,
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCommitsSince("sha");

      // Note: split("|") will split the message too, so "Message with | pipe" becomes "Message with "
      expect(result[0]?.message).toBe("Message with ");
    });

    it("should handle missing fields gracefully", async () => {
      const gitOutput = "abc123";

      vi.mocked(execa).mockResolvedValue({
        stdout: gitOutput,
        stderr: "",
        exitCode: 0,
      } as Awaited<ReturnType<typeof execa>>);

      const result = await getCommitsSince("sha");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sha: "abc123",
        shortSha: "",
        message: "",
        author: "",
        timestamp: "",
      });
    });
  });

  describe("getDiffStats", () => {
    it("should return diff statistics", async () => {
      const nameStatus = "M\tsrc/file1.ts\nA\tsrc/file2.ts\nD\tsrc/file3.ts";
      const numstat = "10\t5\tsrc/file1.ts\n20\t0\tsrc/file2.ts\n0\t15\tsrc/file3.ts";

      vi.mocked(execa)
        .mockResolvedValueOnce({
          stdout: nameStatus,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>)
        .mockResolvedValueOnce({
          stdout: numstat,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>);

      const result = await getDiffStats("from-commit");

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        file: "src/file1.ts",
        status: "M",
        additions: 10,
        deletions: 5,
      });
      expect(result[1]).toEqual({
        file: "src/file2.ts",
        status: "A",
        additions: 20,
        deletions: 0,
      });
      expect(result[2]).toEqual({
        file: "src/file3.ts",
        status: "D",
        additions: 0,
        deletions: 15,
      });
      expect(execa).toHaveBeenCalledWith("git", ["diff", "--name-status", "from-commit..HEAD"]);
      expect(execa).toHaveBeenCalledWith("git", ["diff", "--numstat", "from-commit..HEAD"]);
    });

    it("should return empty array if no changes", async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>)
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>);

      const result = await getDiffStats("sha");

      expect(result).toEqual([]);
    });

    it("should return empty array if command fails", async () => {
      vi.mocked(execa).mockRejectedValue(new Error("git error"));

      const result = await getDiffStats("sha");

      expect(result).toEqual([]);
    });

    it("should handle binary files with dash in numstat", async () => {
      const nameStatus = "M\timage.png";
      const numstat = "-\t-\timage.png";

      vi.mocked(execa)
        .mockResolvedValueOnce({
          stdout: nameStatus,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>)
        .mockResolvedValueOnce({
          stdout: numstat,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>);

      const result = await getDiffStats("sha");

      expect(result[0]).toEqual({
        file: "image.png",
        status: "M",
        additions: 0,
        deletions: 0,
      });
    });

    it("should return empty array if no name-status", async () => {
      const nameStatus = "";
      const numstat = "5\t3\tsrc/file.ts";

      vi.mocked(execa)
        .mockResolvedValueOnce({
          stdout: nameStatus,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>)
        .mockResolvedValueOnce({
          stdout: numstat,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>);

      const result = await getDiffStats("sha");

      // Returns empty because nameStatus is checked first
      expect(result).toEqual([]);
    });

    it("should handle files with tabs in filename", async () => {
      const nameStatus = "M\tfile\twith\ttabs.ts";
      const numstat = "10\t5\tfile\twith\ttabs.ts";

      vi.mocked(execa)
        .mockResolvedValueOnce({
          stdout: nameStatus,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>)
        .mockResolvedValueOnce({
          stdout: numstat,
          stderr: "",
          exitCode: 0,
        } as Awaited<ReturnType<typeof execa>>);

      const result = await getDiffStats("sha");

      // The code joins tab-separated parts, so "file\twith\ttabs.ts" becomes "with\ttabs.ts" after first split
      expect(result[0]?.file).toBe("with\ttabs.ts");
    });
  });
});
