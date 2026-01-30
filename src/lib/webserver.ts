import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { SessionState } from "../types.js";
import { getDashboardHtml } from "../dashboard/template.js";
import { parsePrdTasks } from "./prd.js";

/**
 * Dashboard data that gets sent to the web UI
 */
export interface DashboardData {
  sessionId: string;
  currentIteration: number;
  totalIterations: number;
  status: string;
  totalCost: number;
  currentIterationStartedAt: string | null;
  isPausedAfterIteration: boolean;
  iterations: Array<{
    number: number;
    timestamp: string;
    cost: number;
    durationSeconds: number;
    success: boolean;
    inputTokens?: number;
    outputTokens?: number;
    status?: string;
  }>;
}

/**
 * Web server state
 */
interface WebServerState {
  session: SessionState | null;
  currentIteration: number;
  totalIterations: number;
  status: string;
  ralphDir: string;
  outputBuffer: string;
  currentIterationStartedAt: string | null;
  onIterationsChange?: (newTotal: number) => void;
  onPauseAfterIteration?: (pause: boolean) => void;
  onStopSession?: () => void;
  isPausedAfterIteration?: boolean;
}

let serverState: WebServerState = {
  session: null,
  currentIteration: 1,
  totalIterations: 5,
  status: "Starting...",
  ralphDir: "",
  outputBuffer: "",
  currentIterationStartedAt: null,
  isPausedAfterIteration: false,
};

/**
 * WebSocket server instance
 */
let wss: WebSocketServer | null = null;

/**
 * Set of connected WebSocket clients
 */
const wsClients = new Set<WebSocket>();

/**
 * Maximum size of output buffer in characters (100KB)
 */
const MAX_OUTPUT_BUFFER_SIZE = 100000;

/**
 * Update the server state for the dashboard
 */
export function updateServerState(state: Partial<WebServerState>) {
  serverState = { ...serverState, ...state };
  // Broadcast update to all connected WebSocket clients
  broadcastUpdate();
}

/**
 * Set the callback for when iterations are adjusted from the dashboard
 */
export function setIterationsChangeHandler(handler: (newTotal: number) => void) {
  serverState.onIterationsChange = handler;
}

/**
 * Set the callback for when pause after iteration is toggled from the dashboard
 */
export function setPauseAfterIterationHandler(handler: (pause: boolean) => void) {
  serverState.onPauseAfterIteration = handler;
}

/**
 * Set the callback for when stop is triggered from the dashboard
 */
export function setStopSessionHandler(handler: () => void) {
  serverState.onStopSession = handler;
}

/**
 * Get the current pause state
 */
export function getPauseAfterIterationState(): boolean {
  return serverState.isPausedAfterIteration ?? false;
}

/**
 * Append output to the buffer, keeping only the most recent data
 */
export function appendOutput(chunk: string) {
  serverState.outputBuffer += chunk;

  // Trim buffer if it exceeds max size (keep last N characters)
  if (serverState.outputBuffer.length > MAX_OUTPUT_BUFFER_SIZE) {
    serverState.outputBuffer = serverState.outputBuffer.slice(-MAX_OUTPUT_BUFFER_SIZE);
  }

  // Broadcast output update to WebSocket clients
  broadcastOutputUpdate(chunk);
}

/**
 * Clear the output buffer (useful at start of new iteration)
 */
export function clearOutput() {
  serverState.outputBuffer = "";
  broadcastOutputUpdate("");
}

/**
 * Broadcast status update to all connected WebSocket clients
 */
