# ADR-0044: Workspace Repository Pattern

## Status

Accepted

## Context

Multi-repo workspaces are common in enterprise environments where teams work across several interconnected repositories. While DevAC's auto-discovery (ADR-0016) handles most single-developer scenarios, teams face additional challenges:

1. **Configuration sharing** - New team members need to set up the same workspace consistently
2. **Documentation aggregation** - Per-repo `AGENTS.md` files need to be visible at workspace level for AI assistants
3. **Version control** - Workspace configuration changes should be tracked and reviewable
4. **Onboarding** - Setting up a multi-repo workspace should be a single command

The auto-discovery approach (scanning for `.git` directories) works well for detecting existing repos, but doesn't provide:
- A way to specify which repos should be cloned
- A mechanism for sharing workspace configuration
- A method for aggregating per-repo AI guidance

## Decision

Introduce the **Workspace Repository Pattern** - a dedicated git repository that manages workspace configuration and documentation.

### Core Concepts

1. **Workspace Repository**: A git repo named `<name>-workspace` that contains:
   - `workspace.yaml` - Registry of repositories in the workspace
   - `CLAUDE.md` - Auto-generated + manual AI guidance
   - `.gitignore` - Excludes local state

2. **AGENTS.md to CLAUDE.md Flow**: Per-repo `AGENTS.md` files are aggregated into the workspace `CLAUDE.md`:
   ```
   api/AGENTS.md     ─┐
   web/AGENTS.md     ─┼─► acme-workspace/CLAUDE.md
   shared/AGENTS.md  ─┘
   ```

3. **Symlink Strategy**: A symlink from parent directory to workspace `CLAUDE.md`:
   ```
   ~/ws/CLAUDE.md → ~/ws/acme-workspace/CLAUDE.md
   ```

4. **Section Markers**: Auto-generated content is wrapped in markers:
   ```markdown
   <!-- BEGIN AUTO-GENERATED - DO NOT EDIT -->
   [aggregated content]
   <!-- END AUTO-GENERATED -->
   ```

### New Commands

| Command | Purpose |
|---------|---------|
| `devac workspace repo init` | Create workspace repository |
| `devac workspace repo sync` | Update CLAUDE.md from AGENTS.md files |
| `devac workspace repo install` | Clone repos and set up workspace |
| `devac workspace repo status` | Show workspace repository status |

### File Format: workspace.yaml

```yaml
version: "1.0"
name: acme-workspace

repositories:
  - name: api
    url: git@github.com:acme/api.git
    path: ../api

  - name: web
    url: git@github.com:acme/web.git
    path: ../web
```

## Consequences

### Positive

- **Team consistency**: All team members get identical workspace setup
- **Single onboarding command**: `devac workspace repo install` handles everything
- **Version-controlled config**: Changes to workspace config are reviewable
- **AI assistant visibility**: Aggregated documentation visible at workspace root
- **Non-invasive**: Works alongside existing per-repo workflows

### Negative

- **Additional repository**: Teams must maintain a workspace repository
- **Sync discipline**: Must run `sync` after changing `AGENTS.md` files
- **Learning curve**: New concept for users to understand

### Neutral

- **Optional pattern**: Teams can continue using auto-discovery without workspace repos
- **Symlink dependency**: Relies on filesystem symlinks (works on macOS/Linux)
- **Naming convention**: `<name>-workspace` is a convention, not enforced

## Alternatives Considered

### 1. Configuration in Parent Directory

Store `workspace.yaml` directly in the parent directory (e.g., `~/ws/workspace.yaml`).

**Rejected because:**
- Parent directory often isn't a git repo
- Mixes configuration with working directories
- Harder to version control

### 2. Central Configuration Service

Use a cloud service to store and sync workspace configuration.

**Rejected because:**
- Adds external dependency
- More complex than file-based approach
- Not needed for file-based workflows

### 3. Git Submodules

Use git submodules to include all repos in the workspace repository.

**Rejected because:**
- Submodules have poor UX
- Complicates per-repo workflows
- Heavyweight for documentation sync

## Implementation

**Files:** `packages/devac-core/src/workspace/repo/`

| File | Purpose |
|------|---------|
| `init.ts` | Create workspace repository structure |
| `sync.ts` | Aggregate AGENTS.md into CLAUDE.md |
| `install.ts` | Clone repos and create symlinks |
| `status.ts` | Show workspace repository status |
| `types.ts` | WorkspaceYaml, WorkspaceRepo types |

**CLI Commands:** `packages/devac-cli/src/commands/workspace-repo.ts`

## References

- [ADR-0016: Workspace Module](0016-workspace-module.md) - Original workspace architecture
- [Workspace Repository Guide](../workspace-repo.md) - User documentation
- [ADR-0007: Federation Central Hub](0007-federation-central-hub.md) - Hub architecture
