import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useCallback, useState } from "react";
import { setLinearToken, testLinearConnection } from "../lib/linear.js";

/**
 * Props for the LinearAuthPrompt component
 */
export interface LinearAuthPromptProps {
  /** Called when authentication is successful */
  onComplete: () => void;
  /** Called if user wants to cancel */
  onCancel?: () => void;
}

type Phase = "input" | "validating" | "success" | "error";

/**
 * LinearAuthPrompt component for entering and validating Linear API key.
 *
 * Flow:
 * 1. Show instructions and URL to get API key
 * 2. Accept API key input
 * 3. Validate the key by testing the connection
 * 4. Save to keychain on success
 */
export function LinearAuthPrompt({ onComplete, onCancel }: LinearAuthPromptProps) {
  const [phase, setPhase] = useState<Phase>("input");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();

      // Validate format
      if (!trimmed.startsWith("lin_api_")) {
        setError("Invalid API key format. Linear API keys start with 'lin_api_'");
        setPhase("error");
        return;
      }

      setPhase("validating");

      // Test the connection
      const result = await testLinearConnection(trimmed);

      if (result.success) {
        // Save to keychain
        const saved = await setLinearToken(trimmed, true);
        setUserName(result.userName ?? null);

        if (!saved) {
          // Continue anyway, token is in memory
          console.warn("Warning: Could not save Linear API key to keychain");
        }

        setPhase("success");
        // Brief delay to show success message
        setTimeout(() => {
          onComplete();
        }, 1000);
      } else {
        setError(result.error ?? "Failed to connect to Linear");
        setPhase("error");
      }
    },
    [onComplete],
  );

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (phase === "error") {
        if (input === "r" || key.return) {
          setError(null);
          setApiKey("");
          setPhase("input");
        } else if (input === "q" || key.escape) {
          onCancel?.();
        }
      }
    },
    { isActive: phase === "error" },
  );

  if (phase === "input") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">
            Linear API Key Required
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text>To connect to Linear, you need a personal API key.</Text>
          <Text>Create one at:</Text>
          <Text color="cyan" bold>
            https://linear.app/stafftraveler/settings/account/security
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color="gray">
            Select &quot;Personal API keys&quot; → &quot;Create key&quot; → Copy the key
          </Text>
        </Box>

        <Box>
          <Text>API Key: </Text>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={handleSubmit}
            mask="*"
            placeholder="lin_api_..."
          />
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Press [Enter] to validate • [Esc] to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "validating") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Validating Linear API key...</Text>
      </Box>
    );
  }

  if (phase === "success") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box>
          <Text color="green">✓ Connected to Linear</Text>
          {userName && <Text color="gray"> as {userName}</Text>}
        </Box>
        <Box>
          <Text color="gray">API key saved to keychain</Text>
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
        <Box flexDirection="column">
          <Text color="gray">Press [r] or [Enter] to try again</Text>
          <Text color="gray">Press [q] or [Esc] to cancel</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
