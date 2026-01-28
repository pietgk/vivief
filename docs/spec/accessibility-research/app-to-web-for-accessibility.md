# Zag.js Repository Review & RN-to-Web Migration Analysis

## Executive Summary

Zag.js is a **framework-agnostic UI component library** that uses state machines to implement common component patterns. It provides 50+ accessible UI components with adapters for React, Vue, Solid, Svelte, and Preact.

**React Native Support Status**: Not currently supported. Would require significant architectural changes due to deep DOM coupling throughout the codebase.

---

## 1. Repository Architecture Overview

### Structure
```
packages/
├── core/           # State machine engine (minimal XState-like)
├── types/          # Shared TypeScript definitions
├── store/          # Proxy-based reactive store
├── anatomy/        # Component part definitions for styling
├── machines/       # 50+ component state machines
│   ├── accordion/
│   ├── checkbox/
│   ├── dialog/
│   ├── slider/
│   └── ... (50+ more)
├── frameworks/     # Framework adapters
│   ├── react/
│   ├── vue/
│   ├── solid/
│   ├── svelte/
│   └── preact/
└── utilities/      # 23 utility packages
    ├── dom-query/  # DOM manipulation (CRITICAL for RN discussion)
    ├── focus-trap/
    ├── popper/
    └── ...
```

### Build System
- **Package Manager**: pnpm 10.15.0+
- **Build Tool**: tsup
- **Testing**: Vitest (unit), Playwright (E2E)
- **TypeScript**: Strict mode with exact optional properties

---

## 2. Core Architecture

### State Machine Pattern (`@zag-js/core`)

```
Event → Transition Selection → Guard Check → State Change
→ Exit Actions → Enter Actions → Effects
```

Key concepts:
- **Bindable**: Reactive value container
- **Context**: Machine state data
- **Computed**: Derived values from context/props
- **Scope**: DOM context (id, getRootNode, getDoc, getWin)

### Framework-Agnostic Design

The architecture has three layers:

1. **Machine Layer** (framework-agnostic in theory)
   - State definitions, transitions, guards
   - BUT: Uses DOM utilities in effects

2. **Connect Layer** (framework-agnostic)
   - Converts Service → API with prop getters
   - Returns normalized props for frameworks

3. **Framework Adapter** (framework-specific)
   - `useMachine()` hook for each framework
   - Handles reactivity model differences
   - Normalizes props (onClick vs @click, etc.)

---

## 3. Framework Adapter Analysis

### How Adapters Work

| Framework | Reactivity | Lifecycle | Flush Method |
|-----------|------------|-----------|--------------|
| React | useState | useLayoutEffect | flushSync() |
| Vue | computed/refs | onMounted | nextTick() |
| Solid | createMemo | onMount | Synchronous |
| Svelte | $derived | onMount | flushSync() |

### Key Pattern: Props Normalization

```typescript
// React - identity (no changes needed)
normalizeProps = createNormalizer((v) => v)

// Vue - transforms event names
propMap = {
  htmlFor: "for",
  className: "class",
  onChange: "onInput",
  onFocus: "onFocusin",
}
```

---

## 4. React Native Support Analysis

### TL;DR: Major Undertaking Required

**What works:**
- Core state machine logic
- Type system (mostly)
- Architectural patterns

**What doesn't work:**
- 70%+ of utility code (DOM-specific)
- All component machines (DOM-coupled)
- Entire connect/prop system (assumes HTML)
- Accessibility model (CSS selectors vs RN accessibility tree)

### Critical DOM Dependencies

**`@zag-js/dom-query`** - The main blocker:

| Utility | DOM APIs Used | RN Compatible |
|---------|--------------|---------------|
| query.ts | querySelector, querySelectorAll | ✗ |
| node.ts | Element, HTMLElement, offsetWidth, classList | ✗ |
| event.ts | addEventListener, composedPath | ✗ |
| form.ts | HTMLInputElement, MutationObserver | ✗ |
| tabbable.ts | CSS selectors, tabIndex | ✗ |
| overflow.ts | getBoundingClientRect, scrollIntoView | ✗ |

### Specific Incompatibilities

1. **Element Access**
   - Web: `getRootNode().getElementById(id)`
   - RN: No DOM tree, uses component refs

2. **Event System**
   - Web: `addEventListener`, `composedPath()`, `currentTarget`
   - RN: Different event object structure

3. **Focus Management**
   - Web: CSS selector-based (`getTabbables()`)
   - RN: Explicit focus management via refs

4. **Form Integration**
   - Web: HTML form elements with attributes
   - RN: No forms, controlled components only

5. **Styling/State Visualization**
   - Web: `data-state`, `data-disabled` attributes
   - RN: Must pass state explicitly

