import { existsSync } from "node:fs";
import { bin, install, Tunnel } from "cloudflared";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Maximum reconnection attempts before giving up
 */
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Base delay for exponential backoff (3 seconds)
 */
const BASE_RECONNECT_DELAY = 3000;

/**
 * Minimum time a tunnel must stay alive before we attempt reconnection on close.
 * If a tunnel dies within this period, we assume it's unstable and stop retrying.
 */
const CONNECTION_COOLDOWN = 5000;

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
  /** Whether the tunnel is currently reconnecting */
  isReconnecting: boolean;
  /** Number of reconnection attempts made */
  reconnectAttempts: number;
}

/**
 * Ensure the cloudflared binary is installed
 * Downloads it automatically if not present
 */
async function ensureBinaryInstalled(): Promise<void> {
  if (!existsSync(bin)) {
    await install(bin);
  }
}

/**
 * Hook to manage cloudflared tunnel lifecycle with automatic reconnection
 *
 * Automatically starts a Cloudflare quick tunnel for the given port,
 * monitors connection status via events, and reconnects if the connection drops.
 *
 * @param port - Port to expose via tunnel
 * @param enabled - Whether to start the tunnel (default: true)
 * @returns State object with url, isConnecting, error, and reconnection status
 */
export function useTunnel(port: number, enabled = true): UseTunnelState {
  const [url, setUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Refs to track mutable state across async operations
  const tunnelRef = useRef<Tunnel | null>(null);
  const isMountedRef = useRef(true);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleReconnectRef = useRef<(() => void) | null>(null);
  // Track tunnel instance to prevent stale event handlers from affecting new tunnels
  const tunnelInstanceIdRef = useRef(0);

  /**
   * Clear reconnect timer
   */
  const clearTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Close the current tunnel if it exists
   */
  const closeTunnel = useCallback(() => {
    if (tunnelRef.current) {
      try {
        tunnelRef.current.stop();
      } catch {
        // Ignore close errors
      }
      tunnelRef.current = null;
    }
  }, []);

  /**
   * Start a new tunnel connection
   */
  const startTunnel = useCallback(
    async (isReconnect = false): Promise<boolean> => {
      if (!isMountedRef.current) return false;

      // Close any existing tunnel
      closeTunnel();
      clearTimer();

      // Increment instance ID to invalidate any pending events from old tunnels
      tunnelInstanceIdRef.current += 1;
      const currentInstanceId = tunnelInstanceIdRef.current;

      if (isReconnect) {
        setIsReconnecting(true);
      } else {
        setIsConnecting(true);
      }
      setError(null);

      try {
        // Ensure cloudflared binary is installed
        await ensureBinaryInstalled();

        if (!isMountedRef.current || currentInstanceId !== tunnelInstanceIdRef.current) {
          return false;
        }

        // Create a quick tunnel to our local server
        const tunnel = Tunnel.quick(`http://localhost:${port}`);
        tunnelRef.current = tunnel;

        // Track when the tunnel was established to detect rapid failures
        const connectionTime = Date.now();

        // Wait for the URL to be assigned
        const tunnelUrl = await new Promise<string>((resolve, reject) => {
          const urlTimeout = setTimeout(() => {
            reject(new Error("Timeout waiting for tunnel URL"));
          }, 30000);

          tunnel.once("url", (assignedUrl: string) => {
            clearTimeout(urlTimeout);
            resolve(assignedUrl);
          });

          tunnel.once("error", (err: Error) => {
            clearTimeout(urlTimeout);
            reject(err);
          });
        });

        // Check if this tunnel instance is still current
        if (!isMountedRef.current || currentInstanceId !== tunnelInstanceIdRef.current) {
          tunnel.stop();
          return false;
        }

        setUrl(tunnelUrl);
        setIsConnecting(false);
        setIsReconnecting(false);
        setReconnectAttempts(0);

        // Handle tunnel disconnection - cloudflared emits this when connection drops
        tunnel.on("disconnected", () => {
          if (isMountedRef.current && currentInstanceId === tunnelInstanceIdRef.current) {
            // Check if tunnel died too quickly (within cooldown period)
            const timeSinceConnection = Date.now() - connectionTime;
            if (timeSinceConnection < CONNECTION_COOLDOWN) {
              // Tunnel is unstable - don't retry, show error
              setUrl(null);
              setError("Tunnel connection unstable - disconnected immediately after connecting");
              setIsReconnecting(false);
              return;
            }

            // Tunnel lived long enough - try to reconnect
            scheduleReconnectRef.current?.();
          }
        });

        // Handle tunnel exit - process terminated
        tunnel.on("exit", (code: number | null) => {
          if (isMountedRef.current && currentInstanceId === tunnelInstanceIdRef.current) {
            setUrl(null);

            // Check if tunnel died too quickly (within cooldown period)
            const timeSinceConnection = Date.now() - connectionTime;
            if (timeSinceConnection < CONNECTION_COOLDOWN) {
              // Tunnel is unstable - don't retry, show error
              setError(`Tunnel process exited immediately (code: ${code})`);
              setIsReconnecting(false);
              return;
            }

            // Tunnel lived long enough - try to reconnect
            scheduleReconnectRef.current?.();
          }
        });

        // Handle tunnel errors
        tunnel.on("error", (err: Error) => {
          if (isMountedRef.current && currentInstanceId === tunnelInstanceIdRef.current) {
            // Check if tunnel died too quickly (within cooldown period)
            const timeSinceConnection = Date.now() - connectionTime;
            if (timeSinceConnection < CONNECTION_COOLDOWN) {
              // Tunnel is unstable - don't retry, show error
              setUrl(null);
              setError(`Tunnel error: ${err.message}`);
              setIsReconnecting(false);
              return;
            }

            // Tunnel lived long enough - try to reconnect
            scheduleReconnectRef.current?.();
          }
        });

        return true;
      } catch (err) {
        // Check if this instance is still current before handling error
        if (isMountedRef.current && currentInstanceId === tunnelInstanceIdRef.current) {
          const message = err instanceof Error ? err.message : String(err);

          if (isReconnect) {
            // If this was a reconnect attempt, schedule another one
            scheduleReconnectRef.current?.();
          } else {
            setError(message);
            setIsConnecting(false);
          }
        }
        return false;
      }
    },
    [port, closeTunnel, clearTimer],
  );

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clear existing timer
    clearTimer();

    // Close the dead tunnel
    closeTunnel();

    setReconnectAttempts((prev) => {
      const attempts = prev + 1;

      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        // Give up after max attempts
        setError(`Tunnel connection lost after ${MAX_RECONNECT_ATTEMPTS} reconnection attempts`);
        setIsReconnecting(false);
        setUrl(null);
        return prev;
      }

      // Calculate delay with exponential backoff: 3s, 6s, 12s, 24s, 48s
      const delay = BASE_RECONNECT_DELAY * 2 ** (attempts - 1);

      setIsReconnecting(true);
      setUrl(null);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          void startTunnel(true);
        }
      }, delay);

      return attempts;
    });
  }, [closeTunnel, clearTimer, startTunnel]);

  // Store scheduleReconnect in ref to avoid circular dependencies
  scheduleReconnectRef.current = scheduleReconnect;

  // Start tunnel on mount (when enabled)
  useEffect(() => {
    if (!enabled) {
      return;
    }

    isMountedRef.current = true;
    void startTunnel(false);

    return () => {
      isMountedRef.current = false;
      // Increment instance ID to invalidate any pending async events from old tunnel
      tunnelInstanceIdRef.current += 1;
      clearTimer();
      closeTunnel();
    };
  }, [enabled, startTunnel, clearTimer, closeTunnel]);

  return { url, isConnecting, error, isReconnecting, reconnectAttempts };
}
