import { useInput } from "ink";
import { useCallback, useState } from "react";

/**
 * Keyboard shortcut handler function
 */
export type KeyHandler = () => void;

/**
 * Map of key characters to handler functions
 */
export interface KeyHandlers {
  [key: string]: KeyHandler;
}

/**
 * Options for useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsOptions {
  /** Whether keyboard handling is active */
  isActive?: boolean;
  /** Handler for quit (q key) */
  onQuit?: () => void;
  /** Handler for toggle verbose (v key) */
  onToggleVerbose?: () => void;
  /** Handler for toggle debug (d key) */
  onToggleDebug?: () => void;
  /** Additional custom key handlers */
  handlers?: KeyHandlers;
}

/**
 * State returned by useKeyboardShortcuts
 */
export interface KeyboardState {
  verbose: boolean;
  debug: boolean;
}

/**
 * Actions returned by useKeyboardShortcuts
 */
export interface KeyboardActions {
  setVerbose: (value: boolean) => void;
  setDebug: (value: boolean) => void;
  toggleVerbose: () => void;
  toggleDebug: () => void;
}

/**
 * Hook for handling keyboard shortcuts in Ralph CLI
 *
 * Wraps Ink's useInput with common shortcut patterns:
 * - q: Quit
 * - v: Toggle verbose mode
 * - d: Toggle debug mode
 *
 * @example
 * ```tsx
 * const [state, actions] = useKeyboardShortcuts({
 *   isActive: true,
 *   onQuit: () => process.exit(0),
 * });
 * ```
 */
export function useKeyboardShortcuts(
  options: UseKeyboardShortcutsOptions = {},
): [KeyboardState, KeyboardActions] {
  const { isActive = true, onQuit, onToggleVerbose, onToggleDebug, handlers = {} } = options;

  const [verbose, setVerbose] = useState(false);
  const [debug, setDebug] = useState(false);

  const toggleVerbose = useCallback(() => {
    setVerbose((prev) => !prev);
    onToggleVerbose?.();
  }, [onToggleVerbose]);

  const toggleDebug = useCallback(() => {
    setDebug((prev) => !prev);
    onToggleDebug?.();
  }, [onToggleDebug]);

  useInput(
    (input, key) => {
      // Handle Ctrl+C as quit
      if (key.ctrl && input === "c") {
        onQuit?.();
        return;
      }

      // Standard shortcuts
      switch (input.toLowerCase()) {
        case "q":
          onQuit?.();
          break;
        case "v":
          toggleVerbose();
          break;
        case "d":
          toggleDebug();
          break;
        default:
          // Check custom handlers
          if (handlers[input]) {
            handlers[input]();
          }
          break;
      }
    },
    { isActive },
  );

  const state: KeyboardState = {
    verbose,
    debug,
  };

  const actions: KeyboardActions = {
    setVerbose,
    setDebug,
    toggleVerbose,
    toggleDebug,
  };

  return [state, actions];
}