6. **Positioning**
   - Web: `getBoundingClientRect()`, computed styles
   - RN: Different layout model (Yoga)

---

## 5. What Would Be Needed for React Native

### Required Architectural Changes

1. **Abstract Platform Layer**
   ```
   @zag-js/platform-core
   ├── AbstractDOM (element access interface)
   ├── AbstractEvents (event handling)
   ├── AbstractAccessibility (focus, a11y)
   └── Adapters (web DOM, React Native)
   ```

2. **Refactor DOM Utilities**
   - Split `@zag-js/dom-query` into platform-agnostic + adapters
   - ~50% of code would need rewriting

3. **Refactor All 50+ Machines**
   - Remove direct DOM imports
   - Use platform abstraction APIs
   - Every machine has a `.dom.ts` file to update

4. **New Framework Adapter**
   - `@zag-js/react-native` package
   - Handle RN-specific concerns (Pressable, View, AccessibilityInfo)

5. **Testing Infrastructure**
   - React Native testing (Detox or similar)
   - Parallel test suites

### Estimated Effort

| Component | Effort Level | Hours (rough) |
|-----------|--------------|---------------|
| Platform abstraction layer | HIGH | 100-200 |
| DOM utilities refactor | CRITICAL | 200-300 |
| Machine refactoring (50+) | CRITICAL | 200-400 |
| RN framework adapter | MEDIUM | 50-100 |
| Connect layer adaptations | HIGH | 100-150 |
| Testing infrastructure | MEDIUM | 50-100 |
| **Total** | | **500-1000+ hours** |

---

## 6. Alternative Approaches

### Option A: Full Integration (described above)
- Complete platform abstraction
- All components work in RN
- Highest effort, best outcome

### Option B: Extract State Machine Logic Only
- Use Zag machines for state logic
- Build RN-specific UI wrappers
- Lower effort, partial reuse

### Option C: Separate Implementation
- Use Zag for web only
- Use RN-specific libraries (React Native Paper, NativeBase)
- Share only types/interfaces

### Option D: Selective Component Port
- Port only most-needed components (dialog, checkbox, etc.)
- Create RN-specific versions
- Moderate effort, targeted value

---

## 7. Conclusion

Zag.js is an excellently architected library for web component development with strong accessibility support. However, **React Native support would require fundamental architectural changes** because:

1. The DOM abstraction layer (`@zag-js/dom-query`) assumes browser APIs throughout
2. Every component machine uses DOM utilities in effects
3. The prop generation system outputs HTML attributes
4. Focus/accessibility handling relies on CSS selectors

The core state machine logic IS reusable, but the "plumbing" connecting machines to the UI is deeply web-specific.

**Recommendation**: For projects needing both web and RN support, consider using Zag.js for web and a native RN component library, sharing only business logic and types between platforms.

---

## 8. React Native Platform Abstraction Design

### Core Abstraction: `PlatformAdapter` Interface

The key insight is that Zag's DOM dependencies can be grouped into 5 subsystems that need abstraction:

```typescript
interface PlatformAdapter {
  readonly type: "web" | "native";

  elementRegistry: ElementRegistry;   // Element access
  focusManager: FocusManager;         // Focus handling
  layoutManager: LayoutManager;       // Measurement/positioning
  eventBus: EventBus;                 // Event subscription
  scheduler: Scheduler;               // Timing (RAF, setTimeout)
  platform: PlatformInfo;             // Platform detection
}
```

### 8.1 Element Registry

**Problem**: Web uses `getElementById`, `querySelector`. RN has no DOM tree.

**Solution**: Explicit element registration with refs.

```typescript
interface ElementRegistry {
  register(id: string, element: PlatformElement, ref?: any): void;
  unregister(id: string): void;
  getById<T extends PlatformElement>(id: string): T | null;
  query(selector: ElementSelector): PlatformElement[];
}

interface ElementSelector {
  id?: string;
  type?: string;              // "button", "view", "input"
  role?: string;              // accessibility role
  dataAttribute?: { name: string; value?: string };
  containerId?: string;       // query within container
}

interface PlatformElement {
  readonly id: string;
  readonly type: string;
  readonly dataset: Record<string, string | undefined>;
  readonly attributes: Record<string, string | undefined>;
}
```

**Web Implementation**: Wraps `document.getElementById`, `querySelectorAll`
**RN Implementation**: Maintains Map of registered elements with parent-child relationships

### 8.2 Focus Manager

**Problem**: Web uses CSS selectors (`[tabindex]`, `input:not([disabled])`). RN uses accessibility tree.

**Solution**: Abstract focus operations.

