import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

/**
 * Props for the ApiKeyPrompt component
 */
export interface ApiKeyPromptProps {
  /** Called when the API key is submitted */
  onSubmit: (apiKey: string) => void;
  /** Called when the user skips/cancels */
  onSkip?: () => void;
}

/**
 * Interactive prompt for entering the Anthropic API key
 *
 * Validates the key format and sets it in the environment.
 * Provides instructions for persisting the key.
 */
export function ApiKeyPrompt({ onSubmit, onSkip }: ApiKeyPromptProps) {
  const { exit } = useApp();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useInput((input, key) => {
    if (key.escape) {
      if (onSkip) {
        onSkip();
      } else {
        exit();
      }
    }
  });

  const handleSubmit = (inputValue: string) => {
    const trimmed = inputValue.trim();

    if (!trimmed) {
      setError("API key cannot be empty");
      return;
    }

    if (!trimmed.startsWith("sk-ant-")) {
      setError("Invalid API key format. Expected: sk-ant-...");
      return;
    }

    // Set the API key in the environment for this session
    process.env.ANTHROPIC_API_KEY = trimmed;
    setIsSubmitted(true);
    setError(null);

    // Brief delay to show success message
    setTimeout(() => {
      onSubmit(trimmed);
    }, 500);
  };

  if (isSubmitted) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="green">✓ API key set for this session</Text>
        <Box marginTop={1}>
          <Text color="gray">
            To persist, add to your shell profile (~/.zshrc or ~/.bashrc):
          </Text>
        </Box>
        <Box marginLeft={2}>
          <Text color="yellow">
            export ANTHROPIC_API_KEY={value.slice(0, 15)}...
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          ANTHROPIC_API_KEY not found
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          Get your API key from: https://console.anthropic.com/settings/keys
        </Text>
      </Box>

      <Box>
        <Text>Enter API key: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          mask="*"
          placeholder="sk-ant-api03-..."
        />
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Press Enter to submit, Escape to cancel
        </Text>
      </Box>
    </Box>
  );
}
