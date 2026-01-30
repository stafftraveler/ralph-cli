import { Box, Text } from "ink";

export interface StatusBarProps {
  /** The ngrok public URL */
  url: string | null;
  /** Whether ngrok is connecting */
  isConnecting: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Status bar component that displays ngrok URL at the bottom of the terminal
 */
export function StatusBar({ url, isConnecting, error }: StatusBarProps) {
  if (error) {
    // Show a more helpful message for missing auth token
    const isAuthError = error.includes("NGROK_AUTHTOKEN");
    const message = isAuthError
      ? "Dashboard unavailable: Set NGROK_AUTHTOKEN to enable remote monitoring"
      : `Dashboard unavailable: ${error}`;

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
      <Box borderStyle="round" borderColor="green" paddingX={1} marginTop={1}>
        <Text>
          <Text color="green" bold>
            Dashboard:
          </Text>{" "}
          <Text color="cyan">{url}</Text>
        </Text>
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
