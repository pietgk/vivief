# Multi-Level Architecture Coordination

> **Purpose:** Define how package, repo, and workspace architecture documentation coordinate and propagate changes.
> **Created:** 2026-01-07
> **Related:** improve-pipeline.md, gap-metrics.md

## Overview

Architecture documentation exists at three levels:

```
┌─────────────────────────────────────────────────────────────────┐
│                     WORKSPACE LEVEL                              │
│  docs/c4/workspace-architecture.md                              │
│  - Cross-repo relationships                                      │
│  - System landscape view                                         │
│  - External integrations                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │ aggregates
┌────────────────────────────┴────────────────────────────────────┐
│                      REPO LEVEL                                  │
│  docs/c4/repo-architecture.md (per repo)                        │
│  - Package relationships within repo                             │
│  - Shared infrastructure                                         │
│  - Build/deploy boundaries                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ aggregates
┌────────────────────────────┴────────────────────────────────────┐
│                     PACKAGE LEVEL                                │
│  <pkg>/docs/c4/architecture.md (per package)                    │
│  - Internal components                                           │
│  - Module structure                                              │
│  - External dependencies                                         │
└─────────────────────────────────────────────────────────────────┘
```

## File Hierarchy

### Package Level (Detailed)

```
packages/devac-core/docs/c4/
├── architecture.md           # Human-validated goal
├── architecture.reasoning.md # Audit trail
├── architecture.c4           # Generated LikeC4
└── likec4.config.json        # Package-specific config
```

**Content focus:**
- Internal module structure (containers = layers/domains)
- Component-level detail
- External dependencies (npm packages, APIs)
- Performance characteristics

### Repo Level (Overview)

```
docs/c4/
├── repo-architecture.md      # Human-validated goal
├── repo-architecture.c4      # Generated LikeC4
└── likec4.config.json        # Repo-wide config
```

**Content focus:**
- Package relationships (devac-cli → devac-core)
- Shared infrastructure (CI/CD, monorepo tooling)
- Build/deploy boundaries
- Each package as a "container" (collapsed view)

### Workspace Level (Landscape)

```
~/ws/docs/c4/
├── workspace-architecture.md # Human-validated goal
├── workspace-architecture.c4 # Generated LikeC4
└── likec4.config.json        # Workspace config
```

**Content focus:**
- All repos as systems
- Cross-repo dependencies
- External integrations (cloud services, third parties)
- Organization-wide patterns

## Propagation Rules

### Bottom-Up Propagation

When package architecture changes:

```
Package change → Repo re-aggregation → Workspace re-aggregation

Example:
1. devac-core adds new "Effects" container
2. Repo architecture.c4 updates devac-core's representation
3. Workspace architecture.c4 updates vivief repo's representation
```

**Triggers:**
- `devac analyze --package <path>` updates package seeds
- `devac c4 --package <path>` regenerates package .c4
- Repo-level aggregation runs automatically or on-demand
- Workspace-level aggregation runs on-demand

### Top-Down Constraints

Higher levels can constrain lower levels:

```
Workspace constraints → Repo constraints → Package implementation

Example:
1. Workspace defines: "All repos must expose health check endpoint"
2. Repo architecture includes: "Health container required per package"
3. Package architecture includes: Health-related components
```

**Implementation:**
- `docs/c4/constraints.yaml` at each level
- `devac validate --architecture` checks constraints

## Aggregation Strategies

### Package → Repo Aggregation

Each package becomes a "container" in repo view:

```yaml
# Repo aggregation config
aggregation:
  strategy: "package-as-container"

  # Show inter-package relationships
  relationships:
    - from: "@pietgk/devac-cli"
      to: "@pietgk/devac-core"
      label: "depends on"
    - from: "@pietgk/devac-mcp"
      to: "@pietgk/devac-core"
      label: "depends on"

  # Collapse internal details
  collapse:
    - pattern: "**/internal/**"
    - pattern: "**/utils/**"
```

### Repo → Workspace Aggregation

Each repo becomes a "system" in workspace view:

```yaml
# Workspace aggregation config
aggregation:
  strategy: "repo-as-system"

  # Group related repos
  groups:
    - name: "DevAC Platform"
      repos: ["vivief", "devac-plugins"]
    - name: "ViviefCorp Platform"
      repos: ["monorepo-3.0", "app", "frontend-monorepo"]

  # Show cross-repo relationships
  relationships:
    - from: "vivief"
      to: "monorepo-3.0"
      label: "analyzes code from"
```

