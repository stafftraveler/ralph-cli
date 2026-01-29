# Product Requirements Document

## Overview

Clean-up the codebase.

## Working directory

`src/`

## Tasks

[x] Scan for code smells: unused exports, dead code, inconsistent patterns, duplicate code. Fix ONE issue per iteration. Repeat until done.
    - ✅ Iteration 1: Deleted unused editor.ts file (38 lines) - openInEditor() function never imported/used
    - ✅ Iteration 2: Removed unused runBeforeIteration() from plugins.ts (9 lines) - exported but never used
    - Continue scanning for more issues
