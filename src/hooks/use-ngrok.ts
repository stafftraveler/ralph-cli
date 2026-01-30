import ngrok from "ngrok";
import { useEffect, useState } from "react";

/**
 * State returned by useNgrok hook
 */
export interface UseNgrokState {
  /** Public URL from ngrok, or null if not connected */
  url: string | null;
  /** Whether ngrok is currently connecting */
  isConnecting: boolean;
  /** Error message if connection failed */
  error: string | null;
}

/**
 * Hook to manage ngrok tunnel lifecycle
 *
 * Automatically starts an ngrok tunnel for the given port and
 * cleans up when the component unmounts.
 *
 * @param port - Port to expose via ngrok
 * @param enabled - Whether to start the tunnel (default: true)
 * @returns State object with url, isConnecting, and error
 */
export function useNgrok(port: number, enabled = true): UseNgrokState {
  const [url, setUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    async function startNgrok() {
      setIsConnecting(true);
      setError(null);

      try {
        const tunnelUrl = await ngrok.connect({
          addr: port,
          authtoken_from_env: true, // Use NGROK_AUTHTOKEN env var if available
        });

        if (isMounted) {
          setUrl(tunnelUrl);
          setIsConnecting(false);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setIsConnecting(false);
        }
      }
    }

    startNgrok();

    return () => {
      isMounted = false;
      // Disconnect ngrok tunnel on cleanup
      ngrok.disconnect().catch(() => {
        // Ignore disconnect errors
      });
    };
  }, [port, enabled]);

  return { url, isConnecting, error };
}

/**
 * Standalone function to start ngrok tunnel
 *
 * @param port - Port to expose via ngrok
 * @returns Public URL from ngrok
 */
export async function startNgrokTunnel(port: number): Promise<string> {
  try {
    const url = await ngrok.connect({
      addr: port,
      authtoken_from_env: true,
    });
    return url;
  } catch (err) {
    throw new Error(
      `Failed to start ngrok tunnel: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Standalone function to stop ngrok tunnel
 */
export async function stopNgrokTunnel(): Promise<void> {
  try {
    await ngrok.disconnect();
  } catch (_err) {
    // Ignore disconnect errors
  }
}