## Change Detection

### Package-Level Changes

Detected via seed hash comparison:

```typescript
// In devac c4 command
const currentHash = await computeSeedHash(packagePath);
const lastHash = await readLastGeneratedHash(packagePath);

if (currentHash !== lastHash) {
  // Regenerate package architecture.c4
  // Mark repo architecture as potentially stale
}
```

### Repo-Level Staleness

Repo architecture is stale when:
1. Any package seed hash changed
2. Package was added/removed
3. Inter-package dependencies changed

```typescript
// Check repo staleness
async function isRepoArchitectureStale(repoPath: string): Promise<boolean> {
  const packages = await discoverPackages(repoPath);

  for (const pkg of packages) {
    const pkgHash = await computeSeedHash(pkg.path);
    const lastPkgHash = await readRepoPackageHash(repoPath, pkg.name);

    if (pkgHash !== lastPkgHash) return true;
  }

  return false;
}
```

### Workspace-Level Staleness

Workspace architecture is stale when:
1. Any repo architecture changed
2. Repo was added/removed from workspace
3. Cross-repo relationships changed

## Commands

### Generate Package Architecture

```bash
# Generate for single package
devac c4 --package packages/devac-core

# Output: packages/devac-core/docs/c4/architecture.c4
```

### Generate Repo Architecture

```bash
# Generate for repo (aggregates packages)
devac c4 --repo

# Output: docs/c4/repo-architecture.c4
```

### Generate Workspace Architecture

```bash
# Generate for workspace (aggregates repos)
devac c4 --workspace

# Output: ~/ws/docs/c4/workspace-architecture.c4
```

### Check Staleness

```bash
# Check if architecture docs need regeneration
devac architecture status

# Output:
# packages/devac-core: STALE (seed hash changed)
# packages/devac-cli: OK
# repo: STALE (1 package changed)
# workspace: OK
```

### Validate Constraints

```bash
# Validate architecture meets constraints
devac validate --architecture

# Output:
# ✓ All packages have architecture.md
# ✓ Repo architecture aggregates all packages
# ✗ devac-eval missing required "Testing" container (constraint: repo-constraints.yaml:12)
```

## Update Workflow

### Automatic Updates

When running `devac analyze`:

```
1. Analyze package → update seeds
2. Check if architecture.c4 needs regeneration
3. If yes, regenerate package .c4
4. Mark repo architecture as stale
```

### Manual Updates (Human-Validated)

For architecture.md updates:

```
1. Developer requests: "update architecture.md for devac-core"
2. LLM analyzes current code graph
3. Generates updated architecture.md
4. Developer reviews and validates
5. Changes committed
6. architecture.c4 compared against new .md
7. Gap metrics recalculated
```

### CI Integration

```yaml
# In CI pipeline
- name: Check Architecture
  run: |
    devac architecture status
    devac validate --architecture

    # Fail if architecture is stale and not updated in PR
    if devac architecture status | grep -q "STALE"; then
      echo "::warning::Architecture documentation is stale"
    fi
```

## Constraints System

### Constraint Definition

```yaml
# docs/c4/constraints.yaml
constraints:
  # All packages must have certain containers
  - id: "required-containers"
    level: "package"
    rule: "must-have-container"
    containers: ["Core", "Types"]
    message: "Package must have Core and Types containers"

  # Repo must aggregate all packages
  - id: "complete-aggregation"
    level: "repo"
    rule: "all-packages-included"
    message: "Repo architecture must include all packages"

  # No direct cross-repo calls (must go through API)
  - id: "cross-repo-boundary"
    level: "workspace"
    rule: "no-direct-import"
    from: "vivief"
    to: "monorepo-3.0"
    message: "Cross-repo communication must use API"
```

### Constraint Validation

```typescript
async function validateConstraints(
  level: "package" | "repo" | "workspace",
  path: string
): Promise<ValidationResult[]> {
  const constraints = await loadConstraints(path, level);
  const architecture = await loadArchitecture(path, level);

  return constraints.map(constraint => ({
    constraint,
    passed: evaluateConstraint(constraint, architecture),
  }));
}
```

## Summary

| Level | Scope | Updates | Aggregates |
|-------|-------|---------|------------|
| Package | Single package | On analyze/c4 | N/A |
| Repo | All packages in repo | On package change | Packages → Containers |
| Workspace | All repos | On repo change | Repos → Systems |

---

*Multi-level coordination ensures architecture documentation stays consistent across all scopes.*
