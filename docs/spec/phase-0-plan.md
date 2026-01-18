# Phase 0: Foundation Completion Plan

> DevAC/Vivief Implementation Plan
> Created: 2026-01-17
> Status: Planning

---

## Executive Summary

Phase 0 focuses on **completing the foundation** for UI-layer analysis. The comprehensive review identified that DevAC has strong infrastructure (parser, effects, rules, hub) but lacks JSX/component extraction—a prerequisite for A11y analysis, Actor discovery, and full React application support.

**Goal**: Enable queries like "list all Button components" and "find elements with aria-controls"

**Duration**: 4-6 weeks

**Priority Order**:
1. JSX Element Extraction (P0 - blocker for all subsequent phases)
2. Component Hierarchy Edges (P0 - enables containment queries)
3. ARIA Attribute Extraction (P1 - enables a11y queries)
4. Auto Hub Sync on Validate (P1 - reduces developer friction)

---

## Current State Analysis

### What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| TypeScript Parser | ✅ Production | Babel-based, 54KB, handles decorators, JSDoc |
| Node Types | 🟡 Defined | `jsx_component` and `hook` kinds exist but unused |
| Edge Types | 🟡 Partial | No `COMPONENT_HIERARCHY` edge type |
| Effects System | ✅ Production | FunctionCall, Store, Retrieve, Send, Request |
| Rules Engine | ✅ Production | Pattern matching, domain classification |
| Hub Federation | ✅ Production | DuckDB, IPC, multi-repo |
| Validation | ✅ Production | tsc, eslint, test, coverage validators |

### What's Missing for Phase 0

| Gap | Impact | Effort |
|-----|--------|--------|
| JSX element AST handlers | Cannot extract component usage | Medium |
| JSX attribute extraction | Cannot query props or ARIA | Small |
| Component hierarchy edges | Cannot query nesting/composition | Medium |
| Hook usage detection | Cannot track React patterns | Small |
| Auto-sync workflow | Manual hub refresh required | Small |

---

## Implementation Tasks

### Task 1: JSX Element Extraction (P0)

**Objective**: Extract JSX elements as queryable nodes with their props

**Files to Modify**:
- `packages/devac-core/src/parsers/typescript-parser.ts`
- `packages/devac-core/src/types/nodes.ts`

**Subtasks**:

#### 1.1 Add JSXElement Handler

Add new Babel traverse visitors for JSX:

```typescript
// In extractFromAST method, add:
JSXElement: (nodePath: any) => {
  this.handleJSXElement(nodePath, ctx, fileEntityId);
},

JSXFragment: (nodePath: any) => {
  this.handleJSXFragment(nodePath, ctx, fileEntityId);
},
```

**Implementation Details**:

```typescript
/**
 * Handle JSX elements to create component nodes and hierarchy edges
 */
private handleJSXElement(
  nodePath: NodePath<t.JSXElement>,
  ctx: ParserContext,
  fileEntityId: string
): void {
  const node = nodePath.node;
  const openingElement = node.openingElement;
  
  // Extract component name
  let componentName: string;
  if (t.isJSXIdentifier(openingElement.name)) {
    componentName = openingElement.name.name;
  } else if (t.isJSXMemberExpression(openingElement.name)) {
    componentName = this.extractJSXMemberName(openingElement.name);
  } else {
    return; // Namespaced JSX (xml:foo) - skip
  }
  
  // Determine if this is a component (PascalCase) or HTML element (lowercase)
  const isComponent = /^[A-Z]/.test(componentName);
  const kind: NodeKind = isComponent ? "jsx_component" : "unknown";
  
  // Only create nodes for components, not HTML elements
  if (!isComponent) {
    // Still extract ARIA attributes from HTML elements
    this.extractAriaAttributes(node, ctx, fileEntityId);
    return;
  }
  
  // Find enclosing function (the component this JSX is in)
  const enclosingFunction = nodePath.getFunctionParent();
  let parentEntityId = fileEntityId;
  if (enclosingFunction) {
    const funcEntityId = ctx.getNodeEntityId(enclosingFunction.node);
    if (funcEntityId) {
      parentEntityId = funcEntityId;
    }
  }
  
  // Extract props
  const props = this.extractJSXProps(openingElement.attributes);
  
  // Create JSX component usage node
  const scopedName = generateScopedName(
    { name: componentName, kind: "jsx_component", isTopLevel: false },
    ctx.scopeContext
  );
  
  const componentNode = ctx.createNode({
    name: componentName,
    kind: "jsx_component",
    scopedName,
    node,
    isExported: false,
    properties: {
      props: props.regular,
      ariaProps: props.aria,
      eventHandlers: props.handlers,
      spreadProps: props.hasSpread,
    },
  });
  
  ctx.result.nodes.push(componentNode);
  
  // Create CONTAINS edge from parent function to this JSX usage
  ctx.result.edges.push(
    ctx.createContainsEdge(parentEntityId, componentNode.entity_id, node)
  );
  
  // Create INSTANTIATES edge to the component definition (unresolved)
  ctx.result.edges.push(
    ctx.createEdge({
      sourceEntityId: componentNode.entity_id,
      targetEntityId: `unresolved:${componentName}`,
      edgeType: "INSTANTIATES",
      node,
    })
  );
}
```

