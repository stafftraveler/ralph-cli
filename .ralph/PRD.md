# Product Requirements Document

## Overview

Clean-up the codebase.

## Working file

`src/lib/webserver.ts`

## Scope

The dashboard

## Tasks

✅ Scan for code smells: identify unused exports, dead code, inconsistent patterns, and duplicate code. Document the issues you discover as tasks in this PRD.md file. Fix ONE issue per iteration.

### Code Smells Identified in webserver.ts:

✅ **Large monolithic file (2874 lines)**: webserver.ts contains HTML template, CSS styles, JavaScript client code, and server logic all in one file. Should be split into separate concerns. → Reduced from 2873 to 646 lines by extracting dashboard template.
✅ **Duplicate polling code (lines 1841-1845)**: The `refreshData()` function has duplicate "Skip refresh if user is typing" check - appears twice in a row.
✅ **Magic numbers**: WebSocket ready state checked with hardcoded `1` (line 150, 169, 189, 219) instead of using named constant `WebSocket.OPEN`.
✅ **Inconsistent error handling**: Some errors are logged to console (line 2779), others silently fail (line 224, 2816), no consistent pattern.
✅ **Unused/unclear regex pattern (line 1998)**: Regex pattern `/(iteration-details-(d+)/` is missing backslash before `d+`, should be `/(iteration-details-(\d+)/`.
✅ **Large function (getDashboardHtml)**: 2173 lines (257-2476) containing HTML, CSS, and JS template. Should be extracted to separate files. → Extracted to src/dashboard/template.ts
✅ **Multiple responsibilities**: File handles WebSocket server, HTTP server, request routing, HTML generation, state management, and more. Violates single responsibility principle. → HTML generation now in separate module.

✅ Organize code better. Extract to separate files - Move HTML, CSS, and JS to separate files in src/dashboard/. Use a simple build step - Use esbuild (already a dev dependency pattern in Node projects) to inline them at build time. → Extracted to src/dashboard/template.ts module (no build step needed).
