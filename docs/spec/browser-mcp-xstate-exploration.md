# Browser-MCP + XState: Runtime State Machine Discovery

## Prompt for Exploration

### Context

We want to explore combining browser automation (via an MCP server) with XState model-based testing to **discover and document the complete state machine of a running web application** by systematically interacting with it.

### The Core Idea

Instead of extracting state machines from static code analysis, we **generate them from runtime behavior** by:

1. **Getting all interactive elements** on a page (via accessibility tree)
2. **Triggering each possible interaction** (click, type, keyboard events)
3. **Observing the resulting state changes** (DOM updates, network calls, console output)
4. **Building an XState machine** that represents all discovered states and transitions
5. **Using XState model testing** to verify completeness and find edge cases

This creates a feedback loop:
```
Page State → Available Actions → Execute Action → New Page State → Record Transition
     ↑                                                                      │
     └──────────────────────────────────────────────────────────────────────┘
```

### What Browser-MCP Should Provide

**1. Page Accessibility Snapshot as Effects**
```typescript
// Get all interactive elements as effect-like data structures
interface PageElement {
  id: string;                    // Stable identifier
  role: string;                  // ARIA role (button, link, textbox, etc.)
  name: string;                  // Accessible name
  state: {                       // Current state
    disabled?: boolean;
    expanded?: boolean;
    pressed?: boolean;
    selected?: boolean;
    checked?: boolean;
    value?: string;
  };
  actions: string[];             // Available interactions (click, type, focus, etc.)
  location: { x: number; y: number; width: number; height: number };
}

// MCP Tool: get_page_elements
// Returns: PageElement[]
```

**2. Trigger Interaction and Get Result**
```typescript
interface InteractionResult {
  beforeState: PageElement[];    // Elements before action
  action: {
    type: "click" | "type" | "press" | "focus" | "hover";
    targetId: string;
    value?: string;              // For type actions
    key?: string;                // For press actions
  };
  afterState: PageElement[];     // Elements after action
  sideEffects: {
    networkRequests: NetworkRequest[];  // Captured network activity
    consoleMessages: ConsoleMessage[];  // Captured console output
    domMutations: DOMChange[];          // Significant DOM changes
  };
  transitionId: string;          // Unique ID for this state transition
}

// MCP Tool: execute_interaction
// Input: { targetId: string, action: string, value?: string }
// Returns: InteractionResult
```

**3. Network Capture**
```typescript
interface NetworkRequest {
  url: string;
  method: string;
  requestBody?: unknown;
  responseStatus?: number;
  responseBody?: unknown;
  timestamp: number;
  duration: number;
}

// MCP Tool: get_network_activity
// Returns: NetworkRequest[] (since last call or filtered by time range)
```

**4. Console Capture**
```typescript
interface ConsoleMessage {
  level: "log" | "warn" | "error" | "info" | "debug";
  text: string;
  timestamp: number;
  source?: string;  // File and line if available
}

// MCP Tool: get_console_messages
// Returns: ConsoleMessage[]
```

### State Machine Discovery Algorithm

