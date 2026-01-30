import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { SessionState } from "../types.js";
import { parsePrdTasks } from "./prd.js";
import { formatDuration } from "./utils.js";

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
    if (client.readyState === 1) {
      // WebSocket.OPEN
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
    if (client.readyState === 1) {
      // WebSocket.OPEN
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
    if (client.readyState === 1) {
      // WebSocket.OPEN
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
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(message);
      }
    }
  } catch (_err) {
    // Silently fail
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
 * HTML template for the dashboard
 */
function getDashboardHtml(data: DashboardData): string {
  const progressPercent = (data.currentIteration / data.totalIterations) * 100;
  const iterationsHtml = data.iterations
    .map(
      (iter) => `
      <div class="iteration-item" onclick="toggleIterationDetails(${iter.number})">
        <div class="iteration-summary">
          <span class="iteration-status ${iter.success ? "success" : "failure"}">${iter.success ? "✓" : "✗"}</span>
          <div class="iteration-info">
            <span class="iteration-number">Iteration ${iter.number}</span>
            <span class="iteration-timestamp" data-timestamp="${iter.timestamp}"></span>
          </div>
          <span class="iteration-duration">${formatDuration(iter.durationSeconds)}</span>
          <span class="iteration-cost">$${iter.cost.toFixed(4)}</span>
        </div>
        <div class="iteration-details" id="iteration-details-${iter.number}">
          ${
            iter.inputTokens || iter.outputTokens
              ? `
          <div class="iteration-details-row">
            <span class="iteration-details-label">Input Tokens:</span>
            <span class="iteration-details-value">${iter.inputTokens?.toLocaleString() || "N/A"}</span>
          </div>
          <div class="iteration-details-row">
            <span class="iteration-details-label">Output Tokens:</span>
            <span class="iteration-details-value">${iter.outputTokens?.toLocaleString() || "N/A"}</span>
          </div>
          `
              : ""
          }
          ${
            iter.status
              ? `
          <div class="iteration-details-row">
            <span class="iteration-details-label">Status:</span>
            <span class="iteration-details-value">${iter.status}</span>
          </div>
          `
              : ""
          }
        </div>
      </div>
    `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Ralph Dashboard">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
  <meta name="description" content="Ralph CLI Dashboard - Monitor Claude Code iterations remotely">
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
      padding: 16px; /* 2 × 8px grid */
    }

    .container {
      max-width: 600px;
      width: 100%;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      margin-bottom: 32px; /* 4 × 8px grid */
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

    .connection-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 8px;
      font-size: 11px;
      color: #999999;
    }

    .connection-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #999999;
      transition: background 0.3s ease;
    }

    .connection-dot.connected {
      background: #4caf50;
    }

    .connection-dot.disconnected {
      background: #f44336;
    }

    .connection-dot.reconnecting {
      background: #ff9800;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .connection-dot.polling {
      background: #2196f3;
    }

    .connection-dot.completed {
      background: #4caf50;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
    }

    .progress-section {
      margin-bottom: 24px;
    }

    .progress-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 13px;
      color: #666666;
    }

    .iterations-control {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .iterations-value {
      font-family: 'Monaco', 'Courier New', monospace;
      font-weight: 500;
      color: #000000;
      min-width: 24px;
      text-align: center;
    }

    .iteration-adjust-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      background: #000000;
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .iteration-adjust-btn:hover {
      opacity: 0.8;
    }

    .iteration-adjust-btn:active {
      opacity: 0.6;
      transform: scale(0.95);
    }

    .iteration-adjust-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
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

    .progress-fill.active {
      animation: progress-pulse 2s ease-in-out infinite;
    }

    @keyframes progress-pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
    }

    .status-section {
      margin-bottom: 24px; /* 3 × 8px grid */
      padding: 16px 0; /* 2 × 8px grid */
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .elapsed-time {
      font-size: 12px;
      color: #666666;
      margin-top: 8px;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .eta-time {
      font-size: 12px;
      color: #999999;
      margin-top: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
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
      flex-direction: column;
      gap: 0;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .iteration-item:hover {
      background: #fafafa;
    }

    .iteration-item:active {
      background: #f5f5f5;
    }

    .iteration-summary {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .iteration-item:last-child {
      border-bottom: none;
    }

    .iteration-status {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .iteration-status.success {
      color: #000000;
      background: #e8f5e9;
    }

    .iteration-status.failure {
      color: #000000;
      background: #ffebee;
    }

    .iteration-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .iteration-number {
      color: #666666;
      font-size: 13px;
    }

    .iteration-timestamp {
      color: #999999;
      font-size: 11px;
    }

    .iteration-duration {
      color: #999999;
      font-size: 12px;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .iteration-cost {
      color: #000000;
      font-weight: 500;
      font-family: 'Monaco', 'Courier New', monospace;
      text-align: right;
    }

    .iteration-details {
      display: none;
      margin-top: 8px;
      padding: 8px 12px;
      background: #f8f8f8;
      border-radius: 4px;
      font-size: 12px;
    }

    .iteration-details.expanded {
      display: block;
    }

    .iteration-details-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      color: #666666;
    }

    .iteration-details-label {
      font-weight: 500;
    }

    .iteration-details-value {
      font-family: 'Monaco', 'Courier New', monospace;
      color: #000000;
    }

    .no-iterations {
      text-align: center;
      color: #999999;
      padding: 16px;
      font-size: 13px;
    }

    .footer {
      text-align: center;
      margin-top: 32px; /* 4 × 8px grid */
      padding-top: 24px; /* 3 × 8px grid */
      border-top: 1px solid #e5e5e5;
      font-size: 11px;
      color: #999999;
    }

    .add-task-section {
      margin-top: 32px; /* 4 × 8px grid */
      padding-top: 24px; /* 3 × 8px grid */
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
      padding: 12px;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
      font-size: 16px; /* 16px prevents iOS auto-zoom on focus */
      font-family: inherit;
      transition: border-color 0.2s;
      min-height: 44px;
    }

    .add-task-input:focus {
      outline: none;
      border-color: #000000;
      background: #fafafa;
    }

    .add-task-input:active {
      background: #f5f5f5;
    }

    .add-task-input::placeholder {
      color: #999999;
    }

    .add-task-button {
      padding: 12px 16px;
      background: #000000;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px; /* Match input font size */
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
      min-height: 44px;
    }

    .add-task-button:hover {
      opacity: 0.8;
    }

    .add-task-button:active {
      opacity: 0.6;
      transform: scale(0.98);
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

    .tasks-section {
      margin-top: 32px; /* 4 × 8px grid */
      padding-top: 24px; /* 3 × 8px grid */
      border-top: 1px solid #e5e5e5;
    }

    .tasks-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 16px; /* 2 × 8px grid */
    }

    .tasks-title {
      font-size: 13px;
      font-weight: 500;
      color: #000000;
    }

    .tasks-count {
      font-size: 12px;
      color: #666666;
    }

    .tasks-progress-bar {
      height: 4px;
      background: #e5e5e5;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .tasks-progress-fill {
      height: 100%;
      background: #000000;
      transition: width 0.3s ease;
      width: 0%;
    }

    .tasks-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .phase-header {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #999999;
      margin-top: 16px;
      margin-bottom: 8px;
      font-weight: 500;
    }

    .phase-header:first-child {
      margin-top: 0;
    }

    .task-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid #f5f5f5;
      font-size: 13px;
      line-height: 1.5;
    }

    .task-item:last-child {
      border-bottom: none;
    }

    .task-checkbox {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      border: 1px solid #d0d0d0;
      border-radius: 3px;
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .task-checkbox.completed {
      background: #000000;
      border-color: #000000;
    }

    .task-checkbox.completed::after {
      content: '✓';
      color: white;
      font-size: 11px;
      font-weight: 600;
    }

    .task-text {
      flex: 1;
      color: #333333;
    }

    .task-text.completed {
      color: #999999;
      text-decoration: line-through;
    }

    .verbose-section {
      margin-top: 32px; /* 4 × 8px grid */
      padding-top: 24px; /* 3 × 8px grid */
      border-top: 1px solid #e5e5e5;
    }

    .verbose-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px; /* 2 × 8px grid */
    }

    .verbose-title {
      font-size: 13px;
      font-weight: 500;
      color: #000000;
    }

    .verbose-toggle {
      padding: 12px 16px;
      background: #000000;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
      min-height: 44px;
    }

    .verbose-toggle:hover {
      opacity: 0.8;
    }

    .verbose-toggle:active {
      opacity: 0.6;
      transform: scale(0.98);
    }

    .verbose-output {
      background: #f8f8f8;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
      padding: 12px;
      max-height: 400px;
      overflow-y: auto;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #333333;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .verbose-output.hidden {
      display: none;
    }

    .verbose-output:empty::before {
      content: 'No output yet...';
      color: #999999;
      font-style: italic;
    }

    .session-controls-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
    }

    .session-controls-title {
      font-size: 13px;
      font-weight: 500;
      color: #000000;
      margin-bottom: 16px;
    }

    .iterations-adjust-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .iterations-adjust-label {
      font-size: 14px;
      color: #333333;
    }

    .iterations-adjust-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .iterations-value-inline {
      font-family: 'Monaco', 'Courier New', monospace;
      font-weight: 500;
      color: #000000;
      min-width: 24px;
      text-align: center;
    }

    .session-control-row {
      margin-top: 12px;
    }

    .session-control-btn {
      width: 100%;
      padding: 14px 16px;
      background: #f5f5f5;
      color: #333333;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 48px;
    }

    .session-control-btn:hover {
      background: #eeeeee;
    }

    .session-control-btn:active {
      background: #e0e0e0;
      transform: scale(0.99);
    }

    .session-control-btn .btn-icon {
      font-size: 16px;
    }

    .pause-btn.active {
      background: #fff3e0;
      border-color: #ffb74d;
      color: #e65100;
    }

    .pause-btn.active:hover {
      background: #ffe0b2;
    }

    .stop-btn {
      background: #fff5f5;
      border-color: #ffcdd2;
      color: #c62828;
    }

    .stop-btn:hover {
      background: #ffebee;
    }

    .stop-btn:active {
      background: #ffcdd2;
    }

    /* Modal styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }

    .modal-overlay.hidden {
      display: none;
    }

    .modal-content {
      background: #ffffff;
      border-radius: 12px;
      padding: 24px;
      max-width: 320px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    }

    .modal-title {
      font-size: 18px;
      font-weight: 600;
      color: #000000;
      margin-bottom: 12px;
    }

    .modal-message {
      font-size: 14px;
      color: #666666;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .modal-buttons {
      display: flex;
      gap: 12px;
    }

    .modal-btn {
      flex: 1;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      min-height: 44px;
    }

    .modal-btn-cancel {
      background: #f5f5f5;
      color: #333333;
      border: 1px solid #e0e0e0;
    }

    .modal-btn-cancel:hover {
      background: #eeeeee;
    }

    .modal-btn-confirm {
      background: #d32f2f;
      color: #ffffff;
      border: none;
    }

    .modal-btn-confirm:hover {
      background: #c62828;
    }

    .modal-btn-confirm:active {
      background: #b71c1c;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body {
        background: #000000;
        color: #ffffff;
      }

      .title {
        color: #ffffff;
      }

      .session-id {
        color: #999999;
      }

      .connection-status {
        color: #666666;
      }

      .progress-label {
        color: #999999;
      }

      .iterations-value {
        color: #ffffff;
      }

      .iteration-adjust-btn {
        background: #ffffff;
        color: #000000;
      }

      .progress-bar {
        background: #333333;
      }

      .progress-fill {
        background: #ffffff;
      }

      .status-section {
        border-bottom: 1px solid #333333;
      }

      .status-label {
        color: #666666;
      }

      .status-text {
        color: #ffffff;
      }

      .elapsed-time {
        color: #999999;
      }

      .eta-time {
        color: #666666;
      }

      .cost-section {
        color: #999999;
      }

      .cost-label {
        color: #999999;
      }

      .cost-value {
        color: #ffffff;
      }

      .iterations-title {
        color: #ffffff;
      }

      .iteration-item {
        border-bottom: 1px solid #1a1a1a;
      }

      .iteration-item:hover {
        background: #1a1a1a;
      }

      .iteration-item:active {
        background: #262626;
      }

      .iteration-details {
        background: #1a1a1a;
      }

      .iteration-details-row {
        color: #999999;
      }

      .iteration-details-value {
        color: #ffffff;
      }

      .no-iterations {
        color: #666666;
      }

      .iteration-status.success {
        color: #ffffff;
        background: #1b5e20;
      }

      .iteration-status.failure {
        color: #ffffff;
        background: #b71c1c;
      }

      .iteration-number {
        color: #999999;
      }

      .iteration-timestamp {
        color: #666666;
      }

      .iteration-duration {
        color: #666666;
      }

      .iteration-cost {
        color: #ffffff;
      }

      .footer {
        border-top: 1px solid #333333;
        color: #666666;
      }

      .add-task-section {
        border-top: 1px solid #333333;
      }

      .add-task-title {
        color: #ffffff;
      }

      .add-task-input {
        background: #1a1a1a;
        border: 1px solid #333333;
        color: #ffffff;
      }

      .add-task-input:focus {
        border-color: #ffffff;
        background: #262626;
      }

      .add-task-input:active {
        background: #333333;
      }

      .add-task-input::placeholder {
        color: #666666;
      }

      .add-task-button {
        background: #ffffff;
        color: #000000;
      }

      .add-task-feedback.success,
      .add-task-feedback.error {
        color: #ffffff;
      }

      .tasks-section {
        border-top: 1px solid #333333;
      }

      .tasks-title {
        color: #ffffff;
      }

      .tasks-count {
        color: #999999;
      }

      .tasks-progress-bar {
        background: #333333;
      }

      .tasks-progress-fill {
        background: #ffffff;
      }

      .phase-header {
        color: #666666;
      }

      .task-item {
        border-bottom: 1px solid #1a1a1a;
      }

      .task-checkbox {
        border: 1px solid #666666;
      }

      .task-checkbox.completed {
        background: #ffffff;
        border-color: #ffffff;
      }

      .task-checkbox.completed::after {
        color: #000000;
      }

      .task-text {
        color: #cccccc;
      }

      .task-text.completed {
        color: #666666;
      }

      .verbose-section {
        border-top: 1px solid #333333;
      }

      .verbose-title {
        color: #ffffff;
      }

      .verbose-toggle {
        background: #ffffff;
        color: #000000;
      }

      .verbose-output {
        background: #1a1a1a;
        border: 1px solid #333333;
        color: #cccccc;
      }

      .verbose-output:empty::before {
        color: #666666;
      }

      .session-controls-section {
        border-top: 1px solid #333333;
      }

      .session-controls-title {
        color: #ffffff;
      }

      .iterations-adjust-row {
        border-bottom: 1px solid #333333;
      }

      .iterations-adjust-label {
        color: #cccccc;
      }

      .iterations-value-inline {
        color: #ffffff;
      }

      .session-control-btn {
        background: #1a1a1a;
        color: #cccccc;
        border: 1px solid #333333;
      }

      .session-control-btn:hover {
        background: #262626;
      }

      .session-control-btn:active {
        background: #333333;
      }

      .pause-btn.active {
        background: #3d2800;
        border-color: #ff9800;
        color: #ffb74d;
      }

      .pause-btn.active:hover {
        background: #4d3300;
      }

      .stop-btn {
        background: #2d1515;
        border-color: #b71c1c;
        color: #ef5350;
      }

      .stop-btn:hover {
        background: #3d1f1f;
      }

      .stop-btn:active {
        background: #4d2929;
      }

      .modal-content {
        background: #1a1a1a;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
      }

      .modal-title {
        color: #ffffff;
      }

      .modal-message {
        color: #999999;
      }

      .modal-btn-cancel {
        background: #262626;
        color: #cccccc;
        border: 1px solid #333333;
      }

      .modal-btn-cancel:hover {
        background: #333333;
      }
    }
  </style>
  <script>
    // Track if user is actively typing to avoid refresh interruption
    let isTyping = false;
    let typingTimeout = null;

    // Track verbose mode state
    let verboseMode = false;

    // Current iteration start time
    let currentIterationStartTime = null;

    // WebSocket connection state
    let ws = null;
    let wsConnected = false;
    let reconnectAttempt = 0;
    let reconnectTimeout = null;
    const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
    const BASE_RECONNECT_DELAY = 1000; // 1 second base
    let useFallbackPolling = false;
    let sessionCompleted = false;

    // Load verbose mode preference from localStorage
    function loadVerbosePreference() {
      try {
        const saved = localStorage.getItem('ralph-verbose-mode');
        if (saved !== null) {
          verboseMode = saved === 'true';
          if (verboseMode) {
            const output = document.getElementById('verbose-output');
            const toggle = document.getElementById('verbose-toggle');
            if (output) output.classList.remove('hidden');
            if (toggle) toggle.textContent = 'Hide';
          }
        }
      } catch (err) {
        // localStorage not available, ignore
      }
    }

    // Save verbose mode preference to localStorage
    function saveVerbosePreference() {
      try {
        localStorage.setItem('ralph-verbose-mode', verboseMode.toString());
      } catch (err) {
        // localStorage not available, ignore
      }
    }

    // Toggle verbose output visibility
    function toggleVerbose() {
      verboseMode = !verboseMode;
      const output = document.getElementById('verbose-output');
      const toggle = document.getElementById('verbose-toggle');

      if (verboseMode) {
        if (output) output.classList.remove('hidden');
        if (toggle) toggle.textContent = 'Hide';
        // Immediately fetch output when showing
        fetchVerboseOutput();
      } else {
        if (output) output.classList.add('hidden');
        if (toggle) toggle.textContent = 'Show';
      }

      saveVerbosePreference();
    }

    // Format timestamp as relative time (e.g., "2m ago", "5h ago")
    function formatRelativeTime(timestamp) {
      const now = new Date();
      const then = new Date(timestamp);
      const diffMs = now - then;
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSeconds < 60) {
        return diffSeconds === 1 ? '1s ago' : diffSeconds + 's ago';
      } else if (diffMinutes < 60) {
        return diffMinutes === 1 ? '1m ago' : diffMinutes + 'm ago';
      } else if (diffHours < 24) {
        return diffHours === 1 ? '1h ago' : diffHours + 'h ago';
      } else {
        return diffDays === 1 ? '1d ago' : diffDays + 'd ago';
      }
    }

    // Update all relative timestamps on the page
    function updateRelativeTimestamps() {
      const timestampElements = document.querySelectorAll('.iteration-timestamp');
      for (const element of timestampElements) {
        const timestamp = element.getAttribute('data-timestamp');
        if (timestamp) {
          element.textContent = formatRelativeTime(timestamp);
        }
      }
    }

    // Fetch and update verbose output
    async function fetchVerboseOutput() {
      if (!verboseMode) return;

      try {
        const response = await fetch('/api/output');
        if (response.ok) {
          const data = await response.json();
          const output = document.getElementById('verbose-output');
          if (output) {
            output.textContent = data.output ?? '';
            // Auto-scroll to bottom
            output.scrollTop = output.scrollHeight;
          }
        }
      } catch (err) {
        // Silently fail on error
      }
    }

    // Initialize WebSocket connection
    function initWebSocket() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol + '//' + window.location.host;

        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
          wsConnected = true;
          reconnectAttempt = 0;
          useFallbackPolling = false;
          updateConnectionStatus('connected');
        };

        ws.onmessage = function(event) {
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'status') {
              updateDashboard(message.data);
              updateRelativeTimestamps();
            } else if (message.type === 'output') {
              appendVerboseOutput(message.data);
            } else if (message.type === 'tasks') {
              updateTasks(message.data);
            } else if (message.type === 'completed') {
              sessionCompleted = true;
              updateConnectionStatus('completed');
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = function(err) {
          console.error('WebSocket error:', err);
        };

        ws.onclose = function() {
          wsConnected = false;

          // Don't reconnect if session is completed
          if (sessionCompleted) {
            updateConnectionStatus('completed');
            return;
          }

          updateConnectionStatus('disconnected');

          // Attempt to reconnect with exponential backoff
          reconnectWebSocket();
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        fallbackToPolling();
      }
    }

    // Reconnect WebSocket with exponential backoff
    function reconnectWebSocket() {
      if (useFallbackPolling) return;

      reconnectAttempt++;

      // Calculate delay with exponential backoff
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt - 1),
        MAX_RECONNECT_DELAY
      );

      updateConnectionStatus('reconnecting');

      // After 3 failed attempts, fall back to polling
      if (reconnectAttempt > 3) {
        fallbackToPolling();
        return;
      }

      reconnectTimeout = setTimeout(() => {
        initWebSocket();
      }, delay);
    }

    // Fall back to polling if WebSocket fails
    function fallbackToPolling() {
      // Don't start polling if session is completed
      if (sessionCompleted) {
        updateConnectionStatus('completed');
        return;
      }

      useFallbackPolling = true;
      updateConnectionStatus('polling');

      // Start polling
      setTimeout(refreshData, 2000);
    }

    // Toggle iteration details visibility
    function toggleIterationDetails(iterationNumber) {
      const detailsEl = document.getElementById('iteration-details-' + iterationNumber);
      if (detailsEl) {
        detailsEl.classList.toggle('expanded');
      }
    }

    // Format elapsed time in seconds to human-readable string
    function formatElapsedTime(seconds) {
      if (seconds < 60) {
        return seconds + 's';
      }
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (minutes < 60) {
        return minutes + 'm ' + remainingSeconds + 's';
      }
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return hours + 'h ' + remainingMinutes + 'm';
    }

    // Format duration for iteration display (matches server-side formatDuration)
    function formatDuration(seconds) {
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (minutes < 60) return minutes + 'm ' + remainingSeconds + 's';
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return hours + 'h ' + remainingMinutes + 'm';
    }

    // Update elapsed time display
    function updateElapsedTime() {
      const elapsedTimeEl = document.getElementById('elapsed-time');
      if (!elapsedTimeEl) return;

      if (!currentIterationStartTime) {
        elapsedTimeEl.textContent = '';
        return;
      }

      const now = new Date();
      const startTime = new Date(currentIterationStartTime);
      const elapsedSeconds = Math.floor((now - startTime) / 1000);

      if (elapsedSeconds >= 0) {
        elapsedTimeEl.textContent = 'Elapsed: ' + formatElapsedTime(elapsedSeconds);
      } else {
        elapsedTimeEl.textContent = '';
      }
    }

    // Calculate average duration of completed iterations
    let cachedIterations = [];

    function calculateAverageDuration(iterations) {
      if (!iterations || iterations.length === 0) return null;

      // Only use successful iterations for ETA calculation
      const successfulIterations = iterations.filter(iter => iter.durationSeconds > 0);
      if (successfulIterations.length === 0) return null;

      const totalDuration = successfulIterations.reduce((sum, iter) => sum + iter.durationSeconds, 0);
      return Math.floor(totalDuration / successfulIterations.length);
    }

    // Update ETA display
    function updateEta() {
      const etaEl = document.getElementById('eta-time');
      if (!etaEl) return;

      if (!currentIterationStartTime || cachedIterations.length === 0) {
        etaEl.textContent = '';
        return;
      }

      const avgDuration = calculateAverageDuration(cachedIterations);
      if (!avgDuration) {
        etaEl.textContent = '';
        return;
      }

      const now = new Date();
      const startTime = new Date(currentIterationStartTime);
      const elapsedSeconds = Math.floor((now - startTime) / 1000);

      const remainingSeconds = avgDuration - elapsedSeconds;

      if (remainingSeconds > 0) {
        etaEl.textContent = 'ETA: ' + formatElapsedTime(remainingSeconds);
      } else {
        // Show that we're past the expected time
        etaEl.textContent = 'ETA: +' + formatElapsedTime(Math.abs(remainingSeconds));
      }
    }

    // Update connection status indicator
    function updateConnectionStatus(status) {
      const dot = document.getElementById('connection-dot');
      const text = document.getElementById('connection-text');
      const footerStatus = document.getElementById('footer-status');

      if (!dot || !text) return;

      // Remove all status classes
      dot.classList.remove('connected', 'disconnected', 'reconnecting', 'polling', 'completed');

      // Add appropriate class and update text
      switch (status) {
        case 'connected':
          dot.classList.add('connected');
          text.textContent = 'Connected';
          if (footerStatus) footerStatus.textContent = 'Real-time updates via WebSocket';
          break;
        case 'disconnected':
          dot.classList.add('disconnected');
          text.textContent = 'Disconnected';
          if (footerStatus) footerStatus.textContent = 'Disconnected';
          break;
        case 'reconnecting':
          dot.classList.add('reconnecting');
          text.textContent = 'Reconnecting...';
          if (footerStatus) footerStatus.textContent = 'Reconnecting...';
          break;
        case 'polling':
          dot.classList.add('polling');
          text.textContent = 'HTTP Polling';
          if (footerStatus) footerStatus.textContent = 'Polling every 2 seconds (WebSocket unavailable)';
          break;
        case 'completed':
          dot.classList.add('completed');
          text.textContent = 'Completed';
          if (footerStatus) footerStatus.textContent = 'Session completed';
          break;
        default:
          text.textContent = 'Unknown';
      }
    }

    // Append output chunk to verbose display (for real-time streaming)
    function appendVerboseOutput(chunk) {
      if (!verboseMode) return;

      const output = document.getElementById('verbose-output');
      if (output) {
        // Empty chunk signals a reset (from clearOutput)
        if (chunk === '') {
          output.textContent = '';
          return;
        }
        output.textContent += chunk;
        // Auto-scroll to bottom
        output.scrollTop = output.scrollHeight;
      }
    }

    // Auto-refresh every 2 seconds (fallback when WebSocket disconnected)
    async function refreshData() {
      // Only poll if we're using fallback polling
      if (!useFallbackPolling) {
        return;
      }

      // Skip refresh if user is typing
      if (isTyping) {
        setTimeout(refreshData, 2000);
        return;
      }
      // Skip refresh if user is typing
      if (isTyping) {
        setTimeout(refreshData, 2000);
        return;
      }

      try {
        // Fetch status
        const response = await fetch('/api/status');
        if (response.ok) {
          const data = await response.json();
          // Update only the dynamic parts instead of reloading entire page
          updateDashboard(data);
        }

        // Also refresh tasks
        const tasksResponse = await fetch('/api/tasks');
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          updateTasks(tasksData);
        }

        // Refresh verbose output if visible
        if (verboseMode) {
          await fetchVerboseOutput();
        }

        // Update relative timestamps
        updateRelativeTimestamps();
      } catch (err) {
        // Silently fail on error
        console.error('Polling error:', err);
      }

      // Continue polling
      setTimeout(refreshData, 2000);
    }

    function updateDashboard(data) {
      // Update progress
      const progressPercent = (data.currentIteration / data.totalIterations) * 100;
      const progressFill = document.querySelector('.progress-fill');
      if (progressFill) {
        progressFill.style.width = progressPercent + '%';

        // Add pulsing animation when iteration is actively running
        if (data.currentIterationStartedAt) {
          progressFill.classList.add('active');
        } else {
          progressFill.classList.remove('active');
        }
      }

      // Update current iteration
      const currentIterationEl = document.getElementById('current-iteration');
      if (currentIterationEl) {
        currentIterationEl.textContent = data.currentIteration;
      }

      // Update iterations value (both in header and controls)
      updateIterationsValue(data.totalIterations);

      // Update status
      const statusText = document.querySelector('.status-text');
      if (statusText) {
        statusText.textContent = data.status;
      }

      // Update current iteration start time
      if (data.currentIterationStartedAt !== currentIterationStartTime) {
        currentIterationStartTime = data.currentIterationStartedAt;
        updateElapsedTime();
      }

      // Cache iterations for ETA calculation
      if (data.iterations && data.iterations.length > 0) {
        cachedIterations = data.iterations;
      } else {
        cachedIterations = [];
      }
      updateEta();

      // Update cost
      const costValue = document.querySelector('.cost-value');
      if (costValue) {
        costValue.textContent = '$' + data.totalCost.toFixed(4);
      }

      // Update pause state
      if (data.isPausedAfterIteration !== isPaused) {
        isPaused = data.isPausedAfterIteration;
        updatePauseButton(isPaused);
      }

      // Update iterations list
      if (data.iterations) {
        updateIterations(data.iterations);
      }
    }

    function updateTasks(data) {
      const tasksCount = document.querySelector('.tasks-count');
      if (tasksCount) {
        tasksCount.textContent = data.completedCount + ' of ' + data.totalCount + ' complete';
      }

      // Update progress bar
      const progressFill = document.querySelector('.tasks-progress-fill');
      if (progressFill) {
        const percentage = data.totalCount > 0
          ? (data.completedCount / data.totalCount) * 100
          : 0;
        progressFill.style.width = percentage + '%';
      }

      const tasksList = document.querySelector('.tasks-list');
      if (!tasksList) return;

      // Group tasks by phase
      const tasksByPhase = {};
      for (const task of data.tasks) {
        const phase = task.phase || 'Other';
        if (!tasksByPhase[phase]) {
          tasksByPhase[phase] = [];
        }
        tasksByPhase[phase].push(task);
      }

      // Rebuild the tasks list
      let html = '';
      for (const phase in tasksByPhase) {
        html += '<div class="phase-header">' + escapeHtml(phase) + '</div>';
        for (const task of tasksByPhase[phase]) {
          const completedClass = task.completed ? ' completed' : '';
          html += '<div class="task-item">';
          html += '<div class="task-checkbox' + completedClass + '"></div>';
          html += '<div class="task-text' + completedClass + '">' + escapeHtml(task.text) + '</div>';
          html += '</div>';
        }
      }
      tasksList.innerHTML = html;
    }

    function updateIterations(iterations) {
      const iterationsList = document.getElementById('iterations-list');
      if (!iterationsList) return;

      if (!iterations || iterations.length === 0) {
        iterationsList.innerHTML = '<div class="no-iterations">No completed iterations yet</div>';
        return;
      }

      // Track which iterations are currently expanded before updating DOM
      const expandedIterations = new Set();
      const existingDetails = iterationsList.querySelectorAll('.iteration-details.expanded');
      for (const detail of existingDetails) {
        const id = detail.id; // e.g., "iteration-details-1"
        const match = id.match(/iteration-details-(d+)/);
        if (match) {
          expandedIterations.add(parseInt(match[1], 10));
        }
      }

      let html = '';
      for (const iter of iterations) {
        const statusClass = iter.success ? 'success' : 'failure';
        const statusIcon = iter.success ? '✓' : '✗';
        const duration = formatDuration(iter.durationSeconds || 0);
        const cost = iter.cost ? iter.cost.toFixed(4) : '0.0000';
        const inputTokens = iter.inputTokens ? iter.inputTokens.toLocaleString() : 'N/A';
        const outputTokens = iter.outputTokens ? iter.outputTokens.toLocaleString() : 'N/A';

        // Check if this iteration was previously expanded
        const isExpanded = expandedIterations.has(iter.number);
        const expandedClass = isExpanded ? ' expanded' : '';

        html += '<div class="iteration-item" onclick="toggleIterationDetails(' + iter.number + ')">';
        html += '<div class="iteration-summary">';
        html += '<span class="iteration-status ' + statusClass + '">' + statusIcon + '</span>';
        html += '<div class="iteration-info">';
        html += '<span class="iteration-number">Iteration ' + iter.number + '</span>';
        html += '<span class="iteration-timestamp" data-timestamp="' + iter.timestamp + '"></span>';
        html += '</div>';
        html += '<span class="iteration-duration">' + duration + '</span>';
        html += '<span class="iteration-cost">$' + cost + '</span>';
        html += '</div>';
        html += '<div class="iteration-details' + expandedClass + '" id="iteration-details-' + iter.number + '">';

        if (iter.inputTokens || iter.outputTokens) {
          html += '<div class="iteration-details-row">';
          html += '<span class="iteration-details-label">Input Tokens:</span>';
          html += '<span class="iteration-details-value">' + inputTokens + '</span>';
          html += '</div>';
          html += '<div class="iteration-details-row">';
          html += '<span class="iteration-details-label">Output Tokens:</span>';
          html += '<span class="iteration-details-value">' + outputTokens + '</span>';
          html += '</div>';
        }

        if (iter.status) {
          html += '<div class="iteration-details-row">';
          html += '<span class="iteration-details-label">Status:</span>';
          html += '<span class="iteration-details-value">' + escapeHtml(iter.status) + '</span>';
          html += '</div>';
        }

        html += '</div>';
        html += '</div>';
      }

      iterationsList.innerHTML = html;
      updateRelativeTimestamps();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Iteration adjustment functions
    async function incrementIterations() {
      try {
        const response = await fetch('/api/iterations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'increment' })
        });

        if (response.ok) {
          const result = await response.json();
          // Update will come through WebSocket, but update immediately for responsiveness
          updateIterationsValue(result.totalIterations);
        }
      } catch (err) {
        console.error('Failed to increment iterations:', err);
      }
    }

    async function decrementIterations() {
      try {
        const response = await fetch('/api/iterations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'decrement' })
        });

        if (response.ok) {
          const result = await response.json();
          // Update will come through WebSocket, but update immediately for responsiveness
          updateIterationsValue(result.totalIterations);
        }
      } catch (err) {
        console.error('Failed to decrement iterations:', err);
      }
    }

    // Update all iterations value displays
    function updateIterationsValue(value) {
      const iterationsValue = document.getElementById('iterations-value');
      const iterationsValueControls = document.getElementById('iterations-value-controls');
      if (iterationsValue) iterationsValue.textContent = value;
      if (iterationsValueControls) iterationsValueControls.textContent = value;
    }

    // Pause toggle
    let isPaused = ${data.isPausedAfterIteration};

    async function togglePause() {
      try {
        const response = await fetch('/api/pause', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pause: !isPaused })
        });

        if (response.ok) {
          const result = await response.json();
          isPaused = result.isPaused;
          updatePauseButton(isPaused);
        }
      } catch (err) {
        console.error('Failed to toggle pause:', err);
      }
    }

    function updatePauseButton(paused) {
      const pauseBtn = document.getElementById('pause-btn');
      const pauseBtnText = document.getElementById('pause-btn-text');
      const pauseBtnIcon = pauseBtn?.querySelector('.btn-icon');
      
      if (pauseBtn) {
        if (paused) {
          pauseBtn.classList.add('active');
          if (pauseBtnIcon) pauseBtnIcon.textContent = '▶';
          if (pauseBtnText) pauseBtnText.textContent = 'Resume';
        } else {
          pauseBtn.classList.remove('active');
          if (pauseBtnIcon) pauseBtnIcon.textContent = '⏸';
          if (pauseBtnText) pauseBtnText.textContent = 'Pause After Iteration';
        }
      }
    }

    // Stop modal functions
    function showStopModal() {
      const modal = document.getElementById('stop-modal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    }

    function hideStopModal() {
      const modal = document.getElementById('stop-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    async function confirmStop() {
      try {
        const response = await fetch('/api/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          hideStopModal();
          // Update connection status to show stopping
          updateConnectionStatus('completed');
        }
      } catch (err) {
        console.error('Failed to stop session:', err);
      }
    }

    // Close modal when clicking outside
    document.addEventListener('click', function(event) {
      const modal = document.getElementById('stop-modal');
      if (modal && event.target === modal) {
        hideStopModal();
      }
    });

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

    // Load tasks on page load
    async function loadInitialTasks() {
      try {
        const response = await fetch('/api/tasks');
        if (response.ok) {
          const data = await response.json();
          updateTasks(data);
        }
      } catch (err) {
        // Silently fail on error
      }
    }

    // Start WebSocket connection and load initial data
    loadVerbosePreference();
    loadInitialTasks();
    updateRelativeTimestamps(); // Initial update
    updateElapsedTime(); // Initial update
    initWebSocket();

    // Update elapsed time and ETA every second
    setInterval(function() {
      updateElapsedTime();
      updateEta();
    }, 1000);

    // Update relative timestamps every 2 seconds
    setInterval(updateRelativeTimestamps, 2000);
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">Ralph CLI Dashboard</div>
      <div class="session-id">${data.sessionId}</div>
      <div class="connection-status">
        <div class="connection-dot" id="connection-dot"></div>
        <span id="connection-text">Connecting...</span>
      </div>
    </div>

    <div class="progress-section">
      <div class="progress-label">
        <span>Progress</span>
        <span>Iteration <span id="current-iteration">${data.currentIteration}</span> of <span class="iterations-value" id="iterations-value">${data.totalIterations}</span></span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
    </div>

    <div class="status-section">
      <div class="status-label">Current Status</div>
      <div class="status-text">${data.status}</div>
      <div class="elapsed-time" id="elapsed-time"></div>
      <div class="eta-time" id="eta-time"></div>
    </div>

    <div class="cost-section">
      <span class="cost-label">Total Cost</span>
      <span class="cost-value">$${data.totalCost.toFixed(4)}</span>
    </div>

    <div class="tasks-section">
      <div class="tasks-header">
        <div class="tasks-title">Tasks</div>
        <div class="tasks-count">Loading...</div>
      </div>
      <div class="tasks-progress-bar">
        <div class="tasks-progress-fill"></div>
      </div>
      <div class="tasks-list">
        <div style="text-align: center; color: #999999; padding: 16px;">Loading tasks...</div>
      </div>
    </div>

    <div class="verbose-section">
      <div class="verbose-header">
        <div class="verbose-title">Verbose Output</div>
        <button id="verbose-toggle" class="verbose-toggle" onclick="toggleVerbose()">Show</button>
      </div>
      <div id="verbose-output" class="verbose-output hidden"></div>
    </div>

    <div class="iterations-section">
      <div class="iterations-title">Iteration History</div>
      <div class="iterations-list" id="iterations-list">
        ${data.iterations.length > 0 ? iterationsHtml : '<div class="no-iterations">No completed iterations yet</div>'}
      </div>
    </div>

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
          autocorrect="off"
          autocapitalize="sentences"
          spellcheck="true"
          enterkeyhint="done"
        />
        <button type="submit" id="task-button" class="add-task-button">Add</button>
      </form>
      <div id="task-feedback" class="add-task-feedback"></div>
    </div>

    <div class="session-controls-section">
      <div class="session-controls-title">Session Controls</div>
      
      <div class="iterations-adjust-row">
        <span class="iterations-adjust-label">Adjust Iterations</span>
        <div class="iterations-adjust-buttons">
          <button class="iteration-adjust-btn" onclick="decrementIterations()" title="Decrease iterations">−</button>
          <span class="iterations-value-inline" id="iterations-value-controls">${data.totalIterations}</span>
          <button class="iteration-adjust-btn" onclick="incrementIterations()" title="Increase iterations">+</button>
        </div>
      </div>

      <div class="session-control-row">
        <button id="pause-btn" class="session-control-btn pause-btn ${data.isPausedAfterIteration ? "active" : ""}" onclick="togglePause()">
          <span class="btn-icon">${data.isPausedAfterIteration ? "▶" : "⏸"}</span>
          <span id="pause-btn-text">${data.isPausedAfterIteration ? "Resume" : "Pause After Iteration"}</span>
        </button>
      </div>

      <div class="session-control-row">
        <button class="session-control-btn stop-btn" onclick="showStopModal()">
          <span class="btn-icon">⏹</span>
          <span>Stop Session</span>
        </button>
      </div>
    </div>

    <!-- Stop Confirmation Modal -->
    <div id="stop-modal" class="modal-overlay hidden">
      <div class="modal-content">
        <div class="modal-title">Stop Session?</div>
        <div class="modal-message">This will immediately stop the current session. Any work in progress will be saved.</div>
        <div class="modal-buttons">
          <button class="modal-btn modal-btn-cancel" onclick="hideStopModal()">Cancel</button>
          <button class="modal-btn modal-btn-confirm" onclick="confirmStop()">Stop Session</button>
        </div>
      </div>
    </div>

    <div class="footer">
      <span id="footer-status">Real-time updates via WebSocket</span>
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
      // Silently fail
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
