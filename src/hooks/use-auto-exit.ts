import { useEffect } from "react";

/**
 * Hook to automatically exit after a delay when data is loaded
 *
 * @param isDataLoaded - Whether the data has finished loading
 * @param isInterrupted - Whether the session was interrupted (uses shorter delay)
 * @param onExit - Callback to execute when timer completes
 */
export function useAutoExit(isDataLoaded: boolean, isInterrupted: boolean, onExit: () => void) {
  useEffect(() => {
    if (!isDataLoaded) return;

    // Give user time to see the summary before exiting
    // Shorter delay when interrupted (1s), longer for normal completion (3s)
    const delay = isInterrupted ? 1000 : 3000;
    const timer = setTimeout(() => {
      onExit();
    }, delay);
    return () => clearTimeout(timer);
  }, [isDataLoaded, isInterrupted, onExit]);
}
