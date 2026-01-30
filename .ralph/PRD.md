# Product Requirements Document

## Overview

Improve Ralph CLI with automated testing, CI/CD pipeline enhancements, cost limit enforcement, and better error handling.

## Working directory

`src/`

## Reference

- CLAUDE.md and AGENTS.md for project architecture
- PRD-advise.md for detailed implementation suggestions
- src/lib/config.ts for configuration loading
- src/hooks/use-claude.ts for iteration execution

## Purpose

Make Ralph CLI more robust, maintainable, and user-friendly through testing, better error messages, and proper cost controls.

## Tasks

### 1. Add Automated Testing

[x] Set up Vitest testing framework
    - Add vitest and related dependencies to package.json
    - Create vitest.config.ts configuration file
    - Add test scripts to package.json (`test`, `test:watch`, `test:coverage`)

[x] Add unit tests for session management (src/lib/session.ts)
    - Test session creation and loading
    - Test checkpoint save/restore functionality
    - Mock file system operations

[x] Add unit tests for configuration loading (src/lib/config.ts)
    - Test default config values
    - Test parsing of config file with various formats
    - Test handling of missing or malformed config files

[x] Add unit tests for Claude integration (src/lib/claude.ts)
    - Test iteration execution flow
    - Test error handling and retries
    - Mock Claude Agent SDK

[x] Add unit tests for git operations (src/hooks/use-git.ts)
    - Test commit creation
    - Test branch operations
    - Mock execa calls

[x] Update CI workflow to run tests
    - Add `pnpm test` step to .github/workflows/ci.yml

### 2. Add CI/CD Pipeline Enhancements
Already implemented. Verify that these have been implemented correctly.

[x] Add format check to CI workflow
    - Add `pnpm format --check` step to ci.yml (already implemented)

[x] Add automated publishing on version tags
    - Create workflow that triggers on `v*` tag push
    - Run quality checks before publishing
    - Publish to GitHub Package Registry

### 3. Add Cost Limit Enforcement

[x] Implement pre-iteration cost limit check
    - Check cumulative session cost BEFORE starting each iteration
    - Compare against MAX_COST_PER_SESSION config value
    - Stop execution gracefully if limit would be exceeded

[ ] Add cost warning threshold
    - Warn user when approaching cost limit (e.g., 80% of MAX_COST_PER_SESSION)
    - Display warning in UI with current/max cost values

[ ] Add --max-cost CLI flag
    - Allow overriding config MAX_COST_PER_SESSION via CLI
    - Add option to cli.ts and CliOptions type
    - Pass through to iteration runner

[ ] Show cost projections
    - Calculate average cost per iteration from previous iterations
    - Display projected remaining cost before each iteration
    - Warn if projected cost would exceed limit

### 4. Improve Error Messages

[ ] Add error codes for common errors
    - Create error code enum/constants in types.ts
    - Map errors to codes: ENOENT, EAUTH, ERATE, ECONFIG, etc.

[ ] Improve file not found errors
    - Include full path in error message
    - Add actionable suggestion (e.g., "Run 'npx ralph init'")
    - Example: "Failed to read PRD.md at /path/.ralph/PRD.md - run 'npx ralph init'"

[ ] Improve API key errors
    - Clear message when key is missing vs invalid
    - Link to API key creation page
    - Suggest keychain commands for debugging

[ ] Improve config parsing errors
    - Show line number and problematic value
    - Suggest valid format/values
    - Continue with defaults where possible

[ ] Add troubleshooting section to error output
    - Link to relevant docs when available
    - Suggest common fixes for known issues
