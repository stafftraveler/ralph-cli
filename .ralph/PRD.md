# Product Requirements Document

## Overview

Improve the mobile dashboard for Ralph CLI to provide a better user experience for monitoring and managing Claude Code iterations remotely.

## Working directory

`src/lib/webserver.ts`

## Purpose

The mobile dashboard allows users to monitor Ralph sessions from their phone when away from the terminal. This PRD outlines improvements to make the dashboard more user-friendly, functional, and visually polished.

## Current State

The dashboard (`src/lib/webserver.ts`) currently provides:

- Progress bar showing iteration progress
- Current status text
- Total cost display
- Iteration history list
- Add task form
- Auto-refresh every 2 seconds

## Goals

1. Cleaner, more minimal visual design
2. Better mobile UX with improved touch targets and responsiveness
3. More useful information display (completed tasks, verbose output)
4. Improved real-time feedback and status indicators

---

## Tasks

### Phase 1: Visual Design Cleanup

[x] Remove the card container and gradient background - use a clean white/dark background
[x] Remove gradient from progress bar - use solid color
[x] Make 'Total Cost' block smaller and more subtle (inline or smaller font)
[x] Use a more minimal color palette (monochrome with accent color)
[x] Reduce visual noise - simplify borders, shadows, and decorative elements
[x] Add proper spacing using consistent 8px grid system

### Phase 2: Task Display

[x] Add API endpoint `GET /api/tasks` to return parsed PRD tasks
[x] Create a "Tasks" section showing all PRD tasks with their status
[x] Display completed tasks with strikethrough or checkmark styling
[x] Show task counts (e.g., "3 of 7 tasks complete")
[x] Add visual progress indicator for task completion percentage

### Phase 3: Verbose Mode

[x] Add "Verbose mode" toggle button to the dashboard UI
[x] Create API endpoint `GET /api/output` to stream Claude's output
[x] Display verbose output in a scrollable, monospace font container
[x] Auto-scroll to bottom as new output arrives
[x] Add ability to collapse/expand verbose output section
[x] Persist verbose mode preference in localStorage

### Phase 4: Mobile UX Improvements

[x] Increase touch target sizes to minimum 44px height for all interactive elements
[x] Add proper touch feedback states (`:active` visual feedback)
[x] Improve input field sizing for mobile keyboards
[x] Add `meta` tags for PWA support (apple-mobile-web-app-capable, theme-color)
[x] Support `prefers-color-scheme: dark` media query for automatic dark mode

### Phase 5: Real-Time Status Enhancements

Moved to phase 7

### Phase 6: Iteration History Improvements

[ ] Show duration for each completed iteration
[ ] Add success/failure status indicator per iteration
[ ] Display relative timestamps ("2m ago" instead of ISO dates)
[ ] Color-code iterations by status (green=success, red=failed, yellow=running)
[ ] Make iteration items expandable to show more details (tokens, status messages)

### Phase 7: WebSocket Implementation

[ ] Add WebSocket server alongside HTTP server
[ ] Broadcast status updates to connected clients in real-time
[ ] Replace polling with WebSocket connection on the client
[ ] Add connection state handling (connecting, connected, disconnected, reconnecting)
[ ] Implement automatic reconnection with exponential backoff
[ ] Fall back to polling if WebSocket connection fails
[ ] Add pulsing/animated indicator when iteration is actively running
[ ] Show elapsed time for current iteration
[ ] Display estimated time remaining based on average iteration duration
[ ] Add connection status indicator (connected/reconnecting)

---

## Technical Notes

### File Structure

- Main implementation: `src/lib/webserver.ts`
- PRD parsing: `src/lib/prd.ts` (may need to export task parsing for API)

### API Endpoints (Current)

- `GET /` - HTML dashboard
- `GET /api/status` - JSON status data
- `POST /api/task` - Add task to PRD

### API Endpoints (New)

- `GET /api/tasks` - Return parsed PRD tasks with completion status
- `GET /api/output` - Return recent Claude output (for verbose mode)

### Dependencies

- `ws` package for WebSocket server (Phase 7)

---

## Out of Scope

- Push notifications
- Offline support / service worker
- Authentication / security
- Session controls (pause/resume/cancel)

---

## Success Criteria

1. Dashboard loads fast and feels responsive on mobile devices
2. Users can see task completion progress at a glance
3. Verbose mode provides CLI-equivalent visibility into Claude's work
4. Visual design is clean and distraction-free
5. All interactive elements are easy to tap on mobile
