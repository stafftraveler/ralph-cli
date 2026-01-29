import { execa } from "execa";

/**
 * Opens a file in the user's preferred editor and waits for it to close.
 *
 * Tries editors in order:
 * 1. $EDITOR environment variable
 * 2. VS Code (code --wait)
 * 3. Falls back to printing path for manual editing
 *
 * @param filePath - Absolute path to the file to edit
 * @returns true if editor was opened, false if fallback was used
 */
export async function openInEditor(filePath: string): Promise<boolean> {
  const editor = process.env.EDITOR;

  // Try $EDITOR first
  if (editor) {
    try {
      await execa(editor, [filePath], { stdio: "inherit" });
      return true;
    } catch {
      // Editor failed, try next option
    }
  }

  // Try VS Code with --wait
  try {
    await execa("code", ["--wait", filePath], { stdio: "inherit" });
    return true;
  } catch {
    // VS Code not available or failed
  }

  // Fallback: print path for manual editing
  return false;
}