#### 1.2 Extract JSX Props

```typescript
interface JSXPropsResult {
  regular: Record<string, string | boolean | null>;
  aria: Record<string, string>;
  handlers: string[];
  hasSpread: boolean;
}

private extractJSXProps(
  attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]
): JSXPropsResult {
  const result: JSXPropsResult = {
    regular: {},
    aria: {},
    handlers: [],
    hasSpread: false,
  };
  
  for (const attr of attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      result.hasSpread = true;
      continue;
    }
    
    if (!t.isJSXIdentifier(attr.name)) continue;
    const name = attr.name.name;
    
    // ARIA attributes
    if (name.startsWith("aria-") || name === "role") {
      result.aria[name] = this.extractJSXAttributeValue(attr.value);
      continue;
    }
    
    // Event handlers
    if (name.startsWith("on") && name.length > 2 && name[2] === name[2].toUpperCase()) {
      result.handlers.push(name);
      continue;
    }
    
    // Regular props
    result.regular[name] = this.extractJSXAttributeValue(attr.value);
  }
  
  return result;
}

private extractJSXAttributeValue(
  value: t.JSXAttribute["value"]
): string | boolean | null {
  if (value === null) {
    return true; // Boolean attribute: <Button disabled />
  }
  if (t.isStringLiteral(value)) {
    return value.value;
  }
  if (t.isJSXExpressionContainer(value)) {
    // For expressions, store a placeholder
    if (t.isIdentifier(value.expression)) {
      return `{${value.expression.name}}`;
    }
    return "{...}";
  }
  return null;
}
```

#### 1.3 Add Tests

Create `packages/devac-core/src/parsers/__tests__/jsx-extraction.test.ts`:

```typescript
describe("JSX Element Extraction", () => {
  it("extracts PascalCase components as jsx_component nodes", async () => {
    const code = `
      const App = () => (
        <Button variant="primary" onClick={handleClick}>
          Click me
        </Button>
      );
    `;
    
    const result = await parser.parseContent(code, "test.tsx", config);
    
    const jsxNode = result.nodes.find(n => n.kind === "jsx_component");
    expect(jsxNode).toBeDefined();
    expect(jsxNode?.name).toBe("Button");
    expect(jsxNode?.properties.props).toEqual({
      variant: "primary",
    });
    expect(jsxNode?.properties.eventHandlers).toContain("onClick");
  });
  
  it("extracts ARIA attributes separately", async () => {
    const code = `
      const Modal = () => (
        <div role="dialog" aria-labelledby="title" aria-modal="true">
          <h2 id="title">Modal Title</h2>
        </div>
      );
    `;
    
    const result = await parser.parseContent(code, "test.tsx", config);
    
    // ARIA from HTML elements should be captured differently
    // (implementation detail TBD based on requirements)
  });
  
  it("creates INSTANTIATES edges to component definitions", async () => {
    const code = `
      import { Button } from "./Button";
      const App = () => <Button />;
    `;
    
    const result = await parser.parseContent(code, "test.tsx", config);
    
    const instantiatesEdge = result.edges.find(e => e.edge_type === "INSTANTIATES");
    expect(instantiatesEdge).toBeDefined();
    expect(instantiatesEdge?.target_entity_id).toBe("unresolved:Button");
  });
});
```

**Validation Criteria**:
- Query: `SELECT * FROM nodes WHERE kind = 'jsx_component'` returns component usages
- Query: `SELECT * FROM edges WHERE edge_type = 'INSTANTIATES'` shows component references

---

### Task 2: Component Hierarchy Edges (P0)

**Objective**: Enable queries about component nesting and composition

**Files to Modify**:
- `packages/devac-core/src/types/edges.ts`
- `packages/devac-core/src/parsers/typescript-parser.ts`

**Subtasks**:

#### 2.1 Add Edge Type

In `edges.ts`, add to `EdgeType`:

```typescript
export type EdgeType =
  | "CONTAINS"
  // ... existing types ...
  | "RENDERS"       // Component A renders Component B as child
  | "PASSES_PROPS"; // Component A passes props to Component B
```

#### 2.2 Create Hierarchy Edges During JSX Parsing

Extend `handleJSXElement` to track parent-child relationships:

```typescript
// In handleJSXElement, after creating the component node:

// Find parent JSX element (if any)
let parentJSX = nodePath.parentPath;
while (parentJSX && !t.isJSXElement(parentJSX.node)) {
  parentJSX = parentJSX.parentPath;
}

if (parentJSX && t.isJSXElement(parentJSX.node)) {
  // Get parent JSX's entity ID (registered earlier in traversal)
  const parentJSXEntityId = ctx.getNodeEntityId(parentJSX.node);
  if (parentJSXEntityId) {
    ctx.result.edges.push(
      ctx.createEdge({
        sourceEntityId: parentJSXEntityId,
        targetEntityId: componentNode.entity_id,
        edgeType: "RENDERS",
        node,
        properties: {
          slot: "children", // or named slot if using render props
        },
      })
    );
  }
}
```

#### 2.3 Add Tests

```typescript
describe("Component Hierarchy", () => {
  it("creates RENDERS edges for nested components", async () => {
    const code = `
      const Layout = () => (
        <Container>
          <Header />
          <Main>
            <Sidebar />
            <Content />
          </Main>
          <Footer />
        </Container>
      );
    `;
    
    const result = await parser.parseContent(code, "test.tsx", config);
    
    const rendersEdges = result.edges.filter(e => e.edge_type === "RENDERS");
    expect(rendersEdges.length).toBeGreaterThanOrEqual(5);
    
    // Container renders Header, Main, Footer
    // Main renders Sidebar, Content
  });
});
```

**Validation Criteria**:
- Query: `SELECT * FROM edges WHERE edge_type = 'RENDERS'` shows component tree
- Query: Recursive CTE can traverse full component hierarchy

---

### Task 3: ARIA Attribute Extraction (P1)

**Objective**: Enable accessibility queries and future WCAG validation

**Files to Modify**:
- `packages/devac-core/src/parsers/typescript-parser.ts`
- `packages/devac-core/src/types/effects.ts` (optional: new effect type)

**Subtasks**:

#### 3.1 Extract ARIA from All Elements

Extend JSX handling to capture ARIA from both components and HTML elements:

```typescript
/**
 * Extract ARIA attributes and create accessibility-related data
 */
private extractAriaAttributes(
  node: t.JSXElement,
  ctx: ParserContext,
  parentEntityId: string
): void {
  const openingElement = node.openingElement;
  
  // Get element name
  let elementName: string;
  if (t.isJSXIdentifier(openingElement.name)) {
    elementName = openingElement.name.name;
  } else {
    return;
  }
  
  // Extract ARIA attributes
  const ariaAttrs: Record<string, string> = {};
  let role: string | null = null;
  let hasInteractiveHandler = false;
  let tabIndex: number | null = null;
  
  for (const attr of openingElement.attributes) {
    if (t.isJSXSpreadAttribute(attr)) continue;
    if (!t.isJSXIdentifier(attr.name)) continue;
    
    const name = attr.name.name;
    const value = this.extractJSXAttributeValue(attr.value);
    
    if (name === "role" && typeof value === "string") {
      role = value;
    } else if (name.startsWith("aria-")) {
      ariaAttrs[name] = String(value);
    } else if (name === "tabIndex" || name === "tabindex") {
      tabIndex = typeof value === "string" ? parseInt(value, 10) : null;
    } else if (name.startsWith("on") && name[2]?.toUpperCase() === name[2]) {
      hasInteractiveHandler = true;
    }
  }
  
  // Only record if there's ARIA information
  if (Object.keys(ariaAttrs).length === 0 && !role && tabIndex === null) {
    return;
  }
  
  // Store in node properties
  // Option A: As node properties (if we create nodes for HTML elements)
  // Option B: As a separate ARIA effect (requires new effect type)
  
  // For now, store as properties on the nearest component node
  // or create a dedicated AriaEffect
}
```

#### 3.2 Create AriaEffect Type (Optional Enhancement)

In `effects.ts`:

```typescript
export interface AriaEffect extends BaseEffect {
  effect_type: "Accessibility";
  element_name: string;
  role: string | null;
  aria_attributes: Record<string, string>;
  is_interactive: boolean;
  has_accessible_name: boolean;
  tab_index: number | null;
}
```

#### 3.3 Add Tests

```typescript
describe("ARIA Extraction", () => {
  it("extracts role attribute", async () => {
    const code = `
      const Modal = () => (
        <div role="dialog" aria-labelledby="title">
          <h2 id="title">Title</h2>
        </div>
      );
    `;
    
    const result = await parser.parseContent(code, "test.tsx", config);
    
    // Verify ARIA data is captured
    // Implementation-dependent: check nodes or effects
  });
  
  it("detects interactive elements without keyboard access", async () => {
    const code = `
      const Bad = () => (
        <div onClick={handleClick}>Click me</div>
      );
    `;
    
    const result = await parser.parseContent(code, "test.tsx", config);
    
    // Should flag: onClick without role="button" and no tabIndex
  });
});
```

