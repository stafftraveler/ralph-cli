# Ralph CLI - Improvement Suggestions & Publishing Guide

This document contains suggestions for improving the Ralph CLI package, along with comprehensive instructions for publishing and integration.

## Table of Contents

1. [Suggested Improvements](#suggested-improvements)
2. [Publishing Instructions](#publishing-instructions)
3. [Integration in Other Repositories](#integration-in-other-repositories)
4. [Best Practices](#best-practices)

---

## Suggested Improvements

### High Priority

#### 1. Add Automated Testing

**Current State:** No test framework is configured.

**Recommendation:**
- Add Vitest for unit and integration testing
- Test coverage for critical paths:
  - Session state management (`src/lib/session.ts`)
  - Configuration loading (`src/lib/config.ts`)
  - Claude integration (`src/lib/claude.ts`)
  - Git operations (`src/hooks/use-git.ts`)
- Mock external dependencies (execa, Claude SDK, file system operations)
- Add test script to package.json and CI/CD pipeline

**Benefit:** Prevents regressions, improves confidence in releases, catches edge cases.

#### 2. Cross-Platform Support

**Current State:** Keychain storage is macOS-only.

**Recommendation:**
- Abstract credential storage behind an interface
- Add Linux support using `libsecret` or encrypted file storage
- Add Windows support using Windows Credential Manager
- Fallback to encrypted file storage when OS keychain unavailable
- Update documentation to reflect cross-platform support

**Implementation:**
```typescript
// src/lib/credential-storage.ts
interface CredentialStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

// Implementations: MacOSKeychain, LinuxSecretService, WindowsCredentialManager, EncryptedFileStorage
```

**Benefit:** Expands user base, enables Windows/Linux developers to use Ralph.

#### 3. Add CI/CD Pipeline

**Current State:** No automated checks on commits/PRs.

**Recommendation:**
- Add GitHub Actions workflow (`.github/workflows/ci.yml`)
- Run on pull requests and commits to main:
  - `pnpm check:types`
  - `pnpm lint`
  - `pnpm format --check`
  - `pnpm test` (once tests are added)
- Add automated publishing workflow on version tags
- Add status badges to README.md

**Benefit:** Catches issues early, ensures code quality, automates releases.

#### 4. Add Cost Limit Enforcement

**Current State:** Cost limits are tracked but not enforced during iteration.

**Recommendation:**
- Check cost limits BEFORE starting each iteration (not just after)
- Prompt user when approaching limit (e.g., 80% threshold)
- Add `--max-cost` CLI flag to override config
- Show cost projections based on previous iterations
- Add cost tracking to CI mode

**Benefit:** Prevents unexpected API bills, better cost control.

### Medium Priority

#### 5. Add Telemetry/Analytics (Optional, Opt-in)

**Recommendation:**
- Track anonymous usage metrics (opt-in only):
  - Number of iterations run
  - Average iteration duration
  - Success/failure rates
  - Common error types
- Help identify common pain points and usage patterns
- Use PostHog, Mixpanel, or simple event logging

**Benefit:** Data-driven product decisions, identify common issues.

#### 6. Improve Error Messages

**Current State:** Some error messages are generic.

**Recommendation:**
- Add error codes for programmatic handling
- Include actionable suggestions in error messages
- Add troubleshooting guide to documentation
- Link to docs from error messages when relevant

**Example:**
```typescript
// Instead of: "Failed to read PRD.md"
// Use: "Failed to read PRD.md at /path/to/.ralph/PRD.md
//      Error: ENOENT (file not found)
//      Tip: Run 'npx ralph init' to create the file"
```

#### 7. Add Progress Indicators for Long Operations

**Recommendation:**
- Show progress for git operations (clone, diff, commit)
- Add timeout indicators for Claude API calls
- Show "still working..." message for operations >5s
- Add estimated time remaining based on historical data

**Benefit:** Better UX, reduces perceived wait time, less uncertainty.

#### 8. Add Plugin Marketplace/Registry

**Recommendation:**
- Create a registry of community plugins
- Add `ralph plugin install <name>` command
- Document plugin API thoroughly
- Provide plugin templates/examples
- Add plugin versioning and compatibility checking

**Benefit:** Ecosystem growth, community contributions, extended functionality.

### Low Priority (Polish & Nice-to-haves)

#### 9. Add Interactive TUI Mode

**Recommendation:**
- Add `ralph watch` command for continuous mode
- Show live logs, costs, and progress in a dashboard
- Allow pausing/resuming iterations
- Navigate through iteration history
- View diffs inline

**Benefit:** Better visibility into long-running sessions, improved debugging.

#### 10. Add Iteration Templates

**Recommendation:**
- Allow custom iteration prompts beyond PRD.md
- Add templates for common tasks:
  - Bug fixes
  - Feature implementation
  - Refactoring
  - Documentation updates
- Store templates in `.ralph/templates/`

**Benefit:** Consistency, faster setup for common workflows.

#### 11. Add Web Dashboard (Optional)

**Recommendation:**
- Local web server showing session history
- Visualize costs, commits, and changes over time
- Export reports as HTML/PDF
- Share session results with team

**Benefit:** Better reporting, team collaboration, historical analysis.

#### 12. Support Multiple Claude Models

**Current State:** Uses default SDK model.

**Recommendation:**
- Add model selection in config
- Allow per-iteration model override
- Support model switching based on task complexity
- Track costs per model

**Configuration:**
```bash
# .ralph/config
MODEL=claude-sonnet-4-5
# or
MODEL_SIMPLE_TASKS=claude-haiku-4
MODEL_COMPLEX_TASKS=claude-sonnet-4-5
```

**Benefit:** Cost optimization, flexibility, better performance for simple tasks.

---

## Publishing Instructions

### Prerequisites

1. **GitHub Package Registry Access:**
   ```bash
   npm login --scope=@stafftraveler --registry=https://npm.pkg.github.com
   ```
   - You need a GitHub Personal Access Token with `write:packages` permission
   - Create at: https://github.com/settings/tokens
   - Required scopes: `write:packages`, `read:packages`, `delete:packages`

2. **Verify Repository Configuration:**
   ```bash
   # Check package.json has correct settings
   cat package.json | grep -A 5 "publishConfig"

   # Should show:
   # "publishConfig": {
   #   "registry": "https://npm.pkg.github.com"
   # }
   ```

3. **Ensure Clean Working Directory:**
   ```bash
   git status
   # Should show "nothing to commit, working tree clean"
   ```

### Publishing Steps

#### 1. Update Version Number

```bash
# For bug fixes and patches
npm version patch

# For new features (backward compatible)
npm version minor

# For breaking changes
npm version major

# Or manually edit package.json and create tag
git tag v1.0.1
```

#### 2. Run Quality Checks

```bash
# Type checking
pnpm check:types

# Linting
pnpm lint

# Format check
pnpm format --check

# If tests exist (add them!)
pnpm test
```

#### 3. Verify Package Contents

```bash
# See what files will be published
npm pack --dry-run

# Check for:
# - bin/ralph (entry point)
# - src/ (source files)
# - README.md (documentation)
# - LICENSE (legal)
# - tsconfig.json (TypeScript config)
```

#### 4. Publish to GitHub Package Registry

```bash
# Publish (will prompt for OTP if 2FA enabled)
pnpm publish --registry=https://npm.pkg.github.com

# Alternative: publish with access level specified
npm publish --access restricted
```

#### 5. Push Git Tags

```bash
# Push the version tag to GitHub
git push --tags

# Push commits
git push origin main
```

#### 6. Create GitHub Release (Optional)

```bash
# Using GitHub CLI
gh release create v1.0.1 --title "v1.0.1" --notes "Release notes here"

# Or manually at: https://github.com/stafftraveler/ralph-cli/releases/new
```

### Troubleshooting Publishing Issues

**Issue:** `npm ERR! 403 Forbidden`
- **Solution:** Check authentication with `npm whoami --registry=https://npm.pkg.github.com`
- Re-authenticate if needed

**Issue:** `npm ERR! You cannot publish over the previously published versions`
- **Solution:** Bump version number with `npm version patch/minor/major`

**Issue:** Package not appearing in registry
- **Solution:** Ensure `publishConfig.registry` is set correctly in package.json
- Check organization permissions on GitHub

---

## Integration in Other Repositories

### For Projects Using Ralph

#### 1. Initial Setup

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

#### 2. Configure for Your Project

**Edit `.ralph/PRD.md`:**
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
[ ] Update documentation
```

**Edit `.ralph/config` (optional):**
```bash
MAX_RETRIES=3
SOUND_ON_COMPLETE=true
SAVE_OUTPUT=true
OUTPUT_DIR=.ralph/logs
MAX_COST_PER_ITERATION=0.50
MAX_COST_PER_SESSION=5.00
WARN_COST_THRESHOLD=4.00
```

#### 3. Set Up API Key

```bash
# Option 1: Environment variable (recommended for CI)
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: Let Ralph prompt and save to keychain (interactive)
pnpm ralph init  # Will prompt if not set

# Option 3: Add to shell profile for persistence
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
```

#### 4. Add to Project Workflow

**Add to `package.json` scripts (done automatically by `ralph init`):**
```json
{
  "scripts": {
    "ralph": "npx ralph"
  }
}
```

**Create `.gitignore` entries:**
```bash
# Add to .gitignore
.ralph/session.json
.ralph/logs/
.ralph/progress.txt
```

**Commit Ralph configuration:**
```bash
git add .ralph/PRD.md .ralph/prompt.md .ralph/config
git commit -m "Add Ralph CLI configuration"
```

#### 5. Run Iterations

```bash
# Run 5 iterations
pnpm ralph 5

# Run with verbose output
pnpm ralph -- --verbose 3

# Run on a feature branch
pnpm ralph -- --branch feature/new-api 5

# Resume from checkpoint
pnpm ralph -- --resume 10
```

### For CI/CD Integration

**GitHub Actions Example:**

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
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
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

### For Team Use

#### Shared Configuration

**Create team templates in `.ralph/prd/`:**
```bash
.ralph/
├── prd/
│   ├── bug-fix.md
│   ├── new-feature.md
│   ├── refactor.md
│   └── documentation.md
├── PRD.md
├── prompt.md
└── config
```

#### Team Best Practices

1. **Version Control:** Commit `.ralph/PRD.md`, `.ralph/prompt.md`, and `.ralph/config`
2. **Ignore Generated Files:** Add `.ralph/session.json`, `.ralph/logs/`, `.ralph/progress.txt` to `.gitignore`
3. **Document Conventions:** Create a team guide for writing PRDs
4. **Cost Limits:** Set organization-wide cost limits in config
5. **Review Process:** Always review Ralph's changes before merging

---

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
3. **Use Resume:** Don't start from scratch; resume sessions
4. **Optimize Prompts:** Shorter, clearer prompts = lower costs
5. **Batch Work:** Combine related tasks in one PRD for better context

### Security Considerations

1. **API Keys:** Never commit API keys to version control
2. **Sensitive Data:** Don't include secrets in PRD.md
3. **Review Changes:** Always review commits before pushing
4. **Private Repos:** Keep projects with sensitive data private
5. **Access Control:** Limit who can publish the package

### Debugging Tips

1. **Use Debug Mode:** `pnpm ralph -- --debug 1`
2. **Save Logs:** Enable `SAVE_OUTPUT=true` in config
3. **Check Session State:** Review `.ralph/session.json`
4. **Incremental Testing:** Run one iteration at a time first
5. **Verbose Output:** Use `--verbose` to see Claude's full response

---

## Additional Resources

- **GitHub Repository:** https://github.com/stafftraveler/ralph-cli
- **Claude Agent SDK Docs:** https://docs.anthropic.com/en/docs/agent-sdk
- **Anthropic API Docs:** https://docs.anthropic.com/
- **GitHub Package Registry:** https://docs.github.com/en/packages

---

## Appendix: Maintenance Checklist

### Regular Maintenance Tasks

- [ ] Update dependencies monthly (`pnpm update`)
- [ ] Review and close stale issues
- [ ] Update documentation for new features
- [ ] Monitor cost usage patterns
- [ ] Collect user feedback
- [ ] Review and merge community PRs
- [ ] Publish security patches promptly
- [ ] Keep Claude Agent SDK up to date

### Before Each Release

- [ ] Update CHANGELOG.md
- [ ] Bump version in package.json
- [ ] Run all quality checks
- [ ] Test installation in fresh project
- [ ] Update README if needed
- [ ] Create GitHub release notes
- [ ] Announce in team channels

---

*Last Updated: 2026-01-30*
