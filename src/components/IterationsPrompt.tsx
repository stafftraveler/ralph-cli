import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

/**
 * Props for the IterationsPrompt component
 */
export interface IterationsPromptProps {
  /** Called when user confirms the number of iterations */
  onSubmit: (iterations: number) => void;
  /** Default value to show */
  defaultValue?: number;
}

/**
 * IterationsPrompt component for entering the number of iterations.
 *
 * Shows a text input for the user to specify how many Claude iterations to run.
 */
export function IterationsPrompt({
  onSubmit,
  defaultValue = 5,
}: IterationsPromptProps) {
  const [value, setValue] = useState(String(defaultValue));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (input: string) => {
    const trimmed = input.trim();

    if (!trimmed) {
      // Use default value
      onSubmit(defaultValue);
      return;
    }

    const parsed = Number.parseInt(trimmed, 10);

    if (Number.isNaN(parsed) || parsed < 1) {
      setError("Please enter a valid number (1 or more)");
      return;
    }

    if (parsed > 100) {
      setError("Maximum 100 iterations allowed");
      return;
    }

    setError(null);
    onSubmit(parsed);
  };

  // Handle escape to use default
  useInput((input, key) => {
    if (key.escape) {
      onSubmit(defaultValue);
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text bold>How many iterations would you like to run?</Text>
      </Box>

      <Box>
        <Text color="cyan">❯ </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={String(defaultValue)}
        />
        <Text color="gray"> (press Enter for {defaultValue})</Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Tip: Each iteration picks a task from PRD.md and works on it
        </Text>
      </Box>
    </Box>
  );
}
