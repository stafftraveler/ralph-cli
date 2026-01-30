import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { setApiKey } from "../lib/claude.js";

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
 * Validates the key format and saves it securely to the macOS Keychain.
 */
export function ApiKeyPrompt({ onSubmit, onSkip }: ApiKeyPromptProps) {
  const { exit } = useApp();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    savedToKeychain: boolean;
  } | null>(null);

  useInput((_input, key) => {
    if (key.escape && !isSubmitting) {
      if (onSkip) {
        onSkip();
      } else {
        exit();
      }
    }
  });

  const handleSubmit = async (inputValue: string) => {
    const trimmed = inputValue.trim();

    if (!trimmed) {
      setError(
        "API key cannot be empty. Get your key at: https://console.anthropic.com/settings/keys",
      );
      return;
    }

    if (!trimmed.startsWith("sk-ant-")) {
      setError(
        "Invalid API key format. Keys should start with 'sk-ant-'. Verify your key at: https://console.anthropic.com/settings/keys",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Save to environment and keychain
    const savedToKeychain = await setApiKey(trimmed, true);

    setSubmitResult({ success: true, savedToKeychain });
  };

  // Handle completion after showing success message
  useEffect(() => {
    if (submitResult?.success) {
      const timer = setTimeout(() => {
        onSubmit(value.trim());
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [submitResult, onSubmit, value]);

  if (submitResult) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="green">✓ API key saved</Text>
        {submitResult.savedToKeychain ? (
          <Box marginTop={1}>
            <Text color="gray">Stored securely in macOS Keychain - no need to enter again</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            <Text color="yellow">⚠ Could not save to Keychain - key set for this session only</Text>
            <Text color="gray">
              To persist manually, add to your shell profile (~/.zshrc or ~/.bashrc):
            </Text>
            <Box marginLeft={2} marginTop={1}>
              <Text color="gray">export ANTHROPIC_API_KEY="{value.slice(0, 15)}..."</Text>
            </Box>
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                Tip: Check keychain access with: security find-generic-password -s ralph-cli
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  const handleSubmitWrapper = (inputValue: string) => {
    void handleSubmit(inputValue);
  };

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          ANTHROPIC_API_KEY not found
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">Get your API key from: https://console.anthropic.com/settings/keys</Text>
      </Box>

      <Box>
        <Text>Enter API key: </Text>
        {isSubmitting ? (
          <Text color="gray">Saving...</Text>
        ) : (
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmitWrapper}
            mask="*"
            placeholder="sk-ant-api03-..."
          />
        )}
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!isSubmitting && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Press Enter to submit, Escape to cancel
          </Text>
        </Box>
      )}
    </Box>
  );
}