```typescript
interface DiscoveredState {
  id: string;                           // Hash of relevant page state
  elements: PageElement[];              // Interactive elements in this state
  url: string;                          // Current URL
  visitCount: number;                   // How many times we've seen this state
}

interface DiscoveredTransition {
  fromStateId: string;
  toStateId: string;
  action: InteractionResult["action"];
  sideEffects: InteractionResult["sideEffects"];
  count: number;                        // How many times this transition occurred
}

async function discoverStateMachine(
  startUrl: string,
  options: {
    maxStates: number;
    maxDepth: number;
    actionFilter?: (element: PageElement) => boolean;
    stateHashFn?: (elements: PageElement[]) => string;
  }
): Promise<{ states: DiscoveredState[]; transitions: DiscoveredTransition[] }> {
  
  const states = new Map<string, DiscoveredState>();
  const transitions: DiscoveredTransition[] = [];
  const queue: Array<{ stateId: string; depth: number }> = [];
  
  // 1. Navigate to start URL
  await browserMcp.navigate(startUrl);
  
  // 2. Get initial state
  const initialElements = await browserMcp.getPageElements();
  const initialStateId = hashState(initialElements);
  states.set(initialStateId, {
    id: initialStateId,
    elements: initialElements,
    url: startUrl,
    visitCount: 1,
  });
  queue.push({ stateId: initialStateId, depth: 0 });
  
  // 3. BFS exploration
  while (queue.length > 0 && states.size < options.maxStates) {
    const { stateId, depth } = queue.shift()!;
    if (depth >= options.maxDepth) continue;
    
    const state = states.get(stateId)!;
    
    // Get all actionable elements
    const actionableElements = state.elements.filter(
      el => el.actions.length > 0 && (!options.actionFilter || options.actionFilter(el))
    );
    
    // Try each possible action
    for (const element of actionableElements) {
      for (const action of element.actions) {
        // Reset to known state (navigate back or use state restoration)
        await restoreState(stateId);
        
        // Execute the action
        const result = await browserMcp.executeInteraction({
          targetId: element.id,
          action: action,
        });
        
        // Compute new state
        const newStateId = hashState(result.afterState);
        
        // Record transition
        const existingTransition = transitions.find(
          t => t.fromStateId === stateId && 
               t.action.targetId === element.id && 
               t.action.type === action
        );
        
        if (existingTransition) {
          existingTransition.count++;
        } else {
          transitions.push({
            fromStateId: stateId,
            toStateId: newStateId,
            action: result.action,
            sideEffects: result.sideEffects,
            count: 1,
          });
        }
        
        // Add new state if not seen
        if (!states.has(newStateId)) {
          states.set(newStateId, {
            id: newStateId,
            elements: result.afterState,
            url: await browserMcp.getCurrentUrl(),
            visitCount: 1,
          });
          queue.push({ stateId: newStateId, depth: depth + 1 });
        } else {
          states.get(newStateId)!.visitCount++;
        }
      }
    }
  }
  
  return { states: Array.from(states.values()), transitions };
}
```

### Converting to XState Machine

```typescript
function toXStateMachine(
  discovered: { states: DiscoveredState[]; transitions: DiscoveredTransition[] }
): string {
  const { states, transitions } = discovered;
  
  // Group transitions by source state
  const transitionsByState = new Map<string, DiscoveredTransition[]>();
  for (const t of transitions) {
    const existing = transitionsByState.get(t.fromStateId) || [];
    existing.push(t);
    transitionsByState.set(t.fromStateId, existing);
  }
  
  // Generate XState v5 machine definition
  const stateDefinitions = states.map(state => {
    const stateTransitions = transitionsByState.get(state.id) || [];
    
    const on = stateTransitions.reduce((acc, t) => {
      const eventName = `${t.action.type.toUpperCase()}_${sanitize(t.action.targetId)}`;
      acc[eventName] = {
        target: `#${t.toStateId}`,
        // Include side effects as actions
        actions: t.sideEffects.networkRequests.length > 0 
          ? [`log_network_${t.toStateId}`] 
          : undefined,
      };
      return acc;
    }, {} as Record<string, unknown>);
    
    return {
      id: state.id,
      meta: {
        url: state.url,
        elementCount: state.elements.length,
        // Store element snapshot for test generation
        elements: state.elements.map(e => ({ id: e.id, role: e.role, name: e.name })),
      },
      on,
    };
  });
  
  return `
import { setup } from "xstate";

export const discoveredMachine = setup({
  types: {
    context: {} as {
      currentUrl: string;
      networkLog: Array<{ url: string; method: string; status: number }>;
      consoleLog: Array<{ level: string; message: string }>;
    },
    events: {} as ${generateEventTypes(transitions)},
  },
  actions: {
    ${generateActionDefinitions(transitions)}
  },
}).createMachine({
  id: "discovered-app",
  initial: "${states[0]?.id || 'unknown'}",
  context: {
    currentUrl: "${states[0]?.url || ''}",
    networkLog: [],
    consoleLog: [],
  },
  states: {
    ${stateDefinitions.map(s => `"${s.id}": ${JSON.stringify(s, null, 2)}`).join(",\n    ")}
  },
});
`;
}
```

### XState Model Testing Integration

Once we have the discovered machine, use `@xstate/graph` to:

```typescript
import { getShortestPaths, getSimplePaths } from "@xstate/graph";
import { discoveredMachine } from "./discovered-machine";

