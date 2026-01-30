# Ralph CLI - AI Agent Instructions

Ralph is an interactive CLI for running autonomous Claude Code iterations with real-time status updates. Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) and the Claude Agent SDK.

## Commands

```bash
# Authenticate with GitHub Package Registry (one-time setup)
npm login --scope=@stafftraveler --registry=https://npm.pkg.github.com

# Install in a project
pnpm add -D @stafftraveler/ralph

# Initialize ralph in any git repository
npx ralph init

# Run iterations (after init adds script to package.json)
pnpm ralph 5

# Or run directly
npx ralph 5

# Type checking (for development)
pnpm check:types
```

## Architecture

### Tech Stack

- **Runtime**: Node.js 22+ with tsx (TypeScript execution)
- **CLI Framework**: Commander.js for argument parsing
- **UI Framework**: Ink 5 (React 18 for the terminal)
- **AI Integration**: @anthropic-ai/claude-agent-sdk for Claude orchestration
- **Process Management**: execa for subprocess execution
- **Security**: macOS Keychain for API key storage

### Project Structure

```
ralph-cli/
├── bin/ralph              # Entry point (shebang script using tsx)
├── src/
│   ├── index.tsx          # Main entry - renders Ink App
│   ├── cli.ts             # CLI argument parsing with Commander
│   ├── types.ts           # All TypeScript interfaces
│   ├── commands/          # Subcommand implementations
│   │   ├── init.ts        # `ralph init` command
│   │   ├── run.tsx        # `ralph run` command (default)
│   │   └── run-ci.ts      # CI mode (non-interactive)
│   ├── components/        # Ink React components
│   │   ├── App.tsx        # Main orchestration component
│   │   ├── ApiKeyPrompt.tsx
│   │   ├── IterationRunner.tsx
│   │   ├── Preflight.tsx
│   │   ├── SessionPrompt.tsx
│   │   ├── Summary.tsx
│   │   ├── TemplateSelector.tsx
│   │   └── Welcome.tsx
│   ├── hooks/             # React hooks
│   │   ├── use-claude.ts  # Claude iteration execution
│   │   ├── use-git.ts     # Git operations
│   │   ├── use-keyboard.ts
│   │   ├── use-preflight.ts
│   │   └── use-session.ts
│   ├── lib/               # Non-React utilities
│   │   ├── claude.ts      # Claude SDK integration
│   │   ├── config.ts      # .ralph/config loading
│   │   ├── keychain.ts    # macOS Keychain API key storage
│   │   ├── notify.ts      # macOS notifications
│   │   ├── plugins.ts     # Plugin system
│   │   ├── prd.ts         # PRD parsing
│   │   ├── session.ts     # Session state management
│   │   └── utils.ts       # General utilities
│   └── templates/         # Template files
│       ├── init/          # Files copied by `ralph init`
│       │   └── prompt.md  # Default iteration prompt
│       └── prd/           # PRD templates
│           ├── bug-fix.md
│           ├── cleanup.md
│           ├── empty.md
│           ├── new-feature.md
│           ├── refactor.md
│           └── update-dependencies.md
└── package.json
```

### Data Flow

1. **CLI Entry** (`bin/ralph` → `src/index.tsx`)

   - Parses arguments with Commander
   - Renders Ink `<App>` component

2. **App Phases** (`src/components/App.tsx`)

   ```
   Welcome → Preflight → TemplateSelector (if needed) → SessionPrompt →
   Running (iteration loop) → Summary
   ```

3. **Iteration Loop** (`src/components/IterationRunner.tsx`)

   - Reads PRD.md and progress.txt
   - Sends prompt to Claude via SDK
   - Streams output and status updates
   - Handles retries on failure

4. **Claude Integration** (`src/lib/claude.ts`)
   - Uses `@anthropic-ai/claude-agent-sdk` query function
   - Streams responses with tool use status
   - Tracks token usage and costs

### Key Types

All types are defined in `src/types.ts`:

- `CliOptions` - Command line arguments
- `RalphConfig` - Configuration from .ralph/config
- `SessionState` - Persisted session state
- `IterationResult` - Result of a single iteration
- `PreflightResult` - Preflight check results
- `RalphPlugin` - Plugin lifecycle hooks
- `AppPhase` - UI state machine phases

## Code Style

### General Principles

