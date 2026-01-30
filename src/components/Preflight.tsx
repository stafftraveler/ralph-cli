import { Box, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";
import { usePreflight } from "../hooks/use-preflight.js";
import type { PreflightCheck } from "../types.js";
import { ApiKeyPrompt } from "./ApiKeyPrompt.js";

/**
 * Props for the Preflight component
 */
export interface PreflightProps {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Called when all checks complete */
  onComplete: (passed: boolean, prdHasTasks: boolean) => void;
  /** Whether to skip checks and immediately complete */
  skip?: boolean;
}

/**
 * Status indicator for a single check
 */
function CheckStatus({ check }: { check: PreflightCheck; }) {
  const statusIcon = {
    pending: "○",
    checking: null, // Will show spinner
    passed: "✓",
    failed: "✗",
    warning: "⚠",
  }[check.status];

  const statusColor = {
    pending: "gray",
    checking: "cyan",
    passed: "green",
    failed: "red",
    warning: "yellow",
  }[check.status] as "gray" | "cyan" | "green" | "red" | "yellow";

  return (
    <Box>
      <Box width={2}>
        {check.status === "checking" ? (
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color={statusColor}>{statusIcon}</Text>
        )}
      </Box>
      <Box width={14}>
        <Text color={statusColor}>{check.name}</Text>
      </Box>
      {check.message && <Text color="gray">{check.message}</Text>}
      {check.error && <Text color="red">{check.error}</Text>}
    </Box>
  );
}

/**
 * Preflight component showing live status for each check
 *
 * Displays spinners while checking, then checkmarks/crosses when complete.
 * Shows API key prompt if the key is missing.
 * Transitions to TemplateSelector if PRD has no tasks.
 */
export function Preflight({ ralphDir, onComplete, skip }: PreflightProps) {
  const { exit } = useApp();
  const [state, actions] = usePreflight();
  const { isChecking, results, allPassed, prdHasTasks } = state;
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [apiKeyProvided, setApiKeyProvided] = useState(false);
  // Track whether completion has been triggered (use ref to avoid re-renders)
  const completionTriggeredRef = useRef(false);

  useEffect(() => {
    if (skip) {
      // Skip preflight, assume everything is fine
      onComplete(true, true);
      return;
    }

    void actions.runChecks(ralphDir);
  }, [ralphDir, skip, actions, onComplete]);

  // Check if API key is missing and show prompt
  useEffect(() => {
    if (!isChecking && results !== null && !apiKeyProvided) {
      const apiKeyFailed = results.apiKey.status === "failed";
      if (apiKeyFailed && !showApiKeyPrompt) {
        setShowApiKeyPrompt(true);
      }
    }
  }, [isChecking, results, apiKeyProvided, showApiKeyPrompt]);

  // When checks complete, notify parent (only if passed) or exit (if failed)
  useEffect(() => {
    // Don't run if already triggered
    if (completionTriggeredRef.current) return;
    if (isChecking || results === null) return;

    // Check if API key failed - if so, wait for user to provide it
    const apiKeyFailed = results.apiKey.status === "failed";
    if (apiKeyFailed && !apiKeyProvided) {
      // Don't complete/exit - wait for API key prompt
      return;
    }

    // If user just provided API key, treat as passed (allPassed state may lag)
    const effectivelyPassed = allPassed || apiKeyProvided;

    // Mark as triggered immediately (before any state changes or timers)
    completionTriggeredRef.current = true;

    if (effectivelyPassed) {
      // Small delay to let user see results before continuing
      setTimeout(() => {
        onComplete(true, prdHasTasks);
      }, 800);
    } else {
      // If checks failed (not API key), exit after a delay
      setTimeout(() => {
        exit();
      }, 2000);
    }
    // No cleanup - we want the timer to fire regardless of re-renders
  }, [isChecking, results, allPassed, prdHasTasks, onComplete, exit, apiKeyProvided]);

  const handleApiKeySubmit = (_apiKey: string) => {
    setShowApiKeyPrompt(false);
    setApiKeyProvided(true);
    // Mark API key as passed (no need to re-run all checks)
    actions.markApiKeyPassed();
  };

  const handleApiKeySkip = () => {
    setShowApiKeyPrompt(false);
    // Continue with failed check - will exit due to failure
  };

  if (skip) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⚡ Skipping preflight checks</Text>
      </Box>
    );
  }

  // Show API key prompt if needed (guard with apiKeyProvided to prevent race conditions)
  if (showApiKeyPrompt && !apiKeyProvided) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold>Preflight Checks</Text>
        </Box>
        {results && (
          <Box flexDirection="column" marginLeft={1} marginBottom={1}>
            <CheckStatus check={results.apiKey} />
          </Box>
        )}
        <ApiKeyPrompt onSubmit={handleApiKeySubmit} onSkip={handleApiKeySkip} />
      </Box>
    );
  }

  // Initial state before results
  if (!results) {
    return (
      <Box flexDirection="column">
        <Text bold>Running preflight checks...</Text>
      </Box>
    );
  }

  const checks: PreflightCheck[] = [results.apiKey, results.git, results.prd, results.claudeMd];

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text bold>Preflight Checks</Text>
      </Box>
      <Box flexDirection="column" marginLeft={1}>
        {checks.map((check) => (
          <CheckStatus key={check.name} check={check} />
        ))}
      </Box>
      {!isChecking && (
        <Box marginTop={1}>
          {allPassed ? (
            <Text color="green">All checks passed!</Text>
          ) : (
            <Text color="red">Some checks failed. Please fix the issues above.</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
