import { useInput } from "ink";
import { useCallback, useState } from "react";

/**
 * Keyboard shortcut handler function
 */
type KeyHandler = () => void;

/**
 * Map of key characters to handler functions
 */
interface KeyHandlers {
  [key: string]: KeyHandler;
}

/**
 * Options for useKeyboardShortcuts hook
 */
interface UseKeyboardShortcutsOptions {
  /** Whether keyboard handling is active */
  isActive?: boolean;
  /** Handler for quit (q key) */
  onQuit?: () => void;
  /** Handler for toggle verbose (v key) */
  onToggleVerbose?: () => void;
  /** Handler for toggle debug (d key) */
  onToggleDebug?: () => void;
  /** Handler for toggle pause (p key) */
  onTogglePause?: () => void;
  /** Handler for increment iterations (up arrow) */
  onIncrementIterations?: () => void;
  /** Handler for decrement iterations (down arrow) */
  onDecrementIterations?: () => void;
  /** Additional custom key handlers */
  handlers?: KeyHandlers;
}

/**
 * State returned by useKeyboardShortcuts
 */
interface KeyboardState {
  verbose: boolean;
  debug: boolean;
  pauseAfterIteration: boolean;
}

/**
 * Actions returned by useKeyboardShortcuts
 */
interface KeyboardActions {
  setVerbose: (value: boolean) => void;
  setDebug: (value: boolean) => void;
  setPauseAfterIteration: (value: boolean) => void;
  toggleVerbose: () => void;
  toggleDebug: () => void;
  togglePauseAfterIteration: () => void;
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
  const {
    isActive = true,
    onQuit,
    onToggleVerbose,
    onToggleDebug,
    onTogglePause,
    onIncrementIterations,
    onDecrementIterations,
    handlers = {},
  } = options;

  const [verbose, setVerbose] = useState(false);
  const [debug, setDebug] = useState(false);
  const [pauseAfterIteration, setPauseAfterIteration] = useState(false);

  const toggleVerbose = useCallback(() => {
    setVerbose((prev) => !prev);
    onToggleVerbose?.();
  }, [onToggleVerbose]);

  const toggleDebug = useCallback(() => {
    setDebug((prev) => !prev);
    onToggleDebug?.();
  }, [onToggleDebug]);

  const togglePauseAfterIteration = useCallback(() => {
    setPauseAfterIteration((prev) => !prev);
    onTogglePause?.();
  }, [onTogglePause]);

  useInput(
    (input, key) => {
      // Handle Ctrl+C as quit
      if (key.ctrl && input === "c") {
        onQuit?.();
        return;
      }

      // Handle arrow keys for iteration adjustment
      if (key.upArrow) {
        onIncrementIterations?.();
        return;
      }
      if (key.downArrow) {
        onDecrementIterations?.();
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
        case "p":
          togglePauseAfterIteration();
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
    pauseAfterIteration,
  };

  const actions: KeyboardActions = {
    setVerbose,
    setDebug,
    setPauseAfterIteration,
    toggleVerbose,
    toggleDebug,
    togglePauseAfterIteration,
  };

  return [state, actions];
}