// Generate test paths
const shortestPaths = getShortestPaths(discoveredMachine);
const allPaths = getSimplePaths(discoveredMachine);

// Generate Playwright tests from paths
function generatePlaywrightTests(paths: typeof shortestPaths): string {
  return paths.map(path => `
test("${path.description}", async ({ page }) => {
  await page.goto("${path.state.context.currentUrl}");
  
  ${path.segments.map(segment => {
    const event = segment.event;
    const [action, targetId] = event.type.split("_");
    
    switch (action) {
      case "CLICK":
        return `await page.getByTestId("${targetId}").click();`;
      case "TYPE":
        return `await page.getByTestId("${targetId}").fill("${event.value || ''}");`;
      case "PRESS":
        return `await page.keyboard.press("${event.key || 'Enter'}");`;
      default:
        return `// Unknown action: ${action}`;
    }
  }).join("\n  ")}
  
  // Assert final state
  ${generateStateAssertions(path.state)}
});
`).join("\n\n");
}
```

### Environment Configuration

```typescript
interface E2EEnvironment {
  name: string;                    // "staging", "production", "local"
  baseUrl: string;
  auth?: {
    type: "cookie" | "bearer" | "basic";
    credentials: string;           // Reference to secret
  };
  networkMocking?: {
    enabled: boolean;
    rules: Array<{
      urlPattern: string;
      response: unknown;
    }>;
  };
}

// Run discovery against specific environment
async function discoverForEnvironment(env: E2EEnvironment) {
  await browserMcp.configure({
    baseUrl: env.baseUrl,
    auth: env.auth,
    captureNetwork: true,
    captureConsole: true,
  });
  
  const machine = await discoverStateMachine(env.baseUrl, {
    maxStates: 100,
    maxDepth: 10,
  });
  
  // Save machine with environment context
  await saveDiscoveredMachine(machine, `machines/${env.name}.ts`);
}
```

### Integration with DevAC

The discovered state machines become **another type of seed**:

```typescript
// New seed type: runtime-machines
interface RuntimeMachineSeed {
  environment: string;
  discoveredAt: string;           // ISO timestamp
  machine: {
    states: DiscoveredState[];
    transitions: DiscoveredTransition[];
  };
  coverage: {
    elementsInteracted: number;
    elementsTotal: number;
    statesDiscovered: number;
    transitionsDiscovered: number;
  };
  networkProfile: {
    endpoints: Array<{
      url: string;
      methods: string[];
      callCount: number;
    }>;
  };
}

// Query examples:
// "What states does the checkout flow have?"
// "What network calls happen when clicking 'Submit'?"
// "Which elements have never been interacted with?"
```

### Success Criteria

1. **Complete state discovery**: Can map all reachable UI states from a starting URL
2. **Transition accuracy**: Captured transitions match actual app behavior
3. **Network correlation**: Each transition includes associated network activity
4. **Test generation**: Generated tests are runnable and pass
5. **Reproducibility**: Same app version produces same state machine

### Open Questions

1. **State identity**: How to create stable state IDs that survive minor DOM changes?
2. **Action prioritization**: Which elements/actions to explore first?
3. **State restoration**: How to efficiently return to a previous state for exploration?
4. **Dynamic content**: How to handle time-dependent or random content?
5. **Auth flows**: How to handle login/logout state transitions?
6. **Infinite states**: How to detect and handle infinite state spaces (e.g., counters)?

### Relation to Static Analysis (Issue #189)

This runtime approach **complements** the static XState extraction from Issue #189:

| Aspect | Static (Issue #189) | Runtime (This) |
|--------|---------------------|----------------|
| Source | Code AST | Running application |
| Completeness | All defined states | Only reachable states |
| Accuracy | May include dead code | Actual behavior |
| Side effects | Inferred from code | Actually observed |
| Environment | N/A | Environment-specific |

**Combined approach**: Use static analysis to identify expected states, runtime discovery to verify actual behavior, diff to find gaps.

---

## Next Steps

1. Research existing browser-mcp implementations or create specification
2. Prototype state discovery algorithm with Playwright
3. Test on a simple app (e.g., TodoMVC) to validate approach
4. Integrate with DevAC as new seed type
5. Connect with XState model testing for verification
