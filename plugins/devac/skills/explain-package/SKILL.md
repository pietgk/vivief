# Explain Package Skill

Generate human-readable package documentation by analyzing code structure and extracting key information.

## Triggers

This skill activates when users ask about:
- "explain this package"
- "document this package"
- "what does this package do"
- "create package documentation"
- "generate package overview"

## Capabilities

### Package Overview Generation
Creates a comprehensive `docs/package-explained.md` file with:
- Package purpose and responsibilities
- Key components (classes, services, controllers)
- Dependencies (internal and external)
- Integration points

### Code Context Analysis
Uses DevAC's code graph to understand:
- Symbol relationships and hierarchies
- Import/export patterns
- Effect patterns (database, API, external services)

## Workflow

### Step 1: Gather Package Context
```bash
# Get package symbols
devac file-symbols <package-path>/src/

# Get package effects (Store, Retrieve, Send operations)
devac effects list -p <package-path>

# Get external dependencies
devac query "SELECT DISTINCT target FROM edges WHERE source_file LIKE '<package>%' AND edge_type = 'IMPORTS'"
```

### Step 2: Analyze Effects
```bash
# Get database operations
devac query "SELECT * FROM effects WHERE type IN ('Store', 'Retrieve') AND file_path LIKE '<package>%'"

# Get external service calls
devac query "SELECT * FROM effects WHERE type = 'Send' AND file_path LIKE '<package>%'"
```

### Step 3: Generate Documentation
Create `docs/package-explained.md` with the following structure:

```markdown
# {Package Name}

## Purpose
{One paragraph describing what the package does}

## Responsibilities
- {Responsibility 1}
- {Responsibility 2}
- {Responsibility 3}

## Key Components
- **{ComponentName}** - {Description}
- **{ServiceName}** - {Description}

## Dependencies

### Internal
- **{Package}** - {What it's used for}

### External (Third-Party)
- **{Service}** - {What it's used for}

## Data Stores
- **{Database/Cache}** - {What data is stored}

## API Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| GET | /path | Description |
```

## CLI Commands (Primary)

### `devac effects list`
List all effects in a package to understand its behaviors.
```bash
devac effects list -p packages/user-service
```

### `devac file-symbols`
Get all symbols to understand the code structure.
```bash
devac file-symbols packages/user-service/src/
```

### `devac query`
Query the code graph for specific patterns.
```bash
devac query "SELECT DISTINCT callee FROM effects WHERE file_path LIKE 'packages/user-service%'"
```

## Example Interaction

**User:** "Explain the user-service package"

**Response approach:**
1. Use `devac file-symbols` to get all symbols in the package
2. Use `devac effects list` to understand data flows and external calls
3. Query for dependencies and relationships
4. Generate a structured `docs/package-explained.md` file
5. Present a summary to the user

## Output

The skill creates or updates `docs/package-explained.md` in the package directory.

## Notes

- Requires DevAC analysis to be run on the package first (`devac sync`)
- Best used after `devac effects init` has discovered effect patterns
- The generated documentation should be reviewed and refined by developers
- Works well in conjunction with `/define-effects` skill
