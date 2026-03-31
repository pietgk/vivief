# Release Process

This document explains how DevAC packages are versioned and released.

## Overview

DevAC uses a **hybrid installation model**:

- **Development**: Use `pnpm link --global` for local testing
- **Production**: Packages are published to GitHub Packages

## Versioning Strategy

### Fixed Versioning

All DevAC packages share the same major.minor version:

- `@pietgk/devac-core`
- `@pietgk/devac-cli`
- `@pietgk/devac-mcp`
- `@pietgk/devac-worktree`
- `@pietgk/devac-eval`

When any package has a changeset, all packages receive the same version bump.

### Changesets

We use [Changesets](https://github.com/changesets/changesets) for version management:

```bash
# Create a changeset for your changes
pnpm changeset
```

Follow the prompts to describe your changes. The changeset will be committed with your PR.

## Release Flow

### Automated CI/CD

1. **PR merged to main** → CI runs build and tests
2. **Changesets detected** → CI creates a "Version Packages" PR
3. **Version PR merged** → CI publishes to GitHub Packages

### Manual Steps

As a contributor, you only need to:

1. Create changesets for your changes
2. Merge your PR to main
3. Review and merge the auto-generated "Version Packages" PR

## Installing Released Packages

### Configure npm/pnpm for GitHub Packages

Create or update `~/.npmrc`:

```
@pietgk:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Replace `YOUR_GITHUB_TOKEN` with a personal access token that has `read:packages` scope.

### Install Globally

```bash
pnpm add -g @pietgk/devac-cli @pietgk/devac-mcp @pietgk/devac-eval
```

### Verify Installation

```bash
devac --version
devac-mcp --version
devac-eval --version
```

## Local Development Setup

For development, use pnpm link instead of installing from the registry:

```bash
cd vivief

# Build all packages
pnpm build

# Link CLI packages globally
(cd packages/devac-cli && pnpm link --global)
(cd packages/devac-mcp && pnpm link --global)
(cd packages/devac-eval && pnpm link --global)

# Or use the workflow command (builds + links + verifies)
devac workflow install-local
```

This creates symlinks to your local workspace, so changes are immediately available.

### Rebuilding After Changes

After making changes, rebuild and the linked commands will use the new code:

```bash
pnpm build
# Or for a specific package:
pnpm --filter @pietgk/devac-cli build
```

## Troubleshooting

### "command not found" after pnpm link

Ensure pnpm's global bin directory is in your PATH:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$HOME/Library/pnpm:$PATH"
```

### Version mismatch

If you see version mismatches after release:

1. Check that all package.json versions are synced
2. Run `pnpm install` to update lockfile
3. Create a changeset to sync versions

### GitHub Packages authentication issues

1. Verify your token has `read:packages` scope
2. Check `~/.npmrc` is correctly configured
3. Try `npm login --registry=https://npm.pkg.github.com`
