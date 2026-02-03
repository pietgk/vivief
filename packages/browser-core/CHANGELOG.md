# @pietgk/browser-core

## 0.3.0

### Minor Changes

- 9656502: feat(a11y): add Accessibility Intelligence Layer

  ### Browser Core

  - Add `AxeScanner` class for runtime accessibility scanning with Axe-core
  - Add play function utilities for extracting and analyzing Storybook interactions
  - Export new accessibility module

  ### DevAC Core

  - Add `StoryExtractor` for parsing Storybook CSF files and extracting story metadata
  - Add `pushAxeDiagnosticsToHub()` for pushing Axe scan results to unified diagnostics
  - Enhance WCAG validator with keyboard handler detection
  - Add `story` node kind to the code graph schema

  ### DevAC MCP

  - Add "axe" source to diagnostics tool enums for filtering accessibility scan results

## 0.2.0

### Minor Changes

- 66396cd: Add browser automation packages for AI-assisted web interaction

  - **browser-core**: Playwright wrapper with element ref system, session management, and page reading
  - **browser-cli**: Command-line interface for browser automation
  - **browser-mcp**: MCP server exposing browser tools to AI assistants
