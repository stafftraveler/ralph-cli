import localtunnel from "localtunnel";
import type { Tunnel } from "localtunnel";
import { useEffect, useState } from "react";

/**
 * State returned by useTunnel hook
 */
export interface UseTunnelState {
  /** Public URL from tunnel, or null if not connected */
  url: string | null;
  /** Whether tunnel is currently connecting */
  isConnecting: boolean;
  /** Error message if connection failed */
  error: string | null;
  /** Tunnel password for bypassing the reminder page */
  password: string | null;
}

/**
 * Hook to manage localtunnel lifecycle
 *
 * Automatically starts a localtunnel for the given port and
 * cleans up when the component unmounts.
 *
 * @param port - Port to expose via tunnel
 * @param enabled - Whether to start the tunnel (default: true)
 * @returns State object with url, isConnecting, and error
 */
export function useTunnel(port: number, enabled = true): UseTunnelState {
  const [url, setUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;
    let tunnel: Tunnel | null = null;

    async function startTunnel() {
      setIsConnecting(true);
      setError(null);

      try {
        tunnel = await localtunnel({
          port,
          // localtunnel doesn't require authentication
        });

        if (isMounted) {
          setUrl(tunnel.url);
          // Capture the tunnel password for bypassing the reminder page
          // The password is available on the tunnel object from localtunnel
          setPassword((tunnel as unknown as { password?: string }).password ?? null);
          setIsConnecting(false);
        }

        // Handle tunnel close event
        tunnel.on("close", () => {
          if (isMounted) {
            setUrl(null);
            setPassword(null);
            setError("Tunnel closed");
          }
        });

        // Handle tunnel error event
        tunnel.on("error", (err: Error) => {
          if (isMounted) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
          }
        });
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setIsConnecting(false);
        }
      }
    }

    startTunnel();

    return () => {
      isMounted = false;
      // Close tunnel on cleanup
      if (tunnel) {
        tunnel.close();
      }
    };
  }, [port, enabled]);

  return { url, isConnecting, error, password };
}

/**
 * Standalone function to start localtunnel
 *
 * @param port - Port to expose via tunnel
 * @returns Promise with tunnel instance
 */
export async function startTunnel(port: number): Promise<Tunnel> {
  try {
    const tunnel = await localtunnel({ port });
    return tunnel;
  } catch (err) {
    throw new Error(`Failed to start tunnel: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Standalone function to stop tunnel
 */
export async function stopTunnel(tunnel: Tunnel): Promise<void> {
  try {
    tunnel.close();
  } catch (_err) {
    // Ignore close errors
  }
}
