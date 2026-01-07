<!--
  devac:seed-hash: c57fe6b5285eeb0fdaa71b737338af7c6defed8dba6a3ed67668e03e6b54f198
  devac:generated-at: 2026-01-06T21:25:45.838Z
  devac:generator: doc-sync@1.0.0
  devac:verified: false
  devac:package-path: /Users/grop/ws/vivief/packages/fixtures-typescript
-->

# Package Effects: fixtures-typescript
<!--
  This file defines effect mappings for this package.
  Run `devac effects sync` to regenerate extraction rules.
  Run `devac effects verify` to check for unmapped patterns.
  Run `devac doc-sync` to regenerate after verification.
  
  Review and refine the mappings below.
-->
## Metadata
- **Package:** fixtures-typescript
- **Last Updated:** 2026-01-06
- **Verified:** ✗
## Store Operations
<!-- Pattern → Store effect mapping -->
_No store patterns detected. Add manually if needed._

## Retrieve Operations
<!-- Pattern → Retrieve effect mapping -->
_No retrieve patterns detected. Add manually if needed._

## External Calls
<!-- Pattern → Send effect mapping -->
| Pattern | Send Type | Service | Third Party | Module | Count |
|---------|-----------|---------|-------------|--------|-------|
| `useCallback` | external | external | true | react | 2 |
| `useState` | external | external | true | react | 2 |
| `path.join` | external | external | true | node:path | 2 |
| `React.useContext` | external | external | true | react | 1 |
| `React.createContext` | external | external | true | react | 1 |
| `React.forwardRef` | external | external | true | react | 1 |
| `useMemo` | external | external | true | react | 1 |
| `useEffect` | external | external | true | react | 1 |
| `fileURLToPath` | external | external | true | node:url | 1 |
| `path.dirname` | external | external | true | node:path | 1 |
| `readFile` | external | external | true | node:fs/promises | 1 |

## Other Patterns
<!-- Review these and categorize as needed -->
| Pattern | Method Call | Async | Count | Suggested Category |
|---------|-------------|-------|-------|-------------------|
| `console.log` | yes | no | 26 | ignore |
| `Error` | no | no | 12 | - |
| `super` | no | no | 5 | - |
| `Map` | no | no | 4 | - |
| `Symbol` | no | no | 4 | - |
| `this.setState` | yes | no | 3 | store? |
| `Array.isArray` | yes | no | 3 | - |
| `Throttle` | no | no | 3 | - |
| `Injectable` | no | no | 3 | - |
| `originalMethod.apply` | yes | yes | 3 | - |
| `toString` | no | no | 3 | - |
| `items.map` | yes | no | 2 | - |
| `setCount` | no | no | 2 | store? |
| `email.includes` | yes | no | 2 | - |
| `Reflect.defineMetadata` | yes | no | 2 | - |
| `Object.defineProperty` | yes | no | 2 | - |
| `Date.now` | yes | no | 2 | - |
| `Buffer.from` | yes | no | 2 | - |
| `Result` | no | no | 2 | - |
| `this.props.render` | yes | no | 1 | - |
| `setIsEven` | no | no | 1 | store? |
| `renderItem` | no | no | 1 | - |
| `keyExtractor` | no | no | 1 | - |
| `user.email.includes` | yes | no | 1 | - |
| `this.users.forEach` | yes | no | 1 | - |
| `UserService` | no | no | 1 | - |
| `this.users.get` | yes | no | 1 | retrieve? |
| `compose` | no | no | 1 | - |
| `decorator` | no | no | 1 | - |
| `decorators.reduceRight` | yes | no | 1 | - |
| _...and 54 more_ | | | | |

## Groups
<!-- Architectural grouping for C4 -->
| Name | Group Type | Technology | Parent | Description |
|------|------------|------------|--------|-------------|
| fixtures-typescript | Container | typescript | - | TODO: Add description |
