# Publishing Instructions

This document contains instructions for publishing the Ralph CLI package to GitHub Package Registry.

## Prerequisites

### 1. GitHub Package Registry Access

```bash
npm login --scope=@stafftraveler --registry=https://npm.pkg.github.com
```

- You need a GitHub Personal Access Token with `write:packages` permission
- Create at: https://github.com/settings/tokens
- Required scopes: `write:packages`, `read:packages`, `delete:packages`

### 2. Verify Repository Configuration

```bash
# Check package.json has correct settings
cat package.json | grep -A 5 "publishConfig"

# Should show:
# "publishConfig": {
#   "registry": "https://npm.pkg.github.com"
# }
```

### 3. Ensure Clean Working Directory

```bash
git status
# Should show "nothing to commit, working tree clean"
```

## Publishing Steps

### 1. Update Version Number

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

### 2. Run Quality Checks

```bash
# Type checking
pnpm check:types

# Linting
pnpm lint

# Format check
pnpm format --check

# If tests exist
pnpm test
```

### 3. Verify Package Contents

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

### 4. Publish to GitHub Package Registry

```bash
# Publish (will prompt for OTP if 2FA enabled)
pnpm publish --registry=https://npm.pkg.github.com

# Alternative: publish with access level specified
npm publish --access restricted
```

### 5. Push Git Tags

```bash
# Push the version tag to GitHub
git push --tags

# Push commits
git push origin main
```

### 6. Create GitHub Release (Optional)

```bash
# Using GitHub CLI
gh release create v1.0.1 --title "v1.0.1" --notes "Release notes here"

# Or manually at: https://github.com/stafftraveler/ralph-cli/releases/new
```

## Automated Publishing

This repository has automated publishing configured via GitHub Actions. When you create a GitHub Release:

1. The `release.yml` workflow is triggered
2. It runs type checking and linting
3. If all checks pass, it publishes to GitHub Package Registry

To publish automatically:

```bash
# 1. Bump version and create tag
npm version patch  # or minor/major

# 2. Push tag to trigger CI
git push --tags

# 3. Create release on GitHub (triggers publishing)
gh release create v1.0.1 --generate-notes
```

## Troubleshooting

### `npm ERR! 403 Forbidden`

- **Solution:** Check authentication with `npm whoami --registry=https://npm.pkg.github.com`
- Re-authenticate if needed: `npm login --scope=@stafftraveler --registry=https://npm.pkg.github.com`

### `npm ERR! You cannot publish over the previously published versions`

- **Solution:** Bump version number with `npm version patch/minor/major`

### Package not appearing in registry

- **Solution:** Ensure `publishConfig.registry` is set correctly in package.json
- Check organization permissions on GitHub
- Verify the package name matches the repository owner

### Authentication Token Issues

- Ensure your PAT hasn't expired
- Verify the token has correct scopes (`write:packages`)
- Try deleting and recreating the token

## Version Guidelines

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (`1.0.0` → `2.0.0`): Breaking changes to CLI interface or configuration
- **MINOR** (`1.0.0` → `1.1.0`): New features, backward compatible
- **PATCH** (`1.0.0` → `1.0.1`): Bug fixes, documentation updates

## Pre-Release Checklist

- [ ] Update CHANGELOG.md (if maintained)
- [ ] Bump version in package.json
- [ ] Run all quality checks (`pnpm check:types && pnpm lint`)
- [ ] Test installation in a fresh project
- [ ] Update README if needed
- [ ] Create GitHub release notes