function broadcastUpdate() {
  if (wsClients.size === 0) return;

  const data = getDashboardData();
  const message = JSON.stringify({
    type: "status",
    data,
  });

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Broadcast output chunk to all connected WebSocket clients
 */
function broadcastOutputUpdate(chunk: string) {
  if (wsClients.size === 0) return;

  const message = JSON.stringify({
    type: "output",
    data: chunk,
  });

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Broadcast completed message to all connected WebSocket clients
 */
function broadcastCompleted() {
  if (wsClients.size === 0) return;

  const message = JSON.stringify({
    type: "completed",
  });

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Broadcast task update to all connected WebSocket clients
 */
async function broadcastTaskUpdate() {
  if (wsClients.size === 0) return;

  try {
    if (!serverState.ralphDir) return;

    const prdPath = join(serverState.ralphDir, "PRD.md");
    const tasks = await parsePrdTasks(prdPath);

    const completedCount = tasks.filter((t) => t.completed).length;
    const totalCount = tasks.length;

    const message = JSON.stringify({
      type: "tasks",
      data: {
        tasks,
        completedCount,
        totalCount,
      },
    });

    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  } catch (_err) {
    // Silently fail - non-critical broadcast failure
  }
}

/**
 * Get current dashboard data
 */
function getDashboardData(): DashboardData {
  return {
    sessionId: serverState.session?.id ?? "N/A",
    currentIteration: serverState.currentIteration,
    totalIterations: serverState.totalIterations,
    status: serverState.status,
    totalCost: serverState.session?.totalCostUsd ?? 0,
    currentIterationStartedAt: serverState.currentIterationStartedAt,
    isPausedAfterIteration: serverState.isPausedAfterIteration ?? false,
    iterations: (serverState.session?.iterations ?? []).map((iter, idx) => ({
      number: idx + 1,
      timestamp: iter.startedAt,
      cost: iter.usage?.totalCostUsd ?? 0,
      durationSeconds: iter.durationSeconds,
      success: iter.success,
      inputTokens: iter.usage?.inputTokens,
      outputTokens: iter.usage?.outputTokens,
      status: iter.status,
    })),
  };
}

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Add a task to the PRD.md file
 */
async function addTaskToPrd(task: string): Promise<void> {
  if (!serverState.ralphDir) {
    throw new Error("Ralph directory not configured");
  }

  const prdPath = join(serverState.ralphDir, "PRD.md");
  const content = await readFile(prdPath, "utf-8");

  // Format the new task
  const newTask = `[ ] ${task}`;

  // Append the task to the end of the file
  // If the file ends with just "[ ]" (empty task), replace it
  // Otherwise, append on a new line
  let updatedContent: string;

  if (content.trimEnd().endsWith("[ ]")) {
    // Replace the empty task placeholder with the new task
    updatedContent = `${content.trimEnd().slice(0, -3) + newTask}\n`;
  } else {
    // Append to the end
    updatedContent = `${content.trimEnd()}\n${newTask}\n`;
  }

  await writeFile(prdPath, updatedContent, "utf-8");
}

/**
 * Request handler for the web server
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS headers for API requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle POST requests
  if (req.method === "POST") {
    if (req.url === "/api/task") {
      handleAddTask(req, res);
      return;
    }
    if (req.url === "/api/iterations") {
      handleAdjustIterations(req, res);
      return;
    }
    if (req.url === "/api/pause") {
      handlePauseToggle(req, res);
      return;
    }
    if (req.url === "/api/stop") {
      handleStopSession(req, res);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  // Only handle GET requests for other routes
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  // API endpoint for JSON data
  if (req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getDashboardData()));
    return;
  }

  // API endpoint for PRD tasks
  if (req.url === "/api/tasks") {
    await handleGetTasks(req, res);
    return;
  }

  // API endpoint for Claude output
  if (req.url === "/api/output") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: serverState.outputBuffer }));
    return;
  }

  // HTML dashboard (default route)
  if (req.url === "/" || req.url === "/index.html") {
    const data = getDashboardData();
    const html = getDashboardHtml(data);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  // 404 for other routes
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

/**
 * Handle GET /api/tasks - Get all tasks from PRD
 */
async function handleGetTasks(_req: IncomingMessage, res: ServerResponse) {
  try {
    if (!serverState.ralphDir) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Ralph directory not configured" }));
      return;
    }

    const prdPath = join(serverState.ralphDir, "PRD.md");
    const tasks = await parsePrdTasks(prdPath);

    const completedCount = tasks.filter((t) => t.completed).length;
    const totalCount = tasks.length;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        tasks,
        completedCount,
        totalCount,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * Handle POST /api/task - Add a new task to PRD
 */
async function handleAddTask(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = (await parseJsonBody(req)) as { task?: string };

    if (!body.task || typeof body.task !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task is required" }));
      return;
    }

    const task = body.task.trim();
    if (!task) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task cannot be empty" }));
      return;
    }

    await addTaskToPrd(task);

    // Broadcast task update to WebSocket clients
    await broadcastTaskUpdate();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, task }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * Handle POST /api/iterations - Adjust total iterations
 */
async function handleAdjustIterations(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = (await parseJsonBody(req)) as { action?: string };

    if (!body.action || typeof body.action !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Action is required (increment or decrement)" }));
      return;
    }

    const action = body.action.toLowerCase();
    if (action !== "increment" && action !== "decrement") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Action must be increment or decrement" }));
      return;
    }

    let newTotal = serverState.totalIterations;
    if (action === "increment") {
      newTotal += 1;
    } else if (action === "decrement") {
      // Don't allow going below current iteration
      newTotal = Math.max(serverState.totalIterations - 1, serverState.currentIteration);
    }

    // Update server state
    serverState.totalIterations = newTotal;

    // Call the handler if set (to update App.tsx state)
    serverState.onIterationsChange?.(newTotal);

    // Broadcast update to all clients
    broadcastUpdate();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, totalIterations: newTotal }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * Handle POST /api/pause - Toggle pause after current iteration
 */
async function handlePauseToggle(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = (await parseJsonBody(req)) as { pause?: boolean };

    const shouldPause = body.pause ?? !serverState.isPausedAfterIteration;

    // Update server state
    serverState.isPausedAfterIteration = shouldPause;

    // Call the handler if set (to update App.tsx state)
    serverState.onPauseAfterIteration?.(shouldPause);

    // Broadcast update to all clients
    broadcastUpdate();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, isPaused: shouldPause }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * Handle POST /api/stop - Stop the session immediately
 */
async function handleStopSession(_req: IncomingMessage, res: ServerResponse) {
  try {
    // Call the handler if set (to trigger quit in App.tsx)
    serverState.onStopSession?.();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * Start the web server on the given port
 *
 * @param port - Port to listen on
 * @returns Promise that resolves to the server instance
 */
export async function startWebServer(port: number) {
  const server = createServer(handleRequest);

  // Create WebSocket server attached to HTTP server
  wss = new WebSocketServer({ server });

  // Handle WebSocket server errors (e.g., when HTTP server fails to bind)
  wss.on("error", (err) => {
    // Error is handled by the HTTP server's error handler, just prevent unhandled event
    console.error("WebSocket server error:", err.message);
  });

  // Handle WebSocket connections
  wss.on("connection", async (ws: WebSocket) => {
    // Add client to set
    wsClients.add(ws);

    // Send initial state to newly connected client
    const data = getDashboardData();
    ws.send(
      JSON.stringify({
        type: "status",
        data,
      }),
    );

    // Send initial tasks data
    try {
      if (serverState.ralphDir) {
        const prdPath = join(serverState.ralphDir, "PRD.md");
        const tasks = await parsePrdTasks(prdPath);
        const completedCount = tasks.filter((t) => t.completed).length;
        const totalCount = tasks.length;

        ws.send(
          JSON.stringify({
            type: "tasks",
            data: {
              tasks,
              completedCount,
              totalCount,
            },
          }),
        );
      }
    } catch (_err) {
      // Silently fail - client may have disconnected
    }

    // Handle client disconnect
    ws.on("close", () => {
      wsClients.delete(ws);
    });

    // Handle errors
    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      wsClients.delete(ws);
    });
  });

  return new Promise<typeof server>((resolve, reject) => {
    server.listen(port, () => {
      resolve(server);
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Stop the web server
 */
export async function stopWebServer(server: ReturnType<typeof createServer>) {
  // Broadcast completed message before closing connections
  broadcastCompleted();

  // Give clients time to receive the completed message before closing
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Close all WebSocket connections
  for (const client of wsClients) {
    client.close();
  }
  wsClients.clear();

  // Close WebSocket server
  if (wss) {
    wss.close();
    wss = null;
  }

  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
