# Ralph CLI

Ralph is an interactive CLI for running autonomous Claude Code iterations with real-time status updates. Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) and powered by the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code).

## Features

- **Interactive UI** - Real-time progress display with spinners and status updates
- **Claude Agent SDK** - Direct integration with Claude for reliable, streaming responses
- **Accurate cost tracking** - Real-time token usage and cost display from the SDK
- **Session management** - Resume previous sessions or start fresh
- **Auto-retry** - Configurable retries with exponential backoff on failures
- **macOS notifications** - Get notified when iterations complete
- **Summary report** - Shows duration, commits, cost, and changes
- **Git branch support** - Create or switch to a branch before starting
- **Keyboard shortcuts** - Toggle verbose (`v`), debug (`d`), or quit (`q`) during execution
- **Plugin system** - Extend with custom lifecycle hooks

## Prerequisites

- **Node.js 22+**
- **Claude Code** - Install via Homebrew:
  ```bash
  brew install --cask claude-code
  ```
- **Anthropic API Key** - Set in your environment:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```

## Installation

```bash
# Using npm
npm install -D @stafftraveler/ralph

# Using pnpm
pnpm add -D @stafftraveler/ralph

# Using yarn
yarn add -D @stafftraveler/ralph
```

After installation, initialize Ralph in your project:

```bash
npx ralph init
```

This creates a `.ralph/` directory with templates and adds a `ralph` script to your `package.json`.

## Quick Start

1. **Initialize Ralph** (run once per project):
   ```bash
   npx ralph init
   ```

2. **Create your PRD** with tasks:
   ```bash
   # Opens the PRD in your default editor
   npx ralph init --edit
   
   # Or manually edit
   $EDITOR .ralph/PRD.md
   ```

3. **Run iterations**:
   ```bash
   # Run 5 iterations
   npx ralph 5
   
   # Or use the package.json script
   pnpm ralph 5
   ```

## Usage

```bash
npx ralph [iterations] [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--verbose`, `-v` | Show Claude's full response after each iteration |
| `--dry-run` | Show what would be executed without running Claude |
| `--skip-preflight` | Skip all preflight checks |
| `--branch <name>`, `-b` | Create or switch to a git branch before starting |
| `--save-output` | Save each iteration's output to `.ralph/logs/` |
| `--reset` | Reset `PRD.md` and `progress.txt` for a fresh session |
| `--resume` | Resume from last checkpoint |
| `--debug` | Show debug information |
| `--no-plugins` | Disable all plugins |
| `--create-pr` | Create a draft PR when done |

### Examples

```bash
# Run 5 iterations
npx ralph 5

# Run with verbose output (shows Claude's full response)
npx ralph --verbose 3

# Preview what would run without executing
npx ralph --dry-run 3

# Skip preflight checks for faster iteration
npx ralph --skip-preflight 1

# Create a new branch and run iterations
npx ralph --branch feature/new-widget 5

# Save output logs for debugging or review
npx ralph --save-output 5

# Reset PRD.md and progress.txt for a new session
npx ralph --reset

# Resume from last checkpoint
npx ralph --resume 5

# Create a PR when done
npx ralph --create-pr 5

# Combine flags
npx ralph --verbose --branch feature/api-update 3

# Interactive mode (prompts for iterations)
npx ralph
```

## Project Setup

### Recommended: Add CLAUDE.md

Create a `CLAUDE.md` file in your repository root with project-specific instructions for Claude:

```markdown
# Project Instructions

## Tech Stack
- Framework: Next.js 15
- Language: TypeScript
- Styling: Tailwind CSS

## Commands
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm test` - Run tests
- `pnpm lint:fix` - Fix linting issues

## Code Style
- Use functional components
- Prefer named exports
- Use TypeScript strict mode
```

Ralph automatically loads `CLAUDE.md` and any skills in `.claude/skills/` to provide context for each iteration.

## How It Works

Each iteration, Ralph will:

1. Read the PRD and progress log
2. Select the highest-priority task
3. Implement the task using Claude
4. Update progress and commit changes
5. Check if PRD is complete

Task priority order:
1. Architectural decisions and core abstractions
2. Integration points between modules
3. Unknown unknowns and spike work
4. Standard features and implementation
5. Polish, cleanup, and quick wins

The loop exits early if the PRD is complete (all tasks done).

## Preflight Checks

Before running, Ralph verifies:

- **Claude Code** is installed
- **API Key** is configured (`ANTHROPIC_API_KEY`)
- Script is run from a **git repository**
- `PRD.md` exists and has content
- `CLAUDE.md` exists (warning if missing)

## Configuration

Create a `config` file in the `.ralph/` directory to customize behavior:

```bash
# .ralph/config
MAX_RETRIES=5
SOUND_ON_COMPLETE=true
NOTIFICATION_SOUND="/System/Library/Sounds/Submarine.aiff"
SAVE_OUTPUT=true
OUTPUT_DIR=.ralph/logs
```

### Available Options

| Option | Default | Description |
|--------|---------|-------------|
| `MAX_RETRIES` | `3` | Maximum retry attempts for failed iterations |
| `SOUND_ON_COMPLETE` | `false` | Play a sound when iterations complete |
| `NOTIFICATION_SOUND` | System Glass | Path to custom notification sound file |
| `SAVE_OUTPUT` | `false` | Save Claude's output for each iteration |
| `OUTPUT_DIR` | `.ralph/logs` | Directory for output log files |

## Files

After initialization, your `.ralph/` directory contains:

| File | Description |
|------|-------------|
| `PRD.md` | Product requirements document with tasks |
| `prd/` | PRD templates for different task types |
| `prompt.md` | The prompt sent to Claude each iteration |
| `progress.txt` | Log of completed work across iterations |
| `config` | (Optional) Configuration file |
| `session.json` | (Auto-generated) Session state for resume |
| `logs/` | (Optional) Saved iteration outputs |

## Plugin System

Ralph supports plugins with lifecycle hooks. Place `.js` or `.ts` files in `.ralph/plugins/` or configure in `.ralph/plugins.json`:

```json
{
  "plugins": ["./my-custom-plugin.js"]
}
```

### Plugin Hooks

- `beforeRun(context)` - Before the iteration loop starts
- `beforeIteration(context)` - Before each iteration
- `afterIteration(context, result)` - After each iteration completes
- `done(context, summary)` - When all iterations complete
- `onError(context, error)` - When an error occurs

### Built-in Plugins

- **create-pr** - Automatically creates a draft PR when done (use `--create-pr` flag)

## Cost Tracking

Ralph displays real-time cost information during iterations:

- Input/output token counts
- Actual cost in USD (from Claude Agent SDK)
- Cache hit information (when applicable)
- Total session cost in the summary

## Troubleshooting

### "Claude Code not installed"

Install Claude Code via Homebrew:
```bash
brew install --cask claude-code
```

### "ANTHROPIC_API_KEY not set"

Set your API key in your shell profile (`~/.zshrc` or `~/.bashrc`):
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

### "PRD.md not found"

Run `npx ralph init` to create the `.ralph/` directory with templates.

### Iteration seems stuck

Press `q` to gracefully cancel and see a partial summary of completed work.

## Development

```bash
# Clone the repository
git clone https://github.com/StaffTraveler/ralph-cli.git
cd ralph-cli

# Install dependencies
pnpm install

# Run directly (no build needed)
pnpm start --help

# Type check
pnpm check:types
```

## License

MIT
