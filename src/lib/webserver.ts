import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
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
}

let serverState: WebServerState = {
  session: null,
  currentIteration: 1,
  totalIterations: 5,
  status: "Starting...",
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
  </style>
  <script>
    // Auto-refresh every 2 seconds using fetch with bypass header
    async function refreshData() {
      try {
        const response = await fetch(window.location.href, {
          headers: {
            'bypass-tunnel-reminder': 'true'
          }
        });
        if (response.ok) {
          const html = await response.text();
          document.open();
          document.write(html);
          document.close();
        } else {
          // Fallback to regular reload if fetch fails
          window.location.reload();
        }
      } catch (err) {
        // Fallback to regular reload on error
        window.location.reload();
      }
    }
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

    <div class="footer">
      Auto-refreshing every 2 seconds
    </div>
  </div>
</body>
</html>`;
}

/**
 * Request handler for the web server
 */
function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS headers for API requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only handle GET requests
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
