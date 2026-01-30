import type { Tunnel } from "localtunnel";
import localtunnel from "localtunnel";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Health check interval in milliseconds (30 seconds)
 */
const HEALTH_CHECK_INTERVAL = 30000;

/**
 * Health check timeout in milliseconds (10 seconds)
 */
const HEALTH_CHECK_TIMEOUT = 10000;

/**
 * Maximum reconnection attempts before giving up
 */
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Base delay for exponential backoff (2 seconds)
 */
const BASE_RECONNECT_DELAY = 2000;

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
  /** Tunnel password (public IP) for accessing the tunnel */
  password: string | null;
  /** Whether the tunnel is currently reconnecting */
  isReconnecting: boolean;
  /** Number of reconnection attempts made */
  reconnectAttempts: number;
}

/**
 * Fetch the tunnel password from loca.lt
 * The password is the public IP of the machine running the tunnel
 */
async function fetchTunnelPassword(): Promise<string | null> {
  try {
    const response = await fetch("https://loca.lt/mytunnelpassword");
    if (response.ok) {
      const text = await response.text();
      return text.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if the tunnel is healthy by making a request to it
 * Returns true if the tunnel responds, false otherwise
 */
async function checkTunnelHealth(tunnelUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(tunnelUrl, {
      method: "HEAD",
      signal: controller.signal,
      // Don't follow redirects - we just want to know if the tunnel is alive
      redirect: "manual",
    });

    clearTimeout(timeoutId);

    // Any response (including redirects and errors from our server) means tunnel is alive
    // We're checking the tunnel itself, not our app
    return response.status !== 502 && response.status !== 504;
  } catch {
    // Network error, timeout, or abort means tunnel is dead
    return false;
  }
}

/**
 * Hook to manage localtunnel lifecycle with automatic health checks and reconnection
 *
 * Automatically starts a localtunnel for the given port, monitors its health,
 * and reconnects if the connection drops.
 *
 * @param port - Port to expose via tunnel
 * @param enabled - Whether to start the tunnel (default: true)
 * @returns State object with url, isConnecting, error, and reconnection status
 */
export function useTunnel(port: number, enabled = true): UseTunnelState {
  const [url, setUrl] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Refs to track mutable state across async operations
  const tunnelRef = useRef<Tunnel | null>(null);
  const isMountedRef = useRef(true);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleReconnectRef = useRef<(() => void) | null>(null);
  // Track tunnel instance to prevent stale event handlers from affecting new tunnels
  const tunnelInstanceIdRef = useRef(0);

  /**
   * Clear all timers
   */
  const clearTimers = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }
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
        tunnelRef.current.close();
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
      clearTimers();

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
        // Start tunnel and fetch password in parallel
        const [tunnel, tunnelPassword] = await Promise.all([
          localtunnel({ port }),
          fetchTunnelPassword(),
        ]);

        // Check if this tunnel instance is still current
        if (!isMountedRef.current || currentInstanceId !== tunnelInstanceIdRef.current) {
          tunnel.close();
          return false;
        }

        tunnelRef.current = tunnel;
        setUrl(tunnel.url);
        setPassword(tunnelPassword);
        setIsConnecting(false);
        setIsReconnecting(false);
        setReconnectAttempts(0);

        // Track when the tunnel was established to detect rapid failures
        const connectionTime = Date.now();

        // Handle tunnel close event - only act if this is still the current tunnel
        tunnel.on("close", () => {
          if (isMountedRef.current && currentInstanceId === tunnelInstanceIdRef.current) {
            setUrl(null);
            setPassword(null);

            // Check if tunnel died too quickly (within cooldown period)
            const timeSinceConnection = Date.now() - connectionTime;
            if (timeSinceConnection < CONNECTION_COOLDOWN) {
              // Tunnel is unstable - don't retry, show error
              setError("Tunnel connection unstable - died immediately after connecting");
              setIsReconnecting(false);
              return;
            }

            // Tunnel lived long enough - try to reconnect
            scheduleReconnectRef.current?.();
          }
        });

        // Handle tunnel error event - only act if this is still the current tunnel
        tunnel.on("error", (_err: Error) => {
          if (isMountedRef.current && currentInstanceId === tunnelInstanceIdRef.current) {
            // Check if tunnel died too quickly (within cooldown period)
            const timeSinceConnection = Date.now() - connectionTime;
            if (timeSinceConnection < CONNECTION_COOLDOWN) {
              // Tunnel is unstable - don't retry, show error
              setUrl(null);
              setPassword(null);
              setError("Tunnel connection unstable - error immediately after connecting");
              setIsReconnecting(false);
              return;
            }

            // Tunnel lived long enough - try to reconnect
            scheduleReconnectRef.current?.();
          }
        });

        // Start health check interval
        healthCheckIntervalRef.current = setInterval(async () => {
          // Check both mounted state and instance ID
          if (
            !isMountedRef.current ||
            !tunnelRef.current ||
            currentInstanceId !== tunnelInstanceIdRef.current
          )
            return;

          const currentUrl = tunnelRef.current.url;
          const isHealthy = await checkTunnelHealth(currentUrl);

          if (
            !isHealthy &&
            isMountedRef.current &&
            currentInstanceId === tunnelInstanceIdRef.current
          ) {
            // Tunnel is dead, trigger reconnection
            scheduleReconnectRef.current?.();
          }
        }, HEALTH_CHECK_INTERVAL);

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
    [port, closeTunnel, clearTimers],
  );

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clear existing timers
    clearTimers();

    // Close the dead tunnel
    closeTunnel();

    setReconnectAttempts((prev) => {
      const attempts = prev + 1;

      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        // Give up after max attempts
        setError(`Tunnel connection lost after ${MAX_RECONNECT_ATTEMPTS} reconnection attempts`);
        setIsReconnecting(false);
        setUrl(null);
        setPassword(null);
        return prev;
      }

      // Calculate delay with exponential backoff: 2s, 4s, 8s, 16s, 32s
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
  }, [closeTunnel, clearTimers, startTunnel]);

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
      clearTimers();
      closeTunnel();
    };
  }, [enabled, startTunnel, clearTimers, closeTunnel]);

  return { url, isConnecting, error, password, isReconnecting, reconnectAttempts };
}
