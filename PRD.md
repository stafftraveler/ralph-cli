# Product Requirements Document

## Overview

Clean-up the codebase.

## Working directory

`src/`

## Tasks

[x] Scan for code smells: unused exports, dead code, inconsistent patterns, duplicate code. Fix ONE issue per iteration. Repeat until done.
    - ✅ Iteration 1: Deleted unused editor.ts file (38 lines) - openInEditor() function never imported/used
    - ✅ Iteration 2: Removed unused runBeforeIteration() from plugins.ts (9 lines) - exported but never used
    - ✅ Iteration 3: Removed unused _getStatusLabel() from DiffPreview.tsx (22 lines) - defined but never called
    - ✅ Iteration 4: Removed 3 unused keychain functions from keychain.ts (54 lines) - deleteApiKeyFromKeychain, hasApiKeyInKeychain, loadApiKeyFromKeychain
    - ✅ Iteration 5: Made 5 type exports private in use-keyboard.ts - KeyHandler, KeyHandlers, UseKeyboardShortcutsOptions, KeyboardState, KeyboardActions never imported
    - ✅ Iteration 6: Made NotifyOptions interface private in notify.ts - exported but never imported
    - Continue scanning for more issues
