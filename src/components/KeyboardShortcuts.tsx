import { Box, Text } from "ink";

/**
 * Shortcut definition for display
 */
export interface Shortcut {
  key: string;
  label: string;
  enabled?: boolean;
}

/**
 * Props for KeyboardShortcuts component
 */
export interface KeyboardShortcutsProps {
  /** List of shortcuts to display */
  shortcuts?: Shortcut[];
  /** Current verbose mode state */
  verbose?: boolean;
  /** Current debug mode state */
  debug?: boolean;
}

/**
 * Default shortcuts shown during iteration
 */
const DEFAULT_SHORTCUTS: Shortcut[] = [
  { key: "q", label: "Quit" },
  { key: "v", label: "Toggle verbose" },
  { key: "d", label: "Toggle debug" },
];

/**
 * Single shortcut display
 */
function ShortcutItem({
  shortcut,
  active,
}: {
  shortcut: Shortcut;
  active?: boolean;
}) {
  const enabled = shortcut.enabled !== false;
  const color = enabled ? (active ? "green" : "gray") : "gray";

  return (
    <Text color={color}>
      <Text>[</Text>
      <Text color={enabled ? "cyan" : "gray"}>{shortcut.key}</Text>
      <Text>]</Text>
      <Text> {shortcut.label}</Text>
      {active && <Text color="green"> ✓</Text>}
    </Text>
  );
}

/**
 * Keyboard shortcuts bar displayed at bottom of screen
 *
 * Shows available keyboard shortcuts with their current state.
 * Highlights active toggles (verbose/debug) with checkmark.
 */
export function KeyboardShortcuts({
  shortcuts = DEFAULT_SHORTCUTS,
  verbose,
  debug,
}: KeyboardShortcutsProps) {
  return (
    <Box marginTop={1} gap={2}>
      {shortcuts.map((shortcut) => {
        const isActive =
          (shortcut.key === "v" && verbose) || (shortcut.key === "d" && debug);

        return (
          <ShortcutItem
            key={shortcut.key}
            shortcut={shortcut}
            active={isActive}
          />
        );
      })}
    </Box>
  );
}
