# Ralph CLI

[![CI](https://github.com/StaffTraveler/ralph-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/StaffTraveler/ralph-cli/actions/workflows/ci.yml)
[![Release](https://github.com/StaffTraveler/ralph-cli/actions/workflows/release.yml/badge.svg)](https://github.com/StaffTraveler/ralph-cli/actions/workflows/release.yml)

Ralph is an interactive CLI for running autonomous Claude Code iterations with real-time status updates. Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

## Prerequisites

- **Node.js 22+**
- **Claude Code** - Install from [Anthropic Docs](https://docs.anthropic.com/en/docs/claude-code) or via Homebrew:
  ```bash
  brew install --cask claude-code
  ```

## Installation

This is a private package in the `@stafftraveler` npm scope. You'll need to authenticate with npm first:

```bash
npm login --scope=@stafftraveler --registry=https://npm.pkg.github.com
```

Then install Ralph as a dev dependency in your project:

```bash
pnpm add -D @stafftraveler/ralph
# or
npm install -D @stafftraveler/ralph
```

After installation, you'll see setup instructions automatically. Follow them to get started!

Or install globally for use across all projects:

```bash
pnpm add -g @stafftraveler/ralph
# or
npm install -g @stafftraveler/ralph
```

## Quick Start

After installation, initialize Ralph in your git repository:

```bash
npx ralph init
# or if installed globally
ralph init
```

This will:
- Create the `.ralph/` directory with templates
- Add a `ralph` script to your `package.json` (if present)
- Prompt for your Anthropic API key (stored securely in macOS Keychain)
- Guide you through the initial setup

2. **Set up your API key** (if not already configured):

   Ralph will prompt you for your API key on first run and securely store it in the macOS Keychain. You can also set it manually:

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

   Get your API key from: https://console.anthropic.com/settings/keys

3. **Edit your PRD** with tasks:

   ```bash
   $EDITOR .ralph/PRD.md
   ```

4. **Run iterations**:
   ```bash
   pnpm ralph 5
   # or if installed globally
   ralph 5
   ```

### Options

| Flag                    | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `--verbose`, `-v`       | Show Claude's full response after each iteration      |
| `--dry-run`             | Show what would be executed without running Claude    |
| `--skip-preflight`      | Skip all preflight checks (auth, dependencies, etc.)  |
| `--branch <name>`, `-b` | Create or switch to a git branch before starting      |
| `--logs`                | Save each iteration's output to `.ralph/logs/`        |
| `--reset`               | Reset `PRD.md` and `progress.txt` for a fresh session |
| `--resume`              | Resume from last checkpoint                           |
| `--debug`               | Show debug information                                |
| `--no-plugins`          | Disable all plugins                                   |

### Examples

After running `ralph init`, you can use the `ralph` script added to your `package.json`:

```bash
# Run 5 iterations
pnpm ralph 5

# Run with verbose output (shows Claude's full response)
pnpm ralph -- --verbose 3

# Preview what would run without executing
pnpm ralph -- --dry-run 3

# Skip preflight checks for faster iteration
pnpm ralph -- --skip-preflight 1

# Create a new branch and run iterations
pnpm ralph -- --branch feature/new-widget 5

# Save output logs for debugging or review (enabled by default via init)
pnpm ralph 5

# Reset PRD.md and progress.txt for a new session
pnpm ralph -- --reset

# Resume from last checkpoint
pnpm ralph -- --resume 5

# Combine flags
pnpm ralph -- --verbose --branch feature/api-update 3

# Interactive mode (prompts for iterations)
pnpm ralph
```

Or use `npx` / `pnpm exec` directly:

```bash
npx ralph 5
npx ralph --verbose 3
pnpm exec ralph --branch feature/api-update 3
```

## Features

- **Interactive UI** - Real-time progress display with spinners and status updates
- **Secure API key storage** - API key stored in macOS Keychain, enter once and forget
- **Session management** - Resume a previous session or start fresh
- **Auto-retry** - Configurable retries with exponential backoff on failures
- **Auto-verbose on failure** - Shows full output when an iteration fails
- **macOS notifications** - Get notified when iterations complete (with optional sound)
- **Summary report** - Shows duration, commits, cost, and changes
- **Git branch support** - Create or switch to a branch before starting
- **Dry-run mode** - Preview what would execute without running Claude
- **Graceful cancellation** - Ctrl+C shows partial summary with completed iterations
- **Output logging** - Optionally save each iteration's output to log files
- **Session reset** - Use `--reset` flag to start fresh
- **Plugin system** - Extend with custom lifecycle hooks
- **Keyboard shortcuts** - Toggle verbose (`v`), debug (`d`), or quit (`q`) during execution

## Configuration

Create a `config` file in the `.ralph/` directory to customize behavior:

### Available Options

| Option               | Default       | Description                                  |
| -------------------- | ------------- | -------------------------------------------- |
| `MAX_RETRIES`        | `3`           | Maximum retry attempts for failed iterations |
| `SOUND_ON_COMPLETE`  | `false`       | Play a sound when iterations complete        |
| `NOTIFICATION_SOUND` | System Glass  | Path to custom notification sound file       |
| `SAVE_OUTPUT`        | `false`       | Save Claude's output for each iteration      |
| `OUTPUT_DIR`         | `.ralph/logs` | Directory for output log files               |

Example config:

```bash
# .ralph/config
MAX_RETRIES=5
SOUND_ON_COMPLETE=true
NOTIFICATION_SOUND="/System/Library/Sounds/Submarine.aiff"
SAVE_OUTPUT=true
```

## API Key Storage

Ralph securely stores your Anthropic API key using the **macOS Keychain**, so you only need to enter it once.

### How it works

1. On startup, Ralph checks for `ANTHROPIC_API_KEY` in your environment
2. If not found, it checks the macOS Keychain for a stored key
3. If no key is found, you'll be prompted to enter one
4. The key is automatically saved to the Keychain for future sessions

### Manual management

If you prefer to manage the API key yourself:

```bash
# Set via environment variable (takes precedence over Keychain)
export ANTHROPIC_API_KEY=sk-ant-...

# Or add to your shell profile (~/.zshrc or ~/.bashrc) for persistence
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
```

### Keychain commands

You can also manage the stored key directly using macOS `security` command:

```bash
# View stored key
security find-generic-password -a "anthropic-api-key" -s "ralph-cli" -w

# Delete stored key
security delete-generic-password -a "anthropic-api-key" -s "ralph-cli"
```

## How It Works

Each iteration, Ralph will:

1. Select the highest-priority task from the PRD
2. Implement the task
3. Format code with `pnpm format`
4. Fix linting issues with `pnpm lint:fix`
5. Fix type errors from `pnpm check:types`
6. Update the PRD with completed work
7. Log progress to `progress.txt`
8. Commit changes

Task priority order:

1. Architectural decisions and core abstractions
2. Integration points between modules
3. Unknown unknowns and spike work
4. Standard features and implementation
5. Polish, cleanup, and quick wins

The loop exits early if the PRD is complete (all tasks done).

## Preflight Checks

Before running, Ralph verifies:

- Claude Code is installed
- `ANTHROPIC_API_KEY` is configured (environment variable or macOS Keychain)
- Script is run from a git repository
- `PRD.md` exists and has content
- `CLAUDE.md` exists in repo root (warning if missing)

## Files

All Ralph files are stored in the `.ralph/` directory:

- `PRD.md` - Product requirements document with tasks
- `templates/` - PRD templates for different task types
- `prompt.md` - The prompt sent to Claude each iteration
- `progress.txt` - Log of completed work across iterations
- `config` - Configuration file for custom settings
- `session.json` - (Auto-generated) Session state for resume functionality
- `logs/` - (Optional) Directory for saved iteration outputs

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

## Development

```bash
# Install dependencies
pnpm install

# Run directly (no build needed - uses tsx)
pnpm start --help

# Type check
pnpm check:types
```

## Publishing

This package is published to GitHub Package Registry under the `@stafftraveler` scope. See [PUBLISHING.md](./PUBLISHING.md) for detailed instructions.

Quick publish:

```bash
# Bump version
npm version patch  # or minor, or major

# Push tag (triggers automated release)
git push --tags

# Create release on GitHub
gh release create v1.0.1 --generate-notes
```

## Integration in Other Repositories

### Initial Setup

```bash
# Navigate to your project
cd /path/to/your/project

# Authenticate with GitHub Package Registry (one-time)
npm login --scope=@stafftraveler --registry=https://npm.pkg.github.com

# Install Ralph as a dev dependency
pnpm add -D @stafftraveler/ralph

# Initialize Ralph in the project
npx ralph init
```

### Configure for Your Project

After running `ralph init`, edit `.ralph/PRD.md` with your tasks:

```markdown
# Product Requirements Document

## Overview
[Describe what you're building]

## Working directory
`src/`  # or whatever directory to work in

## Tasks
[ ] Implement user authentication
[ ] Add API endpoints for data fetching
[ ] Create dashboard UI components
[ ] Write unit tests
```

Optionally customize `.ralph/config`:

```bash
MAX_RETRIES=3
SOUND_ON_COMPLETE=true
SAVE_OUTPUT=true
MAX_COST_PER_ITERATION=0.50
MAX_COST_PER_SESSION=5.00
```

### Set Up API Key

```bash
# Option 1: Environment variable (recommended for CI)
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: Let Ralph prompt and save to keychain (interactive)
npx ralph init  # Will prompt if not set

# Option 3: Add to shell profile for persistence
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
```

### Git Configuration

Add to `.gitignore`:

```bash
.ralph/session.json
.ralph/logs/
.ralph/progress.txt
```

Commit Ralph configuration:

```bash
git add .ralph/PRD.md .ralph/prompt.md .ralph/config
git commit -m "Add Ralph CLI configuration"
```

### CI/CD Integration

Example GitHub Actions workflow for automated Ralph runs:

```yaml
# .github/workflows/ralph.yml
name: Ralph Autonomous Development

on:
  workflow_dispatch:
    inputs:
      iterations:
        description: 'Number of iterations'
        required: true
        default: '5'

jobs:
  ralph:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Authenticate with GitHub Package Registry
        run: |
          echo "@stafftraveler:registry=https://npm.pkg.github.com" > .npmrc
          echo "//npm.pkg.github.com/:_authToken=${{ secrets.GITHUB_TOKEN }}" >> .npmrc

      - name: Install dependencies
        run: pnpm install

      - name: Run Ralph
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: pnpm ralph -- --ci ${{ github.event.inputs.iterations }}

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          title: 'Automated changes from Ralph CLI'
          body: 'Changes generated by Ralph autonomous development session'
          branch: ralph-automated-changes
```

## Best Practices

### Writing Effective PRDs

1. **Be Specific:** Vague tasks lead to vague implementations
   - ❌ "Improve performance"
   - ✅ "Optimize database queries in UserService to reduce load time below 100ms"

2. **Prioritize Tasks:** Put most important tasks first
   - Architectural decisions
   - Critical bugs
   - Core features
   - Polish and cleanup

3. **Break Down Large Tasks:** One task per iteration works best
   - ❌ "Build entire authentication system"
   - ✅ "Implement JWT token generation and validation"

4. **Include Acceptance Criteria:**
   ```markdown
   [ ] Add user login endpoint
       - Accepts email and password
       - Returns JWT token on success
       - Returns 401 on invalid credentials
       - Includes rate limiting (5 attempts per minute)
   ```

### Managing Costs

1. **Set Limits:** Always configure cost limits in `.ralph/config`
2. **Monitor Sessions:** Check `.ralph/progress.txt` for cost trends
3. **Use Resume:** Don't start from scratch; resume sessions with `--resume`
4. **Optimize Prompts:** Shorter, clearer prompts = lower costs
5. **Batch Work:** Combine related tasks in one PRD for better context

### Security Considerations

1. **API Keys:** Never commit API keys to version control
2. **Sensitive Data:** Don't include secrets in PRD.md
3. **Review Changes:** Always review commits before pushing
4. **Private Repos:** Keep projects with sensitive data private

### Debugging Tips

1. **Use Debug Mode:** `pnpm ralph -- --debug 1`
2. **Save Logs:** Enable `SAVE_OUTPUT=true` in config
3. **Check Session State:** Review `.ralph/session.json`
4. **Incremental Testing:** Run one iteration at a time first
5. **Verbose Output:** Use `--verbose` to see Claude's full response

## License

MIT
