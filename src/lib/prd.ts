import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { PrdTemplate } from "../types.js";
import { wrapError } from "./utils.js";

/**
 * Check if a PRD file has actual tasks (not just template placeholders).
 *
 * Ports the Bash logic:
 * 1. Has actual content beyond headers and placeholders
 * 2. Has at least one list item (-, *, numbered, or checkbox) with real content (not just "...")
 */
export async function prdHasTasks(prdPath: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(prdPath, "utf-8");
  } catch (error) {
    // For prdHasTasks, file not existing is a valid state (means no tasks)
    // Only throw if it's not ENOENT (e.g., permission error)
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const ralphError = wrapError(error, `Failed to read PRD file at ${prdPath}`);
      throw ralphError;
    }
    return false;
  }

  const lines = content.split("\n");

  // Check for list items with actual content (not just "..." or empty)
  // Matches: "- task", "* task", "1. task", "  - nested task", "[ ] task"
  // Rejects: "- ...", "- ", "...", "[x] task" (completed checkboxes)
  const taskPattern = /^[\s]*(?:[-*]|\d+\.|\[ \])\s+(?!\.\.\.)(?!\s*$).+/;

  for (const line of lines) {
    if (taskPattern.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * List available PRD templates from a directory.
 *
 * Returns template metadata sorted by name.
 */
export async function listTemplates(templatesDir: string): Promise<PrdTemplate[]> {
  let entries: string[];
  try {
    entries = await readdir(templatesDir);
  } catch {
    return [];
  }

  const templates: PrdTemplate[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;

    const name = basename(entry, ".md");
    const path = join(templatesDir, entry);

    // Try to extract description from file (first non-empty, non-header line)
    let description: string | undefined;
    try {
      const content = await readFile(path, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and markdown headers
        if (!trimmed || trimmed.startsWith("#")) continue;
        // Use first content line as description (truncate if long)
        description = trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
        break;
      }
    } catch {
      // Ignore read errors, description stays undefined
    }

    templates.push({ name, path, description });
  }

  // Sort alphabetically by name
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}
