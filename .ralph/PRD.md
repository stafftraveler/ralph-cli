# Product Requirements Document

## Overview

Refactor the codebase.

## Working directory

`src/`

## Constraints

- Preserve existing functionality
- Maintain backward compatibility

## Tasks

[~] Deduplicate code. Move duplicated code in separate component, hooks, and util functions, in their own files. Update the consumers.
  ✅ Iteration 9: Created debugLog utility and replaced 20+ duplicate debug logging patterns across 8 files
[~] Extract logic from components. Move the logic into separate hooks or util functions, in separate files. Update the consumers.
  ✅ Iteration 10: Extracted data-loading and auto-exit logic from SummaryView into useSummaryData and useAutoExit hooks
