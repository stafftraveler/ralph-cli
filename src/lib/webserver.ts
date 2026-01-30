import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { join } from "node:path";
import type { SessionState } from "../types.js";
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
  iterations: Array<{
    number: number;
    timestamp: string;
    cost: number;
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
}

let serverState: WebServerState = {
  session: null,
  currentIteration: 1,
  totalIterations: 5,
  status: "Starting...",
  ralphDir: "",
};

/**
 * Update the server state for the dashboard
 */
export function updateServerState(state: Partial<WebServerState>) {
  serverState = { ...serverState, ...state };
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
    iterations: (serverState.session?.iterations ?? []).map((iter, idx) => ({
      number: idx + 1,
      timestamp: iter.startedAt,
      cost: iter.usage?.totalCostUsd ?? 0,
    })),
  };
}

/**
 * HTML template for the dashboard
 */
function getDashboardHtml(data: DashboardData): string {
  const progressPercent = (data.currentIteration / data.totalIterations) * 100;
  const iterationsHtml = data.iterations
    .map(
      (iter) => `
      <div class="iteration-item">
        <span class="iteration-number">Iteration ${iter.number}</span>
        <span class="iteration-cost">$${iter.cost.toFixed(4)}</span>
      </div>
    `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ralph CLI Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #ffffff;
      min-height: 100vh;
      padding: 16px;
    }

    .container {
      max-width: 600px;
      width: 100%;
      margin: 0 auto;
      padding: 0;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .title {
      font-size: 24px;
      font-weight: 600;
      color: #000000;
      margin-bottom: 8px;
    }

    .session-id {
      font-size: 13px;
      color: #666666;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .progress-section {
      margin-bottom: 24px;
    }

    .progress-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
      color: #666666;
    }

    .progress-bar {
      height: 8px;
      background: #e5e5e5;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      background: #000000;
      transition: width 0.5s ease;
    }

    .status-section {
      margin-bottom: 24px;
      padding: 16px 0;
      border-bottom: 1px solid #e5e5e5;
    }

    .status-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #999999;
      margin-bottom: 8px;
      font-weight: 500;
    }

    .status-text {
      font-size: 14px;
      color: #000000;
      font-weight: 400;
    }

    .cost-section {
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #666666;
    }

    .cost-label {
      font-size: 13px;
      color: #666666;
      font-weight: 400;
    }

    .cost-value {
      font-size: 13px;
      color: #000000;
      font-weight: 500;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .iterations-section {
      margin-top: 24px;
    }

    .iterations-title {
      font-size: 13px;
      font-weight: 500;
      color: #000000;
      margin-bottom: 8px;
    }

    .iterations-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .iteration-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 13px;
    }

    .iteration-item:last-child {
      border-bottom: none;
    }

    .iteration-number {
      color: #666666;
    }

    .iteration-cost {
      color: #000000;
      font-weight: 500;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
      font-size: 11px;
      color: #999999;
    }

    .add-task-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
    }

    .add-task-title {
      font-size: 13px;
      font-weight: 500;
      color: #000000;
      margin-bottom: 8px;
    }

    .add-task-form {
      display: flex;
      gap: 8px;
    }

    .add-task-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .add-task-input:focus {
      outline: none;
      border-color: #000000;
    }

    .add-task-input::placeholder {
      color: #999999;
    }

    .add-task-button {
      padding: 8px 16px;
      background: #000000;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .add-task-button:hover {
      opacity: 0.8;
    }

    .add-task-button:active {
      opacity: 0.6;
    }

    .add-task-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .add-task-feedback {
      margin-top: 8px;
      font-size: 12px;
      min-height: 16px;
    }

    .add-task-feedback.success {
      color: #000000;
    }

    .add-task-feedback.error {
      color: #000000;
    }
  </style>
  <script>
    // Track if user is actively typing to avoid refresh interruption
    let isTyping = false;
    let typingTimeout = null;

    // Auto-refresh every 2 seconds
    async function refreshData() {
      // Skip refresh if user is typing
      if (isTyping) {
        setTimeout(refreshData, 2000);
        return;
      }

      try {
        const response = await fetch('/api/status');
        if (response.ok) {
          const data = await response.json();
          // Update only the dynamic parts instead of reloading entire page
          updateDashboard(data);
        }
      } catch (err) {
        // Silently fail on error
      }
      setTimeout(refreshData, 2000);
    }

    function updateDashboard(data) {
      // Update progress
      const progressPercent = (data.currentIteration / data.totalIterations) * 100;
      const progressFill = document.querySelector('.progress-fill');
      const progressLabel = document.querySelector('.progress-label span:last-child');
      if (progressFill) {
        progressFill.style.width = progressPercent + '%';
        progressFill.textContent = progressPercent.toFixed(0) + '%';
      }
      if (progressLabel) {
        progressLabel.textContent = 'Iteration ' + data.currentIteration + ' of ' + data.totalIterations;
      }

      // Update status
      const statusText = document.querySelector('.status-text');
      if (statusText) {
        statusText.textContent = data.status;
      }

      // Update cost
      const costValue = document.querySelector('.cost-value');
      if (costValue) {
        costValue.textContent = '$' + data.totalCost.toFixed(4);
      }
    }

    // Add task form handling
    async function addTask(event) {
      event.preventDefault();
      const input = document.getElementById('task-input');
      const button = document.getElementById('task-button');
      const feedback = document.getElementById('task-feedback');
      const task = input.value.trim();

      if (!task) {
        feedback.textContent = 'Please enter a task';
        feedback.className = 'add-task-feedback error';
        return;
      }

      // Disable form while submitting
      input.disabled = true;
      button.disabled = true;
      feedback.textContent = 'Adding task...';
      feedback.className = 'add-task-feedback';

      try {
        const response = await fetch('/api/task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ task })
        });

        const result = await response.json();

        if (response.ok) {
          input.value = '';
          feedback.textContent = 'Task added successfully!';
          feedback.className = 'add-task-feedback success';
          // Clear success message after 3 seconds
          setTimeout(() => {
            feedback.textContent = '';
          }, 3000);
        } else {
          feedback.textContent = result.error || 'Failed to add task';
          feedback.className = 'add-task-feedback error';
        }
      } catch (err) {
        feedback.textContent = 'Network error - please try again';
        feedback.className = 'add-task-feedback error';
      } finally {
        input.disabled = false;
        button.disabled = false;
        input.focus();
      }
    }

    // Track typing state
    function handleInput() {
      isTyping = true;
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
      }, 1000);
    }

    // Start auto-refresh
    setTimeout(refreshData, 2000);
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">Ralph CLI Dashboard</div>
      <div class="session-id">${data.sessionId}</div>
    </div>

    <div class="progress-section">
      <div class="progress-label">
        <span>Progress</span>
        <span>Iteration ${data.currentIteration} of ${data.totalIterations}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%">
          ${progressPercent.toFixed(0)}%
        </div>
      </div>
    </div>

    <div class="status-section">
      <div class="status-label">Current Status</div>
      <div class="status-text">${data.status}</div>
    </div>

    <div class="cost-section">
      <span class="cost-label">Total Cost</span>
      <span class="cost-value">$${data.totalCost.toFixed(4)}</span>
    </div>

    ${
      data.iterations.length > 0
        ? `
    <div class="iterations-section">
      <div class="iterations-title">Iteration History</div>
      <div class="iterations-list">
        ${iterationsHtml}
      </div>
    </div>
    `
        : ""
    }

    <div class="add-task-section">
      <div class="add-task-title">Add Task to PRD</div>
      <form class="add-task-form" onsubmit="addTask(event)">
        <input
          type="text"
          id="task-input"
          class="add-task-input"
          placeholder="Enter a new task..."
          oninput="handleInput()"
          autocomplete="off"
        />
        <button type="submit" id="task-button" class="add-task-button">Add</button>
      </form>
      <div id="task-feedback" class="add-task-feedback"></div>
    </div>

    <div class="footer">
      Auto-refreshing every 2 seconds
    </div>
  </div>
</body>
</html>`;
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

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, task }));
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
