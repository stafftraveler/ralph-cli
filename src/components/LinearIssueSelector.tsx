import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchIssueByIdentifier,
  fetchIssues,
  fetchRecentIssues,
  parseLinearUrl,
} from "../lib/linear.js";
import type { LinearIssue } from "../types.js";

/**
 * Props for the LinearIssueSelector component
 */
export interface LinearIssueSelectorProps {
  /** Team ID to fetch issues from */
  teamId: string;
  /** Called when issues are selected and confirmed */
  onSelect: (issues: LinearIssue[]) => void;
  /** Called if user wants to cancel */
  onCancel?: () => void;
}

type Phase = "loading" | "select" | "searching" | "error";

/**
 * LinearIssueSelector component for searching and selecting Linear issues.
 *
 * Features:
 * - Search while typing (debounced)
 * - Paste Linear URL to add specific issue
 * - Multi-select with space to toggle
 * - Shows "Todo" issues by default when search is empty
 */
export function LinearIssueSelector({ teamId, onSelect, onCancel }: LinearIssueSelectorProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [error, _setError] = useState<string | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial recent issues
  useEffect(() => {
    async function loadInitial() {
      const recentIssues = await fetchRecentIssues(teamId, 5);
      setIssues(recentIssues);
      setPhase("select");
    }

    void loadInitial();
  }, [teamId]);

  // Handle search query changes with debounce
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Check if it's a Linear URL
      const identifier = parseLinearUrl(value);
      if (identifier) {
        // Immediately fetch the specific issue
        setPhase("searching");
        void (async () => {
          const issue = await fetchIssueByIdentifier(identifier);
          if (issue) {
            // Add to existing issues if not already there
            setIssues((prev) => {
              const exists = prev.some((i) => i.id === issue.id);
              if (exists) return prev;
              return [issue, ...prev];
            });
            // Auto-select the pasted issue
            setSelectedIds((prev) => new Set([...prev, issue.id]));
            setHighlightIndex(0);
          }
          setQuery("");
          setPhase("select");
        })();
        return;
      }

      // Debounce regular search
      debounceRef.current = setTimeout(async () => {
        if (!value.trim()) {
          // Empty query - show recent issues
          setPhase("searching");
          const recentIssues = await fetchRecentIssues(teamId, 5);
          setIssues(recentIssues);
          setHighlightIndex(0);
          setPhase("select");
        } else {
          // Search for issues
          setPhase("searching");
          const searchResults = await fetchIssues(teamId, { query: value, limit: 10 });
          setIssues(searchResults);
          setHighlightIndex(0);
          setPhase("select");
        }
      }, 300);
    },
    [teamId],
  );

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (phase !== "select") return;

      if (key.upArrow) {
        setHighlightIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setHighlightIndex((prev) => Math.min(issues.length - 1, prev + 1));
      } else if (input === " " && issues.length > 0) {
        // Toggle selection
        const issue = issues[highlightIndex];
        if (issue) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(issue.id)) {
              next.delete(issue.id);
            } else {
              next.add(issue.id);
            }
            return next;
          });
        }
      } else if (key.return) {
        if (selectedIds.size > 0) {
          // Submit selected issues
          const selectedIssues = issues.filter((i) => selectedIds.has(i.id));
          onSelect(selectedIssues);
        }
      } else if (key.escape) {
        onCancel?.();
      }
    },
    { isActive: phase === "select" },
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (phase === "loading") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading issues...</Text>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
        <Text color="gray">Press [Esc] to go back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Select Linear issues:</Text>
        {selectedIds.size > 0 && <Text color="green"> ({selectedIds.size} selected)</Text>}
      </Box>

      {/* Search input */}
      <Box marginBottom={1}>
        <Text color="cyan">❯ </Text>
        <TextInput
          value={query}
          onChange={handleQueryChange}
          placeholder="Search issues or paste Linear URL..."
        />
        {phase === "searching" && (
          <Text color="cyan">
            {" "}
            <Spinner type="dots" />
          </Text>
        )}
      </Box>

      {/* Issue list */}
      <Box flexDirection="column" marginBottom={1}>
        {issues.length === 0 ? (
          <Text color="gray">No issues found</Text>
        ) : (
          issues.map((issue, index) => {
            const isHighlighted = index === highlightIndex;
            const isSelected = selectedIds.has(issue.id);

            return (
              <Box key={issue.id}>
                {/* Selection indicator */}
                <Text color={isSelected ? "green" : "gray"}>{isSelected ? "◉ " : "○ "}</Text>

                {/* Issue ID (dimmed) */}
                <Text color="gray">{issue.identifier.padEnd(10)}</Text>

                {/* Issue title */}
                <Text
                  color={isHighlighted ? "cyan" : undefined}
                  bold={isHighlighted}
                  inverse={isHighlighted}
                >
                  {" "}
                  {issue.title.slice(0, 60)}
                  {issue.title.length > 60 ? "..." : ""}
                </Text>

                {/* Priority indicator */}
                {issue.priority > 0 && issue.priority <= 2 && (
                  <Text color={issue.priority === 1 ? "red" : "yellow"}>
                    {" "}
                    {issue.priority === 1 ? "⚡" : "↑"}
                  </Text>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {/* Help text */}
      <Box flexDirection="column">
        <Text color="gray">
          [↑/↓] Navigate • [Space] Toggle select • [Enter] Confirm{" "}
          {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
        </Text>
        <Text color="gray">[Esc] Cancel • Paste a Linear URL to add specific issue</Text>
      </Box>
    </Box>
  );
}
