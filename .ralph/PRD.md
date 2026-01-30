# Product Requirements Document

## Overview

Refactor the codebase.

## Working directory

`src/`

## Constraints

- Preserve existing functionality
- Maintain backward compatibility

## Tasks

✅ Deduplicate code. Move duplicated code in separate component, hooks, and util functions, in their own files. Update the consumers.
  - Iteration 9: Created debugLog utility to replace 20+ duplicate debug logging patterns
  - Iteration 2: Consolidated formatDuration function

✅ Extract logic from components. Move the logic into separate hooks or util functions, in separate files. Update the consumers.
  - Iteration 10: Extracted SummaryView logic into useSummaryData and useAutoExit hooks
  - Iteration 11: Extracted SessionPrompt session checking into useSessionCheck hook
