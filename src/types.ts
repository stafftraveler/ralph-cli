/**
 * Configuration loaded from .ralph/config file
 */
export interface RalphConfig {
  maxRetries: number;
  soundOnComplete: boolean;
  notificationSound: string;
  saveOutput: boolean;
  outputDir: string;
  prdTemplatesDir: string;
  defaultTemplate: string;
  /** Maximum cost allowed per iteration in USD. Execution stops if exceeded. */
  maxCostPerIteration?: number;
  /** Maximum cumulative cost allowed per session in USD. Execution stops if exceeded. Warning shown at 80%. */
  maxCostPerSession?: number;
}

/**
 * Persisted session state stored in .ralph/session.json
 */
export interface SessionState {
  id: string;
  startedAt: string;
  startCommit: string;
  branch: string;
  iterations: IterationResult[];
  checkpoint?: SessionCheckpoint;
  /** SDK session ID for resuming conversations */
  sdkSessionId?: string;
  /** Cumulative cost across all iterations */
  totalCostUsd?: number;
}

/**
 * Checkpoint for resume functionality
 */
export interface SessionCheckpoint {
  iteration: number;
  timestamp: string;
  commit: string;
}

/**
 * Result of a single Claude iteration
 */
export interface IterationResult {
  iteration: number;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  success: boolean;
  output: string;
  status?: string;
  usage?: UsageInfo;
  prdComplete: boolean;
  /** True if this iteration exceeded the configured cost limit */
  costLimitExceeded?: boolean;
  /** Reason for cost limit being exceeded (iteration or session) */
  costLimitReason?: "iteration" | "session";
}

/**
 * Token usage and cost info from Claude Agent SDK
 */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  /** Actual cost in USD from SDK */
  totalCostUsd: number;
  /** Cache read tokens (if applicable) */
  cacheReadInputTokens?: number;
  /** Cache creation tokens (if applicable) */
  cacheCreationInputTokens?: number;
}

/**
 * Result of running preflight checks
 */
export interface PreflightResult {
  /** Claude Code installation check (required for SDK) */
  claudeCode: PreflightCheck;
  /** Anthropic API key check */
  apiKey: PreflightCheck;
  /** Git repository check */
  git: PreflightCheck;
  /** PRD.md existence and tasks check */
  prd: PreflightCheck;
  /** CLAUDE.md project instructions check (warning only) */
  claudeMd: PreflightCheck;
}

/**
 * Single preflight check result
 */
export interface PreflightCheck {
  name: string;
  status: "pending" | "checking" | "passed" | "failed" | "warning";
  message?: string;
  error?: string;
}

/**
 * Git diff statistics for a file
 */
export interface DiffStat {
  file: string;
  status: "M" | "A" | "D" | "R" | "C" | "U";
  additions: number;
  deletions: number;
}

/**
 * Plugin lifecycle hooks
 */
export interface RalphPlugin {
  name: string;
  /** Called before the first iteration starts */
  beforeRun?: (context: PluginContext) => Promise<void>;
  /** Called before each iteration */
  beforeIteration?: (context: IterationContext) => Promise<void>;
  /** Called after each iteration completes */
  afterIteration?: (context: IterationContext) => Promise<void>;
  /** Called when all iterations complete or PRD is done */
  done?: (context: PluginContext) => Promise<void>;
  /** Called on error or interrupt */
  onError?: (context: PluginContext, error: Error) => Promise<void>;
}

/**
 * Base context available to all plugin hooks
 */
export interface PluginContext {
  config: RalphConfig;
  session: SessionState;
  repoRoot: string;
  branch: string;
  verbose: boolean;
  dryRun: boolean;
}

/**
 * Context for iteration-specific plugin hooks
 */
export interface IterationContext extends PluginContext {
  iteration: number;
  totalIterations: number;
  result?: IterationResult;
}

/**
 * Final summary displayed after session completes
 */
export interface SessionSummary {
  totalIterations: number;
  totalDurationSeconds: number;
  totalCost?: number;
  commits: CommitInfo[];
  filesChanged: DiffStat[];
  prdComplete: boolean;
  prUrl?: string;
}

/**
 * Git commit information
 */
export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  timestamp: string;
}

/**
 * CLI options parsed from command line arguments
 */
export interface CliOptions {
  verbose: boolean;
  dryRun: boolean;
  skipPreflight: boolean;
  branch?: string;
  logs: boolean;
  reset: boolean;
  debug: boolean;
  resume: boolean;
  noPlugins: boolean;
  createPr: boolean;
  iterations?: number;
  /** CI mode - non-interactive, no Ink UI */
  ci: boolean;
  /** Override MAX_COST_PER_SESSION from CLI */
  maxCost?: number;
}

/**
 * App state for the main Ink component
 */
export type AppPhase =
  | "welcome"
  | "iterations-prompt"
  | "preflight"
  | "template-select"
  | "session-prompt"
  | "running"
  | "summary"
  | "error";

/**
 * PRD template metadata
 */
export interface PrdTemplate {
  name: string;
  path: string;
  description?: string;
}
