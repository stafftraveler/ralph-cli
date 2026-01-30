# Product Requirements Document

## Overview

Clean-up the codebase.

## Working directory

`src/`

## Tasks

[x] Scan for code smells: identify unused exports, dead code, inconsistent patterns, and duplicate code. Document the issues you discover as tasks in this PRD.md file. Fix ONE issue per iteration.

### High Priority Issues

[x] Remove unused InitOptions type and _options parameter from src/commands/init.ts (lines 99, 151)
[ ] Consolidate formatDuration - remove duplicate from src/lib/webserver.ts, import from src/lib/utils.ts
[ ] Fix error handling in src/hooks/use-claude.ts catch block (line 169) - add debug logging for swallowed errors
[ ] Remove unused _config parameter from runClaude in src/lib/claude.ts (line 235)

### Medium Priority Issues

[ ] Export NotifyOptions interface in src/lib/notify.ts (line 9) or integrate into function signature
[ ] Standardize function declarations - use function keyword for pure functions consistently (per CLAUDE.md)
[ ] Review and add debug logging to empty catch blocks in src/cli.ts (lines 22, 95, 110)
[ ] Review and add debug logging to empty catch blocks in src/hooks/use-git.ts (multiple occurrences)

### Low Priority Issues

[ ] Add explicit return types to component functions (e.g., App.tsx SummaryView, IterationRunner.tsx UsageDisplay)
[ ] Improve type specificity for tool inputs (replace Record<string, unknown> with more specific types in src/lib/claude.ts)
[ ] Review console.* calls (186 total) - ensure consistent guarding with DEBUG env var
