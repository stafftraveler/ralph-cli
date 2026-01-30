# Product Requirements Document

## Overview

Clean-up the codebase.

## Working directory

`src/`

## Tasks

## When the codebase has been cleaned up

[x] The token usage and costs are possibly not reported after the loop finishes. Read about token usage reporting in https://platform.claude.com/docs/en/agent-sdk/cost-tracking and fix this in our code. If possible, show the live token usage and costs of the session in the status bar on the bottom of the screen.
[x] Review the entire codebase. Fix issues.
[x] Prepare this package for release to @stafftraveler/ralph-cli. We are going to install it in other repositories to run our Ralph loops. Finish up README.md. Automatically run the init script after installation of the package using pnpm.
[x] Create a new `/PRD-advise.md` file with items that you suggest can be improved in this package. Also, add instructions on how to publish this package and integrate it in other repositories.
[ ] Scan the code to verify if it is correct according to the updated AGENTS.md instructions. Update files if needed.
[ ] Scan for code smells: unused exports, dead code, inconsistent patterns, duplicate code. Fix ONE issue per iteration. Repeat as needed.
