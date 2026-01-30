# Product Requirements Document

## Working directory

`src/`

---

## Chapter 1: WebSocket Completed Status

Send a "completed" message through WebSocket before closing connections, so the dashboard shows "Completed" status instead of reverting to polling.

### Tasks

[x] Add `broadcastCompleted()` function in `lib/webserver.ts` to send `{ type: "completed" }` message to all WebSocket clients
[x] Call `broadcastCompleted()` before closing connections in `stopWebServer()`
[x] Update dashboard JavaScript to handle "completed" message type and set `sessionCompleted` flag
[x] Modify `ws.onclose` handler to skip reconnection when `sessionCompleted` is true
[x] Modify `fallbackToPolling()` to skip polling when `sessionCompleted` is true
[x] Add CSS for `.connection-dot.completed` status (green dot like "connected")

---

## Chapter 2: Dashboard Detailed Status Display

Enhance the dashboard to show detailed status messages from Claude's tool use, including the description field from Shell/Bash commands, with CSS text clipping for long messages.

### Tasks

[x] Add `extractDescription()` function in `lib/claude.ts` to extract description field from tool input
[x] Update `formatToolStatus()` in `lib/claude.ts` to use description field for Shell/Bash tools
[x] Add CSS `text-overflow: ellipsis` styling to `.status-text` in webserver.ts dashboard HTML for single-line clipping

---

## Chapter 3: other dashboard improvements

[x] The dashboard currently only shows tasks that have not been completed. Previously, it also showed the tasks that are complete (and showed them as ticked off). Please revert to that and show all tasks including the completed ones.
[x] Add a way to increase/decrease the number of iterations, like in the CLI.
[ ] Add a button to pause after the next iteration. Add this to the CLI as well (keyboard shortcut in CLI). Add a button to stop on the dashboard. A modal should show to confirm that the user wants to stop the script.
[x] Remove the % from the progress bar. The bar isn't high enough to show it anyway.
[x] When I open an iteration on the dashboard, it closes after a while. I think the open state may get lost after a re-render.
[x] The costs are only shown in the Dashboard, not in the CLI, even not in the summary. Please also show it in the CLI (live while running and in the summary).
[ ] The costs in the dashboard always show "Total Cost $0.0000". Should we configure the actual costs per token somewhere? I'll list the costs below.

### Claude Code API costs

Model Base Input Tokens 5m Cache Writes 1h Cache Writes Cache Hits & Refreshes Output Tokens
Claude Opus 4.5 $5 / MTok $6.25 / MTok $10 / MTok $0.50 / MTok $25 / MTok

MTok = Million tokens. The "Base Input Tokens" column shows standard input pricing, "Cache Writes" and "Cache Hits" are specific to prompt caching, and "Output Tokens" shows output pricing. Prompt caching offers both 5-minute (default) and 1-hour cache durations to optimize costs for different use cases.

The table above reflects the following pricing multipliers for prompt caching:

5-minute cache write tokens are 1.25 times the base input tokens price
1-hour cache write tokens are 2 times the base input tokens price
Cache read tokens are 0.1 times the base input tokens price

## Chapter 4: potential localtunnel replacement

Investigate if there are better alternatives than `localtunnel`. `localtunnel` requires a password. Ideally, I'd just open a safe URL to show the dashboard without entering a password. To make this secure, we could add a '(a) Approve dashboard connection' keyboard shortcut that shows in the keyboard shortcut bar when a dashboard connection is opened by a client. Return a 'Awaiting permission' with a spinner while permission is not granted yet in the CLI. This would make it easier to open the dashboard.

List the alternatives and the results of your research along with your thoughts about this approach in a new `/LOCAL-TUNNEL.md` file.

### Requirements:

- [ ] The service that replaces `localtunnel` should not require sign up or an account.
- [ ] The service must be safe
- [ ] The service must be reliable and allow for long connections