```typescript
interface FocusManager {
  getActiveElement(): FocusableElement | null;
  isActiveElement(element: PlatformElement | null): boolean;
  getFocusables(container: PlatformElement | null): FocusableElement[];
  getTabbables(container: PlatformElement | null): FocusableElement[];
  getFirstFocusable(container: PlatformElement | null): FocusableElement | null;
  focusNext(container: PlatformElement | null, current?: FocusableElement): FocusableElement | null;
  focusPrevious(container: PlatformElement | null, current?: FocusableElement): FocusableElement | null;
}

interface FocusableElement extends PlatformElement {
  focus(options?: { preventScroll?: boolean }): void;
  blur(): void;
  readonly isFocused: boolean;
}
```

**Web Implementation**: Uses existing `getTabbables()` from `dom-query`
**RN Implementation**: Uses `AccessibilityInfo.setAccessibilityFocus()` + ref tracking

### 8.3 Layout Manager

**Problem**: Web uses sync `getBoundingClientRect()`. RN uses async `measure()`.

**Solution**: Async-first measurement API.

```typescript
interface LayoutManager {
  measure(element: PlatformElement): Promise<LayoutRect>;
  measureSync?(element: PlatformElement): LayoutRect | null;  // Web only
  getViewportSize(): { width: number; height: number };
  getScrollPosition(element?: PlatformElement): { x: number; y: number };
  scrollTo(element: PlatformElement, position: { x?: number; y?: number }): void;
  scrollIntoView(element: PlatformElement, options?: ScrollIntoViewOptions): void;
}

interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

**Web Implementation**: Wraps `getBoundingClientRect()`, offers sync version
**RN Implementation**: Uses `ref.measure()` callback API

### 8.4 Event Bus

**Problem**: Web uses `addEventListener`. RN has different event model.

**Solution**: Unified subscription API.

```typescript
interface EventBus {
  subscribe<T extends PlatformEvent>(
    element: PlatformElement | null,
    eventType: string,
    handler: (event: T) => void,
    options?: { capture?: boolean; passive?: boolean }
  ): () => void;  // Returns unsubscribe function

  dispatch(element: PlatformElement | null, event: PlatformEvent): void;
}

