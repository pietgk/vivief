---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
---

Add grouping and significance rules for improved C4 architecture generation

- Add `GroupingRule` interface and built-in layer rules (Analysis, Storage, Federation, API, Rules, Views)
- Add `SignificanceRule` interface for classifying architectural importance (critical, important, minor, hidden)
- Integrate rule-based grouping and significance filtering into C4 generator
- Enhance `devac architecture score` command with:
  - Gap metrics with target comparisons (Container F1, Signal-to-Noise, Relationship F1, External F1)
  - `--with-rules` flag for rule-based analysis
  - `--show-targets` flag for displaying target thresholds
  - Improvement suggestions based on gap analysis
- Add C4 quality rules documentation for validate-architecture skill
