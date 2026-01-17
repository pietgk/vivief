# Plan: Browser Automation Core (`@vivief/browser`)

> **Issue:** [#185](https://github.com/grop/vivief/issues/185)
> **Status:** IN_PROGRESS
> **Created:** 2026-01-15
> **Worktree:** ~/ws/vivief-185-browser-automation-core/

## From Issue

### Summary
Introduce browser automation capability to the Vivief ecosystem following the established `core -> mcp -> cli` architecture pattern. This enables programmatic interaction with web pages, network monitoring, JavaScript execution, and structured data extraction via Playwright.

### Key Requirements
- **Parity with Claude in Chrome** - All observation and interaction capabilities
- **Dual interface consistency** - Same capabilities via MCP and CLI
- **Clean API** - Core library pleasant to use directly
- **Reliable element references** - Ref system works consistently for AI agents
- **Observable** - Network and console monitoring
- **Accessible** - First-class accessibility auditing with axe-core
- **Integrated** - Works with existing devac DuckDB/Parquet infrastructure
- **Safe** - Resource limits protect against runaway usage

### Design Decisions (Already Made)
1. **Browser Launch Strategy:** Default launch-per-session, optional persistent mode
2. **Screenshot Storage:** Save to file with consistent naming, return file paths
3. **Authentication Helpers:** Yes, provide common auth pattern helpers
4. **Resource Limits:** Yes, implement safeguards with configurable limits

### Open Question
- **Element Reference Scope:** Should refs be stable across page navigations?
  - Current thinking: Refs valid until navigation, then require re-reading

### Package Structure
```
packages/
├── browser-core/           # @vivief/browser-core - Core Playwright wrapper
├── browser-mcp/            # @vivief/browser-mcp - MCP server exposing tools
└── browser-cli/            # @vivief/browser-cli - CLI commands
```

## Implementation Phases (from issue)

### Phase 1: Core Foundation (MVP)
- BrowserSession with page lifecycle management
- PageContext with navigation, basic interactions
- PageReader with accessibility tree extraction
- Screenshot capture (saves to file)
- Basic evaluate() for JavaScript execution
- Element reference system (ref_1, ref_2, etc.)
- Resource limits implementation

### Phase 2: Observability
- NetworkMonitor with request capture and filtering
- ConsoleCapture with message filtering
- Request/response body capture (optional)
- Timing information

### Phase 3: Dual Interface (MCP + CLI)
- @vivief/browser-mcp package with all tools
- @vivief/browser-cli package with all commands
- Session management across tool/command calls
- Consistent error handling

### Phase 4: Accessibility Auditing
- AccessibilityAuditor with axe-core integration
- WCAG level checking (A, AA, AAA)
- MCP tools and CLI commands for audit

### Phase 5: Authentication Helpers
- Cookie injection
- Basic auth / Bearer token
- OAuth popup handling
- Auth state save/restore

### Phase 6: Database Integration
- Browser data as Parquet seeds
- DuckDB queries across sessions
- Historical accessibility trending

### Phase 7: Advanced Features
- Request interception and mocking
- Multi-browser support (Firefox, WebKit)
- Video recording
- Trace export

## Implementation Plan

### Task 1: Project Scaffolding
- [ ] Create packages/browser-core directory structure
- [ ] Set up package.json with dependencies (playwright, etc.)
- [ ] Set up tsconfig.json following monorepo patterns
- [ ] Add to turbo.json build pipeline
- [ ] Create initial type definitions

### Task 2: BrowserSession Implementation
- [ ] Implement BrowserSession class with lifecycle management
- [ ] Support headless/headed modes
- [ ] Support browser selection (chromium/firefox/webkit)
- [ ] Implement resource limits
- [ ] Implement persistent vs launch-per-session modes
- [ ] Write tests

### Task 3: PageContext Implementation
- [ ] Implement PageContext with page operations
- [ ] Navigation (goto, back, forward, reload)
- [ ] Wait conditions (navigation, selector, network idle)
- [ ] Current state (url, title)
- [ ] Write tests

### Task 4: PageReader Implementation
- [ ] Implement accessibility tree extraction
- [ ] Implement text content extraction
- [ ] Implement innerHTML extraction
- [ ] Element reference system (ref_1, ref_2)
- [ ] Write tests

### Task 5: Element Interactions
- [ ] Implement click, type, fill, select, check operations
- [ ] Implement hover, scroll, press operations
- [ ] ElementFinder with byRef, bySelector, byText, byRole
- [ ] Write tests

### Task 6: Screenshot Implementation
- [ ] Full page and viewport screenshots
- [ ] Element-specific screenshots
- [ ] File-based storage with naming convention
- [ ] Cleanup policies
- [ ] Write tests

### Task 7: JavaScript Execution
- [ ] Implement evaluate() for page context code
- [ ] Support arguments and complex return values
- [ ] Write tests

## Notes

- Follow existing devac patterns for core/mcp/cli architecture
- Check devac-core, devac-mcp, devac-cli for reference implementations
- Use Playwright as the underlying browser automation engine