**Validation Criteria**:
- Query: `SELECT * FROM nodes WHERE properties->>'ariaProps' IS NOT NULL`
- Query: Find elements with `aria-controls` pointing to IDs

---

### Task 4: Auto Hub Sync on Validate (P1)

**Objective**: Automatically sync validation results to hub, reducing manual steps

**Files to Modify**:
- `packages/devac-cli/src/commands/validate.ts`
- `packages/devac-core/src/validation/validation-coordinator.ts`

**Subtasks**:

#### 4.1 Add --sync Flag to validate Command

```typescript
// In validate command definition
.option("--sync", "Automatically sync results to hub after validation")
.option("--no-sync", "Disable automatic hub sync (if enabled by default)")
```

#### 4.2 Integrate Hub Sync in Validation Coordinator

```typescript
// In ValidationCoordinator.validate()

async validate(options: ValidateOptions): Promise<ValidationResult> {
  const result = await this.runValidators(options);
  
  // Auto-sync if enabled
  if (options.syncToHub !== false) {
    await this.syncToHub(result);
  }
  
  return result;
}

private async syncToHub(result: ValidationResult): Promise<void> {
  const hub = await this.getHubClient();
  if (!hub) {
    // Hub not configured, skip
    return;
  }
  
  await pushValidationResultsToHub(hub, result);
}
```

#### 4.3 Add Configuration Option

In `.devac/config.json` or CLI config:

```json
{
  "validation": {
    "autoSyncToHub": true
  }
}
```

#### 4.4 Add Tests

```typescript
describe("Auto Hub Sync", () => {
  it("syncs validation results to hub when --sync is passed", async () => {
    // Run validation with --sync
    // Verify hub contains validation errors
  });
  
  it("respects autoSyncToHub config setting", async () => {
    // Set config
    // Run validation without explicit flag
    // Verify sync behavior
  });
});
```

**Validation Criteria**:
- `devac validate --sync` pushes results to hub
- `devac status` shows validation errors from hub cache

---

## Implementation Order

```
Week 1-2: JSX Element Extraction (Task 1)
├── Add JSXElement/JSXFragment handlers
├── Extract component names and props
├── Create jsx_component nodes
└── Add unit tests

Week 2-3: Component Hierarchy Edges (Task 2)
├── Add RENDERS edge type
├── Track parent-child JSX relationships
├── Update semantic resolution for component refs
└── Add integration tests

Week 3-4: ARIA Attribute Extraction (Task 3)
├── Extract ARIA attributes from JSX
├── Store in node properties or effects
├── Add accessibility-focused tests
└── Document query patterns

Week 4-5: Auto Hub Sync (Task 4)
├── Add --sync flag to CLI
├── Integrate hub push in coordinator
├── Add configuration option
└── Update documentation

Week 5-6: Integration and Polish
├── End-to-end testing
├── Documentation updates
├── Performance benchmarking
└── Update gaps.md
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| JSX components queryable | 0% | 100% |
| Component hierarchy edges | 0 | Full tree |
| ARIA attributes extracted | 0 | All ARIA + role |
| Hub sync automation | Manual | Auto on validate |
| New node kinds in use | 14 | 16 (`jsx_component`, `hook`) |
| New edge types | 19 | 21 (`RENDERS`, `PASSES_PROPS`) |

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| JSX complexity (fragments, portals) | Medium | Start with basic cases, iterate |
| Performance impact | Low | JSX traversal is already part of Babel pass |
| Semantic resolution complexity | Medium | Defer to Phase 1, use unresolved refs |
| Breaking existing tests | Low | Add new handlers, don't modify existing |

---

## Dependencies

**No new dependencies required** - Babel already supports JSX via the `jsx` plugin which is enabled in `PARSER_OPTIONS`.

**Existing infrastructure**:
- Babel parser with JSX plugin ✅
- Node/Edge types infrastructure ✅
- Effects system ✅
- Hub federation ✅
- Validation coordinator ✅

---

## Next Steps After Phase 0

With Phase 0 complete, the following phases become unblocked:

- **Phase 1**: WCAG Validation Rules (can build on ARIA extraction)
- **Phase 2**: OTel Integration (independent, can parallelize)
- **Phase 3**: Actor Discovery (can build on component/hook extraction)

---

## References

- [Comprehensive Review](/docs/spec/comprehensive-review.md)
- [Implementation Gaps](/docs/spec/gaps.md)
- [ADR-0005: Two-Pass Parsing](/docs/adr/0005-two-pass-parsing.md)
- [UI Effects Vision](/docs/vision/ui-effects.md)
- [Actors Vision](/docs/vision/actors.md)

---

*Plan created: 2026-01-17*
*Status: Ready for review*
