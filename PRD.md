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
    - ✅ Iteration 7: Removed getDefaultConfig() from config.ts (5 lines) - exported but never imported
    - ✅ Iteration 8: Made 3 exports private in plugins.ts - PluginHook, PluginConfig, runHook() only used internally
    - ✅ Iteration 9: Made 2 interface exports private in use-session.ts - UseSessionState, UseSessionActions only used internally
    - ✅ Iteration 10: Made 2 interface exports private in use-preflight.ts - UsePreflightState, UsePreflightActions only used internally
    - ✅ Iteration 11: Made 2 interface exports private in use-claude.ts - UseClaudeActions, RunIterationOptions only used internally (kept UseClaudeState exported as it's used by IterationRunner)
    - ✅ Iteration 12: Removed hasUncommittedChanges() from use-git.ts (19 lines) - exported but never imported
    - ✅ Iteration 13: Removed hasUntrackedFiles() from use-git.ts (13 lines) - exported but never imported
    - Continue scanning for more issues (isOnMainBranch, getCommitCount still unused)