- Write concise, readable TypeScript code
- Use TypeScript strictly (no `any`)
- Use functional and declarative programming patterns
- Use `function` keyword for pure functions
- Use React hooks for stateful logic
- Follow DRY (Don't Repeat Yourself) principle
- Separate concerns: put utility functions in `lib/`, hooks in `hooks/`
- Prefix Node.js imports with `node:` (e.g., `node:fs/promises`)
- Import React APIs explicitly (e.g., `import { useState } from "react"`)
- Use early returns for readability
- Unused variables must be prefixed with `_`

### Component Structure

- Put each component in its own file
- Structure components logically: exports, subcomponents, helpers, types

### Naming Conventions

- Files: kebab-case (`use-preflight.ts`)
- Hooks: `use-` prefix (`usePreflight`)
- Components: PascalCase (`IterationRunner`)
- Event handlers: `handle-` prefix (`handleIterationComplete`)
- Boolean variables: `is-`, `has-`, `should-` prefixes

### Ink/React Patterns

Components use Ink's Box/Text primitives:

```tsx
import { Box, Text } from "ink";

export function MyComponent({ message }: { message: string }) {
  return (
    <Box flexDirection="column">
      <Text color="green">{message}</Text>
    </Box>
  );
}
```

Hooks follow the `[state, actions]` pattern:

```tsx
export function usePreflight(): [UsePreflightState, UsePreflightActions] {
  const [isChecking, setIsChecking] = useState(false);
  // ...
  return [state, actions] as const;
}
```

### Comments

- Use JSDoc comment format (`/** */`).

### Error Handling

- Use try/catch with specific error types
- Return result objects with `success` boolean for operations
- Log errors in debug mode only

## Testing

No test framework is currently configured. When adding tests:

- Use Vitest for consistency with parent project
- Mock execa and Claude SDK calls
- Test hooks with @testing-library/react-hooks

## Common Tasks

### Adding a New CLI Flag

1. Add option to `src/cli.ts` in the `run` command:

   ```ts
   .option("--my-flag", "Description", false)
   ```

2. Add to `CliOptions` interface in `src/types.ts`

3. Pass through to components via `options` prop

### Adding a New Component

1. Create file in `src/components/` with `.tsx` extension
2. Export named function component
3. Import in `App.tsx` and add to phase rendering

### Adding a New Hook

1. Create file in `src/hooks/` with `use-` prefix
2. Follow `[state, actions]` return pattern
3. Export standalone function for non-React use if needed

### Adding a New PRD Template

1. Create markdown file in `src/templates/prd/`
2. Template is automatically discovered by `TemplateSelector`

### Modifying Claude Prompt

Edit `src/templates/init/prompt.md` - this is the system prompt sent each
iteration. Key sections:

- Task selection and prioritization
- Code quality expectations
- Status tag format for UI updates
- Progress file format

## Plugin System

Plugins implement lifecycle hooks:

```ts
interface RalphPlugin {
  name: string;
  beforeRun?: (context: PluginContext) => Promise<void>;
  beforeIteration?: (context: IterationContext) => Promise<void>;
  afterIteration?: (context: IterationContext) => Promise<void>;
  done?: (context: PluginContext) => Promise<void>;
  onError?: (context: PluginContext, error: Error) => Promise<void>;
}
```

Plugins are loaded from `.ralph/plugins/` directory or configured in
`.ralph/plugins.json`.

## Configuration

Configuration loaded from `.ralph/config`:

| Option                   | Default       | Description                          |
| ------------------------ | ------------- | ------------------------------------ |
| `MAX_RETRIES`            | `3`           | Retry attempts for failed iterations |
| `SOUND_ON_COMPLETE`      | `false`       | Play sound on completion             |
| `NOTIFICATION_SOUND`     | System Glass  | Custom sound path                    |
| `SAVE_OUTPUT`            | `false`       | Save iteration logs                  |
| `OUTPUT_DIR`             | `.ralph/logs` | Log directory                        |
| `MAX_COST_PER_ITERATION` | none          | USD limit per iteration              |
| `MAX_COST_PER_SESSION`   | none          | USD limit per session                |
| `LINEAR_TEAM_ID`         | none          | Linear team ID for issue integration |
| `LINEAR_API_KEY`         | none          | Linear API key for issue tracking    |

## API Key Management

The API key is sourced in order:

1. `ANTHROPIC_API_KEY` environment variable
2. macOS Keychain (service: `ralph-cli`, account: `anthropic-api-key`)
3. Interactive prompt (saved to Keychain)

See `src/lib/keychain.ts` for Keychain operations using macOS `security` CLI.

## Dependencies

Key dependencies and their purposes:

| Package                               | Purpose                              |
| ------------------------------------- | ------------------------------------ |
| `@anthropic-ai/claude-agent-sdk`      | Claude Code execution                |
| `ink`                                 | React for terminal UI                |
| `ink-spinner`, `ink-text-input`, etc. | Ink components                       |
| `commander`                           | CLI argument parsing                 |
| `execa`                               | Process execution                    |
| `chalk`                               | Terminal colors (for non-Ink output) |
| `node-notifier`                       | macOS notifications                  |

## Features

### Remote Monitoring

Ralph includes a mobile-optimized web dashboard for remote monitoring:

- Accessible via cloudflared
- Real-time status updates with iteration history
- Task management with progress tracking
- Verbose mode toggle for Claude output
- Success/failure indicators with color coding
- Duration and relative timestamps for iterations
- Cost tracking visualization
- Dark mode support (automatic)
- PWA-enabled for mobile devices

### Linear Integration

Integrate with Linear for issue tracking:

- Configure `LINEAR_TEAM_ID` and `LINEAR_API_KEY` in `.ralph/config`
- Automatically link iterations to Linear issues
- Update issue status based on progress

### Cost Management

- Cost projections based on previous iterations
- `--max-cost` flag to override session limits
- Warnings at 80% of cost threshold
- Per-iteration and per-session limits

### System Sleep Prevention

Ralph uses `caffeinate` to prevent macOS from sleeping during execution

## Debugging

- Use `--debug` flag for verbose logging
- Use `--dry-run` to preview without execution
- Use `--verbose` to see full Claude output
- Press `d` during execution to toggle debug mode
- Press `v` during execution to toggle verbose mode

## Known Patterns

### Status Updates

The Claude prompt instructs Claude to output `<status>...</status>` tags which
are parsed by `IterationRunner` to update the UI spinner text.

### PRD Completion

When all tasks are done, Claude outputs `<promise>COMPLETE</promise>` which
triggers early exit from the iteration loop.

### Session Resumption

Session state is persisted to `.ralph/session.json` with:

- Session ID
- Start commit SHA
- Completed iterations
- Checkpoint for resume
- SDK session ID (for conversation continuity)

### Cost Tracking

Token usage and costs are captured from the SDK's `result` message:

```ts
usage: {
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
```

## CI Mode

Use `--ci` flag for non-interactive execution:

- Skips Ink UI rendering
- Uses plain text output
- Requires `iterations` argument
- Exits with non-zero code on failure
