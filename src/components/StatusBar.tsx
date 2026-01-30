import { Box, Text } from "ink";

export interface StatusBarProps {
  /** The public tunnel URL */
  url: string | null;
  /** Whether tunnel is connecting */
  isConnecting: boolean;
  /** Error message if any */
  error: string | null;
  /** Tunnel password for bypassing reminder page */
  password?: string | null;
}

/**
 * Status bar component that displays tunnel URL at the bottom of the terminal
 */
export function StatusBar({ url, isConnecting, error, password }: StatusBarProps) {
  if (error) {
    const message = `Dashboard unavailable: ${error}`;

    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
        <Text color="yellow">{message}</Text>
      </Box>
    );
  }

  if (isConnecting) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
        <Text color="yellow">Starting dashboard...</Text>
      </Box>
    );
  }

  if (url) {
    return (
      <Box
        borderStyle="round"
        borderColor="green"
        paddingX={1}
        marginTop={1}
        flexDirection="column"
      >
        <Text>
          <Text color="green" bold>
            Dashboard:
          </Text>{" "}
          <Text color="cyan">{url}</Text>
        </Text>
        {password && (
          <Text dimColor>
            Tunnel password: <Text color="yellow">{password}</Text>
          </Text>
        )}
      </Box>
    );
  }

  // Always show local dashboard URL as fallback
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
      <Text>
        <Text color="cyan" bold>
          Local Dashboard:
        </Text>{" "}
        <Text color="white">http://localhost:3737</Text>
      </Text>
    </Box>
  );
}
