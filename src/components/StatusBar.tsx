import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface StatusBarProps {
  /** The public tunnel URL */
  url: string | null;
  /** Whether tunnel is connecting */
  isConnecting: boolean;
  /** Error message if any */
  error: string | null;
  /** Tunnel password (public IP) for accessing the tunnel */
  password?: string | null;
  /** Whether tunnel is reconnecting */
  isReconnecting?: boolean;
  /** Number of reconnection attempts */
  reconnectAttempts?: number;
}

/**
 * Status bar component that displays tunnel URL at the bottom of the terminal
 */
export function StatusBar({
  url,
  isConnecting,
  error,
  password,
  isReconnecting,
  reconnectAttempts,
}: StatusBarProps) {
  if (error) {
    const message = `Dashboard unavailable: ${error}`;

    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
        <Text color="yellow">{message}</Text>
      </Box>
    );
  }

  if (isReconnecting) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
        <Text color="yellow">
          <Spinner type="dots" />{" "}
          Reconnecting tunnel{reconnectAttempts ? ` (attempt ${reconnectAttempts}/5)` : ""}...
        </Text>
      </Box>
    );
  }

  if (isConnecting) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
        <Text color="yellow">
          <Spinner type="dots" /> Starting dashboard...
        </Text>
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
          {password && (
            <Text dimColor>
              {" "}
              (password: <Text color="yellow">{password}</Text>)
            </Text>
          )}
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
