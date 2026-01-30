import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useCallback, useEffect, useState } from "react";
import { fetchIssuesFull, generatePrdFromIssues, hasLinearToken } from "../lib/linear.js";
import type { LinearIssue, LinearTeam, RalphConfig } from "../types.js";
import { LinearAuthPrompt } from "./LinearAuthPrompt.js";
import { LinearIssueSelector } from "./LinearIssueSelector.js";
import { LinearTeamSelector } from "./LinearTeamSelector.js";

/**
 * Props for the LinearImport component
 */
export interface LinearImportProps {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Current config (for default team ID) */
  config: RalphConfig;
  /** Called when PRD is generated successfully */
  onComplete: () => void;
  /** Called if user wants to cancel */
  onCancel?: () => void;
}

type Phase =
  | "checking"
  | "auth"
  | "team-select"
  | "issue-select"
  | "generating"
  | "success"
  | "error";

/**
 * LinearImport component orchestrates the Linear import flow.
 *
 * Phases:
 * 1. checking - Check if we have a valid Linear token
 * 2. auth - Show auth prompt if no token
 * 3. team-select - Select a team
 * 4. issue-select - Search and select issues
 * 5. generating - Generate PRD from selected issues
 * 6. success - Show success and proceed
 */
export function LinearImport({ ralphDir, config, onComplete, onCancel }: LinearImportProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [selectedTeam, setSelectedTeam] = useState<LinearTeam | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<LinearIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const prdPath = join(ralphDir, "PRD.md");

  // Check for existing token on mount
  useEffect(() => {
    async function checkToken() {
      const hasToken = await hasLinearToken();
      if (hasToken) {
        setPhase("team-select");
      } else {
        setPhase("auth");
      }
    }

    void checkToken();
  }, []);

  // Handle auth complete
  const handleAuthComplete = useCallback(() => {
    setPhase("team-select");
  }, []);

  // Handle team selection
  const handleTeamSelect = useCallback((team: LinearTeam) => {
    setSelectedTeam(team);
    setPhase("issue-select");
  }, []);

  // Handle issue selection
  const handleIssueSelect = useCallback(
    async (issues: LinearIssue[]) => {
      setSelectedIssues(issues);
      setPhase("generating");

      try {
        // Fetch full issue details (including labels and descriptions) for PRD
        const fullIssues = await fetchIssuesFull(issues);
        setSelectedIssues(fullIssues);

        // Generate PRD content
        const prdContent = generatePrdFromIssues(fullIssues);

        // Write to PRD.md
        await writeFile(prdPath, prdContent, "utf-8");

        setPhase("success");

        // Brief delay to show success message
        setTimeout(() => {
          onComplete();
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate PRD");
        setPhase("error");
      }
    },
    [prdPath, onComplete],
  );

  // Render based on phase
  if (phase === "checking") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Checking Linear connection...</Text>
      </Box>
    );
  }

  if (phase === "auth") {
    return <LinearAuthPrompt onComplete={handleAuthComplete} onCancel={onCancel} />;
  }

  if (phase === "team-select") {
    return (
      <LinearTeamSelector
        defaultTeamId={config.linearDefaultTeamId}
        onSelect={handleTeamSelect}
        onCancel={onCancel}
      />
    );
  }

  if (phase === "issue-select" && selectedTeam) {
    return (
      <LinearIssueSelector
        teamId={selectedTeam.id}
        onSelect={handleIssueSelect}
        onCancel={onCancel}
      />
    );
  }

  if (phase === "generating") {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Generating PRD from {selectedIssues.length} issue(s)...</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "success") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text color="green">✓ PRD generated from Linear issues</Text>
        </Box>
        <Box flexDirection="column">
          <Text>
            Imported {selectedIssues.length} issue{selectedIssues.length !== 1 ? "s" : ""}:
          </Text>
          {selectedIssues.map((issue) => (
            <Text key={issue.id} color="gray">
              • {issue.identifier}: {issue.title.slice(0, 50)}
              {issue.title.length > 50 ? "..." : ""}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
        <Text color="gray">Press any key to go back</Text>
      </Box>
    );
  }

  return null;
}
