# Product Requirements Document

## Overview

Clean-up the codebase.

## Working directory

`src/`

## Tasks

[x] Scan for code smells: unused exports, dead code, inconsistent patterns, duplicate code. Fix ONE issue per iteration. Repeat until done.
    - ✅ Iteration 1: Eliminated duplicate formatCost() function (3 copies → 1 shared utility in lib/utils.ts)
    - Remaining issues: unused exports in use-keyboard.ts, unused types, formatDuration duplicate in run-ci.ts, unused params/state, inconsistent patterns
