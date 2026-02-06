# A11y Reference Story Validation Queries

This document contains SQL queries for validating accessibility testing coverage
using the a11y reference stories.

## Prerequisites

Run `devac sync` on the a11y-reference-storybook package to index the stories:

```bash
cd packages/a11y-reference-storybook
devac sync
```

## Queries

### 1. List All Reference Stories

Lists all stories that have `a11yReference` metadata.

```sql
SELECT
  name,
  qualified_name as story_id,
  file_path,
  json_extract_string(properties, '$.a11yReference.ruleId') as rule_id,
  json_extract_string(properties, '$.a11yReference.shouldViolate') as should_violate,
  json_extract_string(properties, '$.a11yReference.wcag') as wcag,
  json_extract_string(properties, '$.a11yReference.impact') as impact,
  json_extract_string(properties, '$.a11yReference.description') as description
FROM nodes
WHERE kind = 'story'
  AND json_extract_string(properties, '$.a11yReference.isReferenceStory') = 'true'
ORDER BY rule_id, should_violate DESC
```

### 2. Coverage Summary by Rule

Shows how many violation and pass stories exist for each rule.

```sql
SELECT
  json_extract_string(properties, '$.a11yReference.ruleId') as rule_id,
  COUNT(*) FILTER (WHERE json_extract_string(properties, '$.a11yReference.shouldViolate') = 'true')::INT as violation_stories,
  COUNT(*) FILTER (WHERE json_extract_string(properties, '$.a11yReference.shouldViolate') = 'false')::INT as pass_stories,
  COUNT(*)::INT as total_stories
FROM nodes
WHERE kind = 'story'
  AND json_extract_string(properties, '$.a11yReference.isReferenceStory') = 'true'
GROUP BY rule_id
ORDER BY rule_id
```

### 3. Stories by WCAG Criterion

Groups stories by WCAG success criterion.

```sql
SELECT
  json_extract_string(properties, '$.a11yReference.wcag') as wcag_criteria,
  json_extract_string(properties, '$.a11yReference.ruleId') as rule_id,
  COUNT(*)::INT as story_count
FROM nodes
WHERE kind = 'story'
  AND json_extract_string(properties, '$.a11yReference.isReferenceStory') = 'true'
GROUP BY wcag_criteria, rule_id
ORDER BY wcag_criteria, rule_id
```

### 4. Stories by Impact Level

Groups stories by impact severity.

```sql
SELECT
  json_extract_string(properties, '$.a11yReference.impact') as impact,
  COUNT(*)::INT as story_count,
  array_agg(DISTINCT json_extract_string(properties, '$.a11yReference.ruleId')) as rules
FROM nodes
WHERE kind = 'story'
  AND json_extract_string(properties, '$.a11yReference.isReferenceStory') = 'true'
GROUP BY impact
ORDER BY
  CASE impact
    WHEN 'critical' THEN 1
    WHEN 'serious' THEN 2
    WHEN 'moderate' THEN 3
    WHEN 'minor' THEN 4
  END
```

### 5. Violation Stories Only

Lists only stories that are expected to trigger violations.

```sql
SELECT
  name,
  qualified_name as story_id,
  json_extract_string(properties, '$.a11yReference.ruleId') as rule_id,
  json_extract_string(properties, '$.a11yReference.description') as description,
  json_extract_string(properties, '$.a11yReference.impact') as impact
FROM nodes
WHERE kind = 'story'
  AND json_extract_string(properties, '$.a11yReference.isReferenceStory') = 'true'
  AND json_extract_string(properties, '$.a11yReference.shouldViolate') = 'true'
ORDER BY impact, rule_id
```

## Validation with Axe Results

After running axe-core accessibility tests on the stories, you can validate coverage
by comparing expected violations with actual results.

### Using MCP Tools

Since `unified_diagnostics` is not SQL-queryable, use the MCP tools:

```typescript
// Get all axe diagnostics
const axeDiagnostics = await mcpClient.call('status_all_diagnostics', {
  source: ['axe'],
  level: 'details'
});

// Compare with reference stories
// - For shouldViolate=true stories: Expect axe to report violations
// - For shouldViolate=false stories: Expect no violations
```

### Coverage Report Structure

The validation report should include:

1. **Total Coverage**: What percentage of axe-core rules have reference stories?
2. **Detection Rate**: For violation stories, what percentage actually trigger violations?
3. **False Positives**: For pass stories, are there any unexpected violations?
4. **Gaps**: Which axe-core rules have no reference stories?

### Example Validation Logic

```typescript
interface ValidationResult {
  ruleId: string;
  storyId: string;
  expected: 'violation' | 'pass';
  actual: 'violation' | 'pass';
  status: 'PASS' | 'FAIL';
}

function validateStory(
  story: RefStory,
  axeResults: AxeResult[]
): ValidationResult {
  const hasViolation = axeResults.some(r => r.ruleId === story.ruleId);
  const expected = story.shouldViolate ? 'violation' : 'pass';
  const actual = hasViolation ? 'violation' : 'pass';

  return {
    ruleId: story.ruleId,
    storyId: story.storyId,
    expected,
    actual,
    status: expected === actual ? 'PASS' : 'FAIL'
  };
}
```

## CLI Usage

Run these queries using the DevAC CLI:

```bash
# List all reference stories
devac query sql "SELECT name, json_extract_string(properties, '\$.a11yReference.ruleId') as rule_id FROM nodes WHERE kind='story' AND json_extract_string(properties, '\$.a11yReference.isReferenceStory')='true'"

# Get coverage summary
devac query sql "SELECT json_extract_string(properties, '\$.a11yReference.ruleId') as rule_id, COUNT(*)::INT as count FROM nodes WHERE kind='story' AND json_extract_string(properties, '\$.a11yReference.isReferenceStory')='true' GROUP BY rule_id"
```
