# Product Requirements Document

## Working directory

`src/`

---

## Chapter 1: WebSocket Completed Status

Send a "completed" message through WebSocket before closing connections, so the dashboard shows "Completed" status instead of reverting to polling.

### Tasks

[ ] Add `broadcastCompleted()` function in `lib/webserver.ts` to send `{ type: "completed" }` message to all WebSocket clients
[ ] Call `broadcastCompleted()` before closing connections in `stopWebServer()`
[ ] Update dashboard JavaScript to handle "completed" message type and set `sessionCompleted` flag
[ ] Modify `ws.onclose` handler to skip reconnection when `sessionCompleted` is true
[ ] Modify `fallbackToPolling()` to skip polling when `sessionCompleted` is true
[ ] Add CSS for `.connection-dot.completed` status (green dot like "connected")

---

## Chapter 2: Dashboard Detailed Status Display

Enhance the dashboard to show detailed status messages from Claude's tool use, including the description field from Shell/Bash commands, with CSS text clipping for long messages.

### Tasks

[ ] Add `extractDescription()` function in `lib/claude.ts` to extract description field from tool input
[ ] Update `formatToolStatus()` in `lib/claude.ts` to use description field for Shell/Bash tools
[ ] Add CSS `text-overflow: ellipsis` styling to `.status-text` in webserver.ts dashboard HTML for single-line clipping

---

## Chapter 3: other dashboard improvements

[ ] The dashboard currently only shows tasks that have not been completed. Previously, it also showed the tasks that are complete (and showed them as ticked off). Please revert to that and show all tasks including the completed ones.
[ ] Add a way to increase/decrease the number of iterations, like in the CLI.
[ ] Add a button to pause after the next iteration. Add this to the CLI as well (keyboard shortcut in CLI). Add a button to stop on the dashboard. A modal should show to confirm that the user wants to stop the script.
[ ] Remove the % from the progress bar. The bar isn't high enough to show it anyway.

## Chapter 4: potential localtunnel replacement

Investigate if there are better alternatives than `localtunnel`. `localtunnel` requires a password. Ideally, I'd just open a safe URL to show the dashboard without entering a password. To make this secure, we could add a '(a) Approve dashboard connection' keyboard shortcut that shows in the keyboard shortcut bar when a dashboard connection is opened by a client. Return a 'Awaiting permission' with a spinner while permission is not granted yet in the CLI. This would make it easier to open the dashboard.

List the alternatives and the results of your research along with your thoughts about this approach in a new `/LOCAL-TUNNEL.md` file.

Requirements:

- [ ] The service that replaces `localtunnel` should not require sign up or an account.
- [ ] The service must be safe
- [ ] The service must be reliable and allow for long connections
