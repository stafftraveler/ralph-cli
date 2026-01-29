import { Box, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { usePreflight } from "../hooks/use-preflight.js";
import type { PreflightCheck, PreflightResult } from "../types.js";
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
function CheckStatus({ check }: { check: PreflightCheck }) {
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

  useEffect(() => {
    if (skip) {
      // Skip preflight, assume everything is fine
      onComplete(true, true);
      return;
    }

    void actions.runChecks(ralphDir);
  }, [ralphDir, skip, actions, onComplete, apiKeyProvided]);

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
    if (!isChecking && results !== null && !showApiKeyPrompt) {
      if (allPassed) {
        // Small delay to let user see results before continuing
        const timer = setTimeout(() => {
          onComplete(allPassed, prdHasTasks);
        }, 800);
        return () => clearTimeout(timer);
      }
      // If checks failed (and not waiting for API key), exit after a delay
      const timer = setTimeout(() => {
        exit();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isChecking, results, allPassed, prdHasTasks, onComplete, exit, showApiKeyPrompt]);

  const handleApiKeySubmit = (_apiKey: string) => {
    setShowApiKeyPrompt(false);
    setApiKeyProvided(true);
    // Re-run checks with the new API key
    void actions.runChecks(ralphDir);
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

  // Show API key prompt if needed
  if (showApiKeyPrompt) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold>Preflight Checks</Text>
        </Box>
        {results && (
          <Box flexDirection="column" marginLeft={1} marginBottom={1}>
            <CheckStatus check={results.claudeCode} />
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

  const checks: PreflightCheck[] = [
    results.claudeCode,
    results.apiKey,
    results.git,
    results.prd,
    results.claudeMd,
  ];

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
            <Text color="red">
              Some checks failed. Please fix the issues above.
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * Compact preflight result display (for summary/debug)
 */
export function PreflightSummary({ results }: { results: PreflightResult }) {
  const checks = [
    results.claudeCode,
    results.apiKey,
    results.git,
    results.prd,
    results.claudeMd,
  ];
  const passed = checks.filter((c) => c.status === "passed").length;
  const failed = checks.filter((c) => c.status === "failed").length;
  const warnings = checks.filter((c) => c.status === "warning").length;

  return (
    <Text>
      Preflight: <Text color="green">{passed} passed</Text>
      {warnings > 0 && (
        <Text>
          , <Text color="yellow">{warnings} warnings</Text>
        </Text>
      )}
      {failed > 0 && (
        <Text>
          , <Text color="red">{failed} failed</Text>
        </Text>
      )}
    </Text>
  );
}
