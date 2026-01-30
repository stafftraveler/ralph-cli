import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import notifier from "node-notifier";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Options for system notifications
 */
export interface NotifyOptions {
  /** Path to icon image */
  icon?: string;
  /** Path to sound file to play */
  sound?: string;
  /** Whether to play sound (requires sound path) */
  playSound?: boolean;
}

/**
 * Show a system notification with optional sound.
 * Uses node-notifier for cross-platform support.
 * Plays sound via afplay on macOS if configured.
 */
export function notify(title: string, message: string, options: NotifyOptions = {}): void {
  const { icon, sound, playSound = false } = options;

  // Default icon path (relative to lib/)
  const defaultIcon = join(__dirname, "..", "..", "icon.png");
  const iconPath = icon ?? (existsSync(defaultIcon) ? defaultIcon : undefined);

  notifier.notify({
    title,
    message,
    icon: iconPath,
    sound: false, // We handle sound separately for more control
  });

  // Play sound on macOS if enabled and file exists
  if (playSound && sound && existsSync(sound)) {
    // Fire and forget - don't block on sound playback
    execFile("afplay", [sound], (error) => {
      // Silently ignore errors (e.g., afplay not available on non-macOS)
      if (error && process.env.DEBUG) {
        console.error("Sound playback failed:", error.message);
      }
    });
  }
}
