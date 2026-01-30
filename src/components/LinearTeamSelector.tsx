import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { fetchTeams } from "../lib/linear.js";
import type { LinearTeam } from "../types.js";

/**
 * Props for the LinearTeamSelector component
 */
export interface LinearTeamSelectorProps {
  /** Pre-selected team ID (from config) */
  defaultTeamId?: string;
  /** Called when a team is selected */
  onSelect: (team: LinearTeam) => void;
  /** Called if user wants to cancel */
  onCancel?: () => void;
}

interface SelectItem {
  label: string;
  value: string;
  team?: LinearTeam;
}

type Phase = "loading" | "select" | "error";

/**
 * LinearTeamSelector component for choosing a Linear team.
 *
 * Flow:
 * 1. Fetch available teams from Linear
 * 2. Show selection list
 * 3. Call onSelect with the chosen team
 */
export function LinearTeamSelector({ defaultTeamId, onSelect, onCancel }: LinearTeamSelectorProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load teams on mount
  useEffect(() => {
    async function loadTeams() {
      const loaded = await fetchTeams();

      if (loaded.length === 0) {
        setError("No teams found. Make sure you have access to at least one team in Linear.");
        setPhase("error");
        return;
      }

      setTeams(loaded);

      // If there's only one team, auto-select it
      if (loaded.length === 1) {
        onSelect(loaded[0]);
        return;
      }

      // If we have a default team ID, try to auto-select it
      if (defaultTeamId) {
        const defaultTeam = loaded.find((t) => t.id === defaultTeamId);
        if (defaultTeam) {
          onSelect(defaultTeam);
          return;
        }
      }

      setPhase("select");
    }

    void loadTeams();
  }, [defaultTeamId, onSelect]);

  // Build select items
  const items: SelectItem[] = teams.map((t) => ({
    label: `${t.name} (${t.key})`,
    value: t.id,
    team: t,
  }));

  // Add cancel option
  items.push({
    label: "Cancel",
    value: "cancel",
  });

  const handleSelect = (item: SelectItem) => {
    if (!item.team) {
      onCancel?.();
      return;
    }
    onSelect(item.team);
  };

  if (phase === "loading") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading teams from Linear...</Text>
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

  if (phase === "select") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold>Select a Linear team:</Text>
        </Box>
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
    );
  }

  return null;
}
