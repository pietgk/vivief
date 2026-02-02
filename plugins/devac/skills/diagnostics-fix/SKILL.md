# Diagnostics Fix Skill

Guide Claude through efficiently fixing validation errors detected by DevAC.

## Triggers

This skill activates when users ask:
- "fix the errors"
- "resolve these issues"
- "help me fix"
- "fix diagnostics"
- "fix the warnings"
- When user responds to diagnostic injection with intent to fix

## Capabilities

### Error Analysis
Understand what's broken and why by querying diagnostic details.

### Fix Sequencing
Determine optimal fix order based on error types and dependencies.

### Batch Fixes
Group related errors for efficient resolution.

### Verification
Confirm fixes resolved the issues before moving on.

## Workflow: Fix Until Clean

### Step 1: Get Error Details

Use CLI for lower context overhead:
```bash
devac status --diagnostics --json
```

Or via MCP tool:
```
status_all_diagnostics(level: "details", severity: ["error"])
```

### Step 2: Analyze and Group

Group errors by:
1. **File** - Fix all errors in one file together
2. **Type** - Similar errors (e.g., all "missing import" errors)
3. **Dependency** - Fix root cause before dependent errors

### Step 3: Fix in Priority Order

1. **TypeScript errors** - Blocks compilation
2. **ESLint errors** - Blocks commit
3. **Test failures** - Blocks PR
4. **Warnings** - Optional cleanup

### Step 4: Verify After Each Batch

After fixing a batch, run quick validation:
```bash
devac validate --mode quick
```

Or wait for the Stop hook to validate automatically after your edits.

### Step 5: Iterate Until Clean

Repeat steps 1-4 until `devac status --diagnostics` shows no errors.

## Common Fix Patterns

### Missing Import
- **Error:** "Cannot find name 'X'"
- **Fix:** Add import statement for X
- **Check:** Is X exported from the target module?

### Type Mismatch
- **Error:** "Type 'A' is not assignable to type 'B'"
- **Fix:** Check if A needs conversion, or if function signature is wrong
- **Check:** Review the expected type definition

### Unused Variable
- **Error:** "X is declared but never used"
- **Fix:** Remove declaration or prefix with underscore if intentional
- **Check:** Was this variable meant to be used somewhere?

### Property Does Not Exist
- **Error:** "Property 'X' does not exist on type 'Y'"
- **Fix:** Add property to type definition, or fix the property name
- **Check:** Is this a typo? Check the type definition.

### Import Not Found
- **Error:** "Module 'X' has no exported member 'Y'"
- **Fix:** Check the export statement in module X
- **Check:** Was the export renamed or removed?

## Integration with Hooks

### When Stop Hook Reports Issues

The Stop hook runs after code changes and may report validation issues:
```
Validation found issues:
- 2 TypeScript errors in src/foo.ts
- 1 ESLint warning in src/bar.ts
```

When this happens:
1. Read the injected `<system-reminder>` for file locations
2. Don't ask user - proactively offer to fix
3. Use this workflow to resolve efficiently

### When UserPromptSubmit Hook Shows Errors

At the start of conversations, you may see:
```
DevAC Status: 5 errors, 12 warnings
Use status_all_diagnostics MCP tool to see details.
```

When this happens:
1. Acknowledge the diagnostic state to the user
2. Offer to investigate and fix if relevant to the current task
3. Use `status_all_diagnostics` to get full details

## Example Interaction

**User:** "Fix the errors"

**Response approach:**
1. Query diagnostics: `devac status --diagnostics --json`
2. Group errors by file and type
3. Start with TypeScript errors (compilation blockers)
4. Fix each file, explain what changed
5. Run validation to confirm fixes
6. Move to next batch until clean

**User:** "There are TypeScript errors in the auth module"

**Response approach:**
1. Query: `devac status --diagnostics --file src/auth/`
2. Read the affected files
3. Fix errors in dependency order
4. Verify with `devac validate --mode quick`

## Notes

- Focus on errors first, warnings second
- If a fix causes new errors, investigate before continuing
- For complex errors, explain the issue to user before fixing
- Don't guess at fixes - read the code and understand the problem
- The Stop hook will automatically validate after your edits