interface PlatformEvent<T = PlatformElement> {
  type: string;
  target: T | null;
  currentTarget: T | null;
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
```

### 8.5 Proposed Package Structure

```
packages/
├── platform/             # Abstract interfaces only
│   └── src/types.ts
│
├── platform-web/         # Web implementation
│   ├── src/
│   │   ├── adapter.ts
│   │   ├── element-registry.ts
│   │   ├── focus-manager.ts
│   │   └── layout-manager.ts
│   └── package.json
│
├── platform-native/      # React Native implementation
│   ├── src/
│   │   ├── adapter.ts
│   │   ├── element-registry.ts   # Uses Map + ref registration
│   │   ├── focus-manager.ts      # Uses AccessibilityInfo
│   │   └── layout-manager.ts     # Uses ref.measure()
│   └── package.json
│
├── frameworks/
│   ├── react/            # Uses platform-web
│   └── react-native/     # NEW - Uses platform-native
│
└── machines/             # Refactored to use platform APIs
    └── */src/*.dom.ts    # Use scope.getById, scope.query
```

### 8.6 Machine Refactoring Example

Current `dialog.dom.ts`:
```typescript
// Uses DOM directly
export const getContentEl = (ctx: Scope) =>
  ctx.getRootNode().getElementById(getContentId(ctx));
```

Refactored:
```typescript
// Uses platform abstraction
export const getContentEl = (ctx: Scope) =>
  ctx.getById(getContentId(ctx));
```

### 8.7 React Native Framework Adapter

```typescript
// @zag-js/react-native

export function useMachine<T extends MachineSchema>(
  machine: Machine<T>,
  userProps: Partial<T["props"]> = {},
): Service<T> {
  const platform = useRef(createNativePlatformAdapter());

  const scope = useMemo(() => createScope({
    id: userProps.id,
    platform: platform.current,
  }), [userProps.id]);

  // ... similar to React web adapter
}

// Hook for registering RN components with the platform
export function useZagElement(id: string, options?: ZagElementOptions) {
  const ref = useRef(null);
  const platform = useNativePlatform();

  useEffect(() => {
    if (ref.current) {
      platform.elementRegistry.register(id, { id, ...options }, ref.current);
      return () => platform.elementRegistry.unregister(id);
    }
  }, [id]);

  return ref;
}
```

### 8.8 Migration Phases

| Phase | Scope | Effort | Duration |
|-------|-------|--------|----------|
| 1 | Create `@zag-js/platform` interfaces | Low | 1-2 weeks |
| 2 | Create `@zag-js/platform-web` wrapping dom-query | Medium | 2-3 weeks |
| 3 | Refactor `@zag-js/core` Scope to use platform | Medium | 2 weeks |
| 4 | Refactor machine `.dom.ts` files (50+) | High | 4-6 weeks |
| 5 | Create `@zag-js/platform-native` | High | 3-4 weeks |
| 6 | Create `@zag-js/react-native` adapter | Medium | 2-3 weeks |
| 7 | Create `@zag-js/popper-native` for positioning | High | 2-3 weeks |
| 8 | Documentation & examples | Low | 2 weeks |

**Total: ~18-25 weeks** for full implementation with all machines.

### 8.9 Minimal Viable Abstraction

For a quick proof of concept, start with just:

```typescript
interface MinimalPlatform {
  type: "web" | "native";
  getById: (id: string) => PlatformElement | null;
  getActiveElement: () => FocusableElement | null;
  focus: (element: PlatformElement) => void;
  measure: (element: PlatformElement) => Promise<LayoutRect>;
}
```

This would support simple machines: **Toggle, Checkbox, Switch, Accordion, Tabs**.

More complex machines (Menu, Select, Combobox) need full ElementRegistry + FocusManager.

### 8.10 Critical Files to Modify

| File | Change Required |
|------|-----------------|
| `packages/core/src/scope.ts` | Add platform adapter injection |
| `packages/core/src/types.ts` | Extend Scope interface |
| `packages/utilities/dom-query/src/tabbable.ts` | Extract into FocusManager |
| `packages/utilities/dom-query/src/event.ts` | Extract into EventBus |
| `packages/machines/*/src/*.dom.ts` | Use `scope.getById()` instead of DOM |
| `packages/frameworks/react/src/machine.ts` | Pattern for RN adapter |

---

## 9. Converting ~/ws/app to Web with Zag.js

### Current App Analysis

**Tech Stack:**
- Expo ~53.0 / React Native 0.79.6 / React 19
- Custom UI library: `@mindlercare/mindlerui` (styled-components)
- Navigation: React Navigation (stack + bottom tabs)
- State: Redux + Redux Persist + React Query + tRPC

**Key Interactive Components in mindlerui:**
| Component | Current Implementation | Zag.js Equivalent |
|-----------|----------------------|-------------------|
| Modal, ActionModal | RN Modal + animations | `dialog` |
| Sheet | Gesture-driven bottom sheet | `dialog` (drawer variant) |
| DropdownPicker | Modal + Picker | `select` / `combobox` |
| CheckBox | Pressable + accessibilityRole | `checkbox` |
| RadioButton | Pressable + accessibilityRole | `radio-group` |
| TabBar | Custom tabs with underline | `tabs` |
| ExpandableList | Animated collapse | `accordion` / `collapsible` |
| ToastBanner | Gesture + auto-dismiss | `toast` |
| TextInput | RN TextInput wrapper | Native `<input>` |
| Calendar | react-native-calendars | `date-picker` |

**Accessibility Strengths (to preserve):**
- accessibilityRole, accessibilityState, accessibilityLabel throughout
- useAnimationPreferences hook (respects reduce-motion)
- useAccessibilityInfo hook (detects screen reader)
- Storybook a11y testing infrastructure

---

### Migration Options

## Option 1: React Native Web + Zag.js Hybrid

**Approach:** Use React Native Web to run most of the app on web, replace complex interactive components with Zag.js.

```
~/ws/app (Expo)
├── Web target via Expo Web / RN Web
├── Keep: View, Text, ScrollView, FlatList, etc.
├── Replace: Modal, Sheet, DropdownPicker → Zag.js
└── mindlerui components → web-compatible versions
```

**Pros:**
- ✅ Fastest path to web - most code runs as-is
- ✅ Single codebase for mobile + web
- ✅ Expo Web has good RN Web integration
- ✅ Can incrementally replace components with Zag.js
- ✅ Existing navigation, state management works

**Cons:**
- ❌ RN Web has quirks (not all RN APIs work perfectly)
- ❌ Bundle size larger than pure React web
- ❌ Some animations/gestures don't translate well
- ❌ Mixed component models (RN + Zag.js)
- ❌ react-native-calendars, gesture-handler need web polyfills

**Effort:** 4-8 weeks
**Best for:** Quick web version for testing, shared codebase priority

---

## Option 2: Separate React Web App with Zag.js

**Approach:** Create new React web app, share business logic, rebuild UI with Zag.js + styled-components.

```
~/ws/app-web (new)
├── React 19 + Vite/Next.js
├── Zag.js for all interactive components
├── styled-components (same as RN app)
├── Shared: state/, api/, utils/ from ~/ws/app
└── New: components/ using Zag.js
```

**Pros:**
- ✅ Clean web-native implementation
- ✅ Full Zag.js component suite with proper a11y
- ✅ Better web performance (no RN overhead)
- ✅ Easier to test accessibility (standard DOM)
- ✅ Can use Zag.js storybook/examples as reference
- ✅ Styled-components works identically

**Cons:**
- ❌ More upfront work (rebuild UI layer)
- ❌ Two codebases to maintain
- ❌ Need to sync UI changes between platforms
- ❌ Some components need complete reimplementation

**Effort:** 8-16 weeks (depending on feature scope)
**Best for:** Long-term web presence, accessibility-first, clean architecture

---

## Option 3: Shared Component Library with Platform Adapters

**Approach:** Create `@mindlercare/mindlerui-web` that mirrors mindlerui API but uses Zag.js internally.

```
packages/
├── mindlerui/          # Existing RN components
├── mindlerui-web/      # NEW: Web versions using Zag.js
│   ├── Modal.tsx       # Uses @zag-js/dialog
│   ├── Sheet.tsx       # Uses @zag-js/dialog (drawer)
│   ├── DropdownPicker  # Uses @zag-js/select
│   └── ...
├── mindlerui-core/     # Shared logic, types, tokens
└── mindlerui-style/    # Design tokens (already exists)
```

**Pros:**
- ✅ Same API for both platforms
- ✅ App code stays mostly unchanged
- ✅ Full Zag.js accessibility on web
- ✅ Clean separation of concerns
- ✅ Can test both platforms with same test cases

**Cons:**
- ❌ Need to maintain API compatibility
- ❌ More complex package structure
- ❌ Initial setup overhead
- ❌ Some API differences may be unavoidable

**Effort:** 10-14 weeks
**Best for:** Long-term multi-platform strategy, component library investment

---

## Option 4: Expo Web with Component Replacement Strategy

**Approach:** Use Expo's web support, progressively replace mindlerui components with web-optimized versions.

```
~/ws/app
├── app.config.js → web target enabled
├── src/components/
│   ├── Modal.tsx → Platform.select({ web: ZagModal, default: RNModal })
│   ├── Sheet.tsx → Platform.select({ web: ZagSheet, default: RNSheet })
│   └── ...
└── Conditional imports for web vs native
```

**Pros:**
- ✅ Single codebase
- ✅ Incremental migration
- ✅ Platform.select() for clean switching
- ✅ Can prioritize most-used components first
- ✅ Test on web immediately

**Cons:**
- ❌ Platform conditionals add complexity
- ❌ Bundle includes both implementations
- ❌ Testing needs to cover both paths
- ❌ Some Expo/RN packages don't support web

**Effort:** 6-10 weeks
**Best for:** Balanced approach, incremental adoption

---

### Recommendation

For **accessibility testing on web**, I recommend:

**Start with Option 4 (Expo Web + Component Replacement)**, then evolve to **Option 3 (Shared Library)** if web becomes strategic.

**Phase 1 (2-4 weeks):** Enable Expo Web, get app running
- Configure metro for web
- Add web-compatible polyfills
- Identify breaking components

**Phase 2 (4-6 weeks):** Replace key components with Zag.js
- Priority: Modal, Sheet, DropdownPicker, TabBar
- Use Platform.select() for switching
- Preserve existing accessibility patterns

**Phase 3 (ongoing):** Extract to shared library
- Move web components to mindlerui-web
- Standardize API across platforms
- Full Zag.js component coverage

---

### Component Migration Priority

| Priority | Component | Zag.js Package | Complexity |
|----------|-----------|---------------|------------|
| 1 | Modal/ActionModal | `@zag-js/dialog` | Medium |
| 2 | Sheet | `@zag-js/dialog` | Medium |
| 3 | DropdownPicker | `@zag-js/select` | High |
| 4 | TabBar | `@zag-js/tabs` | Low |
| 5 | ExpandableList | `@zag-js/accordion` | Low |
| 6 | CheckBox | `@zag-js/checkbox` | Low |
| 7 | RadioButton | `@zag-js/radio-group` | Low |
| 8 | ToastBanner | `@zag-js/toast` | Medium |
| 9 | Calendar | `@zag-js/date-picker` | High |

---

### Key Files to Modify

| File | Change |
|------|--------|
| `app.config.js` | Enable web platform |
| `metro.config.js` | Web bundling config |
| `package.json` | Add Zag.js deps, web polyfills |
| `mindlerui/Modal/` | Add web variant with Zag.js |
| `mindlerui/Sheet/` | Add web variant with Zag.js |
| `mindlerui/DropdownPicker/` | Add web variant with Zag.js |

---

## 10. React Strict DOM Analysis

### What is React Strict DOM (RSD)?

[React Strict DOM](https://facebook.github.io/react-strict-dom/) is Meta's library that standardizes React component development for web and native using **web APIs as the common interface**. It's the opposite approach from React Native Web.

**Key Concept:** Write web-like code (`<html.div>`, `<html.button>`) that runs on both web and React Native.

```typescript
import { html, css } from "react-strict-dom";

const styles = css.create({
  button: {
    backgroundColor: { default: "white", ":hover": "lightgray" },
    padding: 10
  }
});

// Works on web AND React Native
<html.button style={styles.button} onClick={handleClick}>
  Click me
</html.button>
```

### RSD vs Current Options Comparison

| Aspect | React Strict DOM | Expo Web + Zag.js (Option 4) |
|--------|-----------------|------------------------------|
| **Direction** | Web → Native (web-first) | Native → Web (native-first) |
| **Styling** | StyleX (must migrate) | styled-components (keep) |
| **Layout** | Flexbox only (no grid) | Full CSS on web |
| **Form controls** | Limited on native (no select, checkbox, radio) | Full Zag.js on web |
| **Gestures** | Basic polyfills | Full gesture-handler on native |
| **Meta support** | Direct investment | Community + Chakra team |
| **Production use** | facebook.com, Instagram VR | Zag.js used in Chakra UI |

### RSD Native Limitations (Critical for Mindler app)

❌ **Not supported on React Native:**
- `<select>`, `<option>` - your DropdownPicker won't work
- `<input type="checkbox/radio">` - form controls need workarounds
- `<dialog>` - Modal/Sheet patterns need custom implementation
- Grid layout - only flexbox
- `position: fixed/sticky`
- `onClick`, `onFocus`, `onBlur` event handlers (polyfilled, limited)
- Complex gestures (Sheet pan-to-dismiss)

✅ **Works well:**
- Basic elements (`div`, `span`, `button`, `input[text]`)
- Flexbox layout
- Core CSS (margin, padding, colors, transforms)
- Pseudo-states (`:hover`, `:focus`, `:active`) - polyfilled

### Pros of React Strict DOM

1. **Meta backing** - Direct investment, used in production at scale
2. **Future-proof** - Aligns with React Native's direction (Web API standardization)
3. **Single codebase** - True write-once, run-anywhere (within limits)
4. **Automatic codemods** - Meta has tooling to migrate React DOM → RSD
5. **Web-native quality** - Web apps render as real HTML/CSS, not RN abstractions
6. **StyleX optimization** - Atomic CSS, excellent performance

### Cons of React Strict DOM (for Mindler app)

1. **Styling migration required** - Must move from styled-components to StyleX
   - ~100+ components to rewrite styles
   - Different mental model (atomic CSS vs component CSS)
   - Design tokens need conversion

2. **Native limitations** - Your app is native-first with complex patterns:
   - Sheet with gesture-driven dismiss ❌
   - DropdownPicker with Picker component ❌
   - Calendar (react-native-calendars) ❌
   - Complex animations (Reanimated) - limited support

3. **Form controls gap** - RSD doesn't support:
   - `<select>` → your DropdownPicker needs custom RN fallback
   - Checkbox/Radio → need separate implementation
   - Date pickers → not covered

4. **Accessibility approach differs** - RSD uses DOM accessibility
   - Your existing `accessibilityRole`, `accessibilityState` patterns change
   - Would use ARIA attributes instead (web-first)

5. **Learning curve** - Team needs to learn:
   - StyleX syntax and patterns
   - RSD's subset of HTML/CSS
   - Platform-specific escape hatches

### When RSD Makes Sense

✅ **Good fit:**
- New projects starting from scratch
- Web-first apps adding mobile
- Simple UI without complex native features
- Teams already using StyleX

❌ **Poor fit (Mindler's situation):**
- Existing native-first app
- Complex native components (gestures, sheets, pickers)
- Heavy investment in styled-components
- Need full form control support

---

## 11. Updated Recommendation

### For Accessibility Testing on Web

**React Strict DOM is NOT recommended** for Mindler app because:
1. You'd need to rewrite all styling (styled-components → StyleX)
2. Your complex native components (Sheet, DropdownPicker) aren't supported
3. The app is native-first; RSD is web-first

**Better approach: Option 4 (Expo Web + Zag.js replacement)**

| Goal | RSD Approach | Zag.js Approach |
|------|-------------|-----------------|
| Get app on web | Major rewrite | Incremental |
| Keep styled-components | ❌ Must use StyleX | ✅ Works as-is |
| Sheet/Modal on web | ❌ Custom impl needed | ✅ @zag-js/dialog |
| DropdownPicker on web | ❌ No native select | ✅ @zag-js/select |
| Form accessibility | ❌ Limited | ✅ Full ARIA |
| Effort | 12-20 weeks | 6-10 weeks |

### Hybrid Consideration

**If you want RSD benefits long-term**, consider:

1. **Phase 1:** Use Expo Web + Zag.js for immediate web testing (6-10 weeks)
2. **Phase 2:** Evaluate RSD when:
   - React Native adds more web APIs natively
   - StyleX becomes more established
   - Your native component needs decrease
3. **Phase 3:** Gradual migration to RSD if/when it makes sense

### Summary Table

| Option | Effort | Keeps Styling | Native Components | Web A11y | Recommendation |
|--------|--------|---------------|-------------------|----------|----------------|
| RSD | 12-20 weeks | ❌ StyleX migration | ❌ Limited | ✅ Native DOM | Future consideration |
| Expo Web + Zag.js | 6-10 weeks | ✅ styled-components | ✅ Platform.select | ✅ Full Zag.js | **Recommended** |
| Separate Web App | 8-16 weeks | ✅ styled-components | N/A (web only) | ✅ Full Zag.js | If web becomes strategic |

---

---

## 12. FINAL PLAN: Universal App (Native + Web) with Zag.js

### Overview

Add web support to the Mindler app while **keeping native fully functional**. Use platform-specific files (`Component.web.tsx` / `Component.tsx`) so both platforms run optimally with their own implementations.

**Key Principle:** Native stays native, web gets proper web components with Zag.js.

### Phase 1: Enable Expo Web (2-3 weeks)

**Goal:** Get the app running in a browser while native continues working.

**Tasks:**
1. Configure Expo for web target
   - Update `app.config.js` with web platform settings
   - Configure `metro.config.js` for web bundling

2. Add web polyfills/aliases
   ```bash
   pnpm add -D @expo/metro-runtime react-native-web
   ```

3. Identify breaking dependencies
   - `react-native-calendars` → needs web alternative
   - `react-native-gesture-handler` → has web support
   - `react-native-reanimated` → has web support
   - `@react-native-picker/picker` → needs replacement

4. Create web entry point
   - `index.web.js` or configure through Expo

**Verification:**
- `npx expo start --web` launches app
- Basic navigation works
- Identify components that break

### Phase 2: Zag.js Component Replacements (4-6 weeks)

**Goal:** Replace key interactive components with Zag.js versions for web.

**Dependencies to add:**
```bash
pnpm add @zag-js/react @zag-js/dialog @zag-js/select @zag-js/tabs @zag-js/accordion @zag-js/checkbox @zag-js/radio-group @zag-js/toast
```

**Component Migration Order:**

#### 2.1 Modal/ActionModal → @zag-js/dialog (Week 1)
```typescript
// mindlerui/Modal/Modal.web.tsx
import * as dialog from "@zag-js/dialog";
import { useMachine, normalizeProps } from "@zag-js/react";

export function Modal({ open, onClose, children }) {
  const service = useMachine(dialog.machine, {
    id: useId(),
    open,
    onOpenChange: ({ open }) => !open && onClose?.(),
  });
  const api = dialog.connect(service, normalizeProps);
  // ... render with proper ARIA
}
```

#### 2.2 Sheet → @zag-js/dialog (drawer) (Week 1-2)
- Web version uses dialog with slide-in animation
- Keep native version with gesture handler

#### 2.3 DropdownPicker → @zag-js/select (Week 2-3)
```typescript
// mindlerui/DropdownPicker/DropdownPicker.web.tsx
import * as select from "@zag-js/select";
// Full keyboard navigation, ARIA combobox pattern
```

#### 2.4 TabBar → @zag-js/tabs (Week 3)
- Keyboard navigation (Arrow keys)
- Proper ARIA tablist/tab/tabpanel

#### 2.5 ExpandableList → @zag-js/accordion (Week 3-4)
- Keyboard navigation
- ARIA expanded states

#### 2.6 CheckBox/RadioButton → @zag-js/checkbox, radio-group (Week 4)
- Proper form integration
- Group management for radio buttons

#### 2.7 ToastBanner → @zag-js/toast (Week 4-5)
- Live region announcements
- Proper dismiss handling

**File Structure Pattern:**

Metro/Expo automatically resolves platform-specific files. No manual Platform.select needed!

```
mindlerui/Modal/
├── Modal.tsx          # Native implementation (existing, unchanged)
├── Modal.web.tsx      # Web implementation (new, uses Zag.js)
├── Modal.types.ts     # Shared types
└── index.ts           # Just re-exports
```

```typescript
// mindlerui/Modal/index.ts
// Metro automatically picks Modal.web.tsx for web, Modal.tsx for native
export { Modal } from "./Modal";
export type { ModalProps } from "./Modal.types";
```

**How it works:**
- `npx expo start --web` → Metro loads `Modal.web.tsx`
- `npx expo start --ios` → Metro loads `Modal.tsx`
- Native code stays **100% unchanged**

**Same API, different implementations:**
```typescript
// App code works on BOTH platforms - no changes needed
import { Modal } from "@mindlercare/mindlerui";

<Modal
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Action"
>
  <Text>Are you sure?</Text>
</Modal>

// On native: Uses existing RN Modal + Reanimated
// On web: Uses Zag.js dialog with proper ARIA
```

### Phase 3: Testing & Polish (2-3 weeks)

**Accessibility Testing:**
1. Run axe-core on web version
2. Test with VoiceOver/NVDA
3. Keyboard navigation testing
4. Focus management verification

**Commands:**
```bash
# Existing Storybook a11y testing
yarn test-storybook:a11y

# Manual testing
npx expo start --web
```

**Integration Testing:**
- Verify all screens render
- Test navigation flows
- Form submissions work
- API calls function correctly

### Files to Create/Modify

**Config files:**
| File | Action |
|------|--------|
| `app.config.js` | Add web platform config |
| `metro.config.js` | Web bundling configuration |
| `package.json` | Add Zag.js dependencies |

**New web-specific components (native files UNCHANGED):**
| New File | Native File (unchanged) | Zag.js Package |
|----------|------------------------|----------------|
| `mindlerui/Modal/Modal.web.tsx` | `Modal.tsx` ✓ | `@zag-js/dialog` |
| `mindlerui/Sheet/Sheet.web.tsx` | `Sheet.tsx` ✓ | `@zag-js/dialog` |
| `mindlerui/DropdownPicker/DropdownPicker.web.tsx` | `DropdownPicker.tsx` ✓ | `@zag-js/select` |
| `mindlerui/TabBar/TabBar.web.tsx` | `TabBar.tsx` ✓ | `@zag-js/tabs` |
| `mindlerui/ExpandableList/ExpandableList.web.tsx` | `ExpandableList.tsx` ✓ | `@zag-js/accordion` |
| `mindlerui/CheckBox/CheckBox.web.tsx` | `CheckBox.tsx` ✓ | `@zag-js/checkbox` |
| `mindlerui/RadioButton/RadioButton.web.tsx` | `RadioButton.tsx` ✓ | `@zag-js/radio-group` |
| `mindlerui/ToastBanner/ToastBanner.web.tsx` | `ToastBanner.tsx` ✓ | `@zag-js/toast` |

**Shared types (extract if needed):**
| File | Purpose |
|------|---------|
| `mindlerui/Modal/Modal.types.ts` | Shared props interface |
| `mindlerui/Sheet/Sheet.types.ts` | Shared props interface |
| etc. | Same API contract for both platforms |

### Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | 2-3 weeks | App runs on web (with broken components) |
| Phase 2 | 4-6 weeks | Key components work with Zag.js |
| Phase 3 | 2-3 weeks | Accessibility tested, polished |
| **Total** | **8-12 weeks** | Production-ready web version |

### Success Criteria

**Native (must remain working):**
1. ✅ `npx expo start --ios` / `--android` works as before
2. ✅ All existing native tests pass
3. ✅ No regressions in native components

**Web (new):**
4. ✅ App loads in browser via `npx expo start --web`
5. ✅ All main screens render correctly
6. ✅ Modal/Sheet opens and closes with proper focus trap
7. ✅ DropdownPicker is keyboard navigable (Arrow keys, Enter, Escape)
8. ✅ TabBar supports Arrow key navigation
9. ✅ Forms are accessible (labels, error states, validation)
10. ✅ axe-core reports no critical violations
11. ✅ Screen reader testing passes (VoiceOver/NVDA)

**Both platforms:**
12. ✅ Same API/props work on both platforms
13. ✅ Shared types ensure consistency

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| API drift between platforms | Shared types file (`*.types.ts`) enforces same props |
| Some RN packages don't support web | `.web.tsx` files use web alternatives |
| Bundle size (web includes Zag.js) | Tree-shake unused Zag.js machines |
| Styling differences web vs native | styled-components works on both |
| Navigation edge cases | react-navigation has good web support |
| Maintaining two implementations | Shared types + tests ensure parity |
| Breaking native during web work | Run native tests in CI for every PR |

---

## Sources

- [React Strict DOM Official Docs](https://facebook.github.io/react-strict-dom/)
- [React Strict DOM GitHub](https://github.com/facebook/react-strict-dom)
- [RSD Production Readiness Discussion](https://github.com/facebook/react-strict-dom/discussions/270)
- [React Strict DOM vs RN Web 2025](https://shift.infinite.red/react-strict-dom-vs-react-native-for-web-in-2025-bb91582ef261)
- [RSD: Future of Universal Apps](https://blog.theodo.com/2024/04/react-strict-dom-react-native-web/)
- [React Native Core Contributor Summit 2024](https://reactnative.dev/blog/2025/02/03/react-native-core-contributor-summit-2024)
