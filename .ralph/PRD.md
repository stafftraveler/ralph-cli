# Product Requirements Document

## Overview

Clean-up the codebase.

## Working file

`src/lib/webserver.ts`

## Scope

The dashboard

## Tasks

[ ] Scan for code smells: identify unused exports, dead code, inconsistent patterns, and duplicate code. Document the issues you discover as tasks in this PRD.md file. Fix ONE issue per iteration.
[ ] Organize code better. Extract to separate files - Move HTML, CSS, and JS to separate files in src/dashboard/. Use a simple build step - Use esbuild (already a dev dependency pattern in Node projects) to inline them at build time.
