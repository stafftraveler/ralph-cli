# Product Requirements Document

## Overview

Clean-up the codebase.

## Working directory

`src/`

## Tasks

[x] Scan for code smells: unused exports, dead code, inconsistent patterns, duplicate code. Fix ONE issue per iteration. Repeat until done.
    - ✅ Iteration 1: Eliminated duplicate formatCost() function (3 copies → 1 shared utility in lib/utils.ts)
    - ✅ Iteration 2: Removed unused hook exports from use-keyboard.ts (useKeyHandler, useEnterKey, useEscapeKey)
    - ✅ Iteration 3: Made formatToolStatus and isPrdComplete non-exported in claude.ts (only used internally)
    - Remaining issues: unused params/state in App.tsx and IterationRunner.tsx, inconsistent patterns
