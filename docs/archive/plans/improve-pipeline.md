# Plan: Improve C4 Pipeline via AI-Verified Rules

## TL;DR

Use AI reasoning to identify gaps between deterministic C4 output and what a human would create, then systematically encode those improvements into the pipeline. The integration test infrastructure provides the tight feedback loop: AI proposes → Human verifies → DevAC generates → Test validates.

## Context

The current pipeline successfully extracts low-level code effects and transforms them via pattern-matching rules into domain effects. However, comparing the deterministic output to what AI reasoning would produce reveals gaps:

| Capability | Deterministic Pipeline | AI Reasoning |
|------------|------------------------|--------------|
| SDK patterns | Explicit rules only | Recognizes AWS SDK v3, Firebase, GraphQL |
| Semantic grouping | Individual effects | "These 6 endpoints form the Messages API" |
| Business context | Technical patterns | "Push notifications go through Firebase" |
| Cross-service | Single package | "Miami is called by 5 other services" |

## Goal

Progressively improve the deterministic pipeline until its output approaches AI-quality, by:
1. Using AI to discover missing patterns
2. Human-verifying the patterns are correct
3. Encoding them as rules (core, repo-specific, or package-specific)
4. Validating via integration tests

## Steps

### 1. Set up miami as reference package

Enable the miami reference package tests in `c4-integration.test.ts`. This requires:
- Seed files generated for miami (run `devac analyze` on monorepo-3.0/services/miami)
- Environment variable `DEVAC_REFERENCE_ROOT` pointing to workspace containing monorepo-3.0

```bash
DEVAC_GENERATE_REFS=1 DEVAC_REFERENCE_ROOT=~/ws pnpm test c4-integration