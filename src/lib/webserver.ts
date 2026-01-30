import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { join } from "node:path";
import type { SessionState } from "../types.js";

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
      box-box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      padding: 32px;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .title {
      font-size: 28px;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 8px;
    }

    .session-id {
      font-size: 14px;
      color: #718096;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .progress-section {
      margin-bottom: 32px;
    }

    .progress-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
      color: #4a5568;
    }

    .progress-bar {
      height: 24px;
      background: #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.5s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: 600;
    }

    .status-section {
      background: #f7fafc;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
    }

    .status-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #718096;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .status-text {
      font-size: 16px;
      color: #2d3748;
      font-weight: 500;
    }

    .cost-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #edf2f7;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
    }

    .cost-label {
      font-size: 14px;
      color: #4a5568;
      font-weight: 500;
    }

    .cost-value {
      font-size: 24px;
      color: #2d3748;
      font-weight: 700;
    }

    .iterations-section {
      margin-top: 24px;
    }

    .iterations-title {
      font-size: 16px;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 12px;
    }

    .iterations-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .iteration-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: #f7fafc;
      margin-bottom: 4px;
      border-radius: 6px;
      font-size: 14px;
    }

    .iteration-number {
      color: #4a5568;
    }

    .iteration-cost {
      color: #2d3748;
      font-weight: 600;
    }

    .footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #a0aec0;
    }

    .add-task-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
    }

    .add-task-title {
      font-size: 16px;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 12px;
    }

    .add-task-form {
      display: flex;
      gap: 8px;
    }

    .add-task-input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .add-task-input:focus {
      outline: none;
      border-color: #667eea;
    }

    .add-task-input::placeholder {
      color: #a0aec0;
    }

    .add-task-button {
      padding: 12px 20px;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }

    .add-task-button:hover {
      opacity: 0.9;
    }

    .add-task-button:active {
      transform: scale(0.98);
    }

    .add-task-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .add-task-feedback {
      margin-top: 8px;
      font-size: 13px;
      min-height: 20px;
    }

    .add-task-feedback.success {
      color: #38a169;
    }

    .add-task-feedback.error {
      color: #e53e3e;
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
function handleRequest(req: IncomingMessage, res: ServerResponse) {
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
