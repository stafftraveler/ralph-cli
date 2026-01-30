import { type ChildProcess, spawn } from "node:child_process";

/**
 * Singleton caffeinate process manager
 *
 * Spawns macOS `caffeinate` to prevent system idle sleep while Ralph runs.
 * Uses -i flag to prevent idle sleep (most appropriate for long-running tasks).
 */

let caffeinateProcess: ChildProcess | null = null;

/**
 * Start caffeinate to prevent system sleep
 *
 * Only works on macOS. On other platforms, this is a no-op.
 *
 * @param debug - Whether to log debug info
 * @returns True if caffeinate was started (or already running)
 */
export function startCaffeinate(debug = false): boolean {
  // Only supported on macOS
  if (process.platform !== "darwin") {
    if (debug) {
      console.log("[DEBUG] caffeinate: skipped (not macOS)");
    }
    return false;
  }

  // Already running
  if (caffeinateProcess !== null) {
    if (debug) {
      console.log("[DEBUG] caffeinate: already running");
    }
    return true;
  }

  try {
    // -i prevents idle sleep (system stays awake while Ralph runs)
    // -w would wait for a specific PID, but we manage lifecycle manually
    caffeinateProcess = spawn("caffeinate", ["-i"], {
      stdio: "ignore",
      detached: false,
    });

    caffeinateProcess.on("error", (err) => {
      if (debug) {
        console.log(`[DEBUG] caffeinate error: ${err.message}`);
      }
      caffeinateProcess = null;
    });

    caffeinateProcess.on("exit", (code) => {
      if (debug) {
        console.log(`[DEBUG] caffeinate exited with code ${code}`);
      }
      caffeinateProcess = null;
    });

    if (debug) {
      console.log(`[DEBUG] caffeinate started (pid: ${caffeinateProcess.pid})`);
    }

    return true;
  } catch (error) {
    if (debug) {
      console.log(`[DEBUG] caffeinate failed to start: ${error}`);
    }
    return false;
  }
}

/**
 * Stop caffeinate and allow system to sleep again
 *
 * @param debug - Whether to log debug info
 */
export function stopCaffeinate(debug = false): void {
  if (caffeinateProcess === null) {
    if (debug) {
      console.log("[DEBUG] caffeinate: not running");
    }
    return;
  }

  try {
    const pid = caffeinateProcess.pid;
    caffeinateProcess.kill("SIGTERM");
    caffeinateProcess = null;

    if (debug) {
      console.log(`[DEBUG] caffeinate stopped (pid: ${pid})`);
    }
  } catch (error) {
    if (debug) {
      console.log(`[DEBUG] caffeinate stop failed: ${error}`);
    }
    caffeinateProcess = null;
  }
}
