# Effect Hierarchy: From Code to Architecture

## Goal

Define a conceptual model for **hierarchical effects** that bridges:
- Low-level code effects (FunctionCall, Store, Retrieve, Send)
- UI interaction effects (from accessibility tree / XState paths)
- High-level domain effects (ChargePayment, AuthenticateUser)
- Architecture documentation (C4 diagrams)

## Current State

DevAC extracts low-level effects from code AST. We have:
- Effect types: FunctionCall, Store, Retrieve, Send, Request, Response, Group
- Rules engine that classifies effects into domain effects
- C4 generation from effects (architecture.c4)
- Quality loop comparing generated .c4 with human-validated .md (ADR-0031)

## The Gap

The path from **code effects → domain effects → architecture** requires manual rule writing. We want to make this more deterministic by:
1. Discovering effect hierarchies from code structure
2. Discovering interaction patterns from UI (a11y tree, XState paths)
3. Composing low-level effects into higher-level effects automatically
4. Reducing friction in the architecture improvement loop

## Questions to Answer (Concepts Only, No Implementation)

### 1. Effect Composition
How do low-level effects compose into domain effects?
- What patterns indicate "ChargePayment" vs individual DB + HTTP calls?
- Can we infer composition from call graphs?

### 2. UI Effects
How do UI interactions map to the effect model?
- Accessibility tree → available interactions → state transitions
- XState machine traversal → effect sequences
- How does this connect to code effects?

### 3. Hierarchy Levels
What are the natural abstraction layers?
- Code level: FunctionCall, Store, Retrieve
- Domain level: ChargePayment, SendNotification
- Architecture level: PaymentService, NotificationService
- UI level: UserFlow, InteractionSequence

### 4. Deterministic Path
How can we reduce LLM reasoning in the loop?
- What can be computed deterministically?
- What requires human/LLM judgment?
- Where are the boundaries?

## Constraints

- Build on existing effect types and rules engine
- Concepts first, implementation later
- Must work for both code analysis and runtime discovery
- Must support the architecture.md ↔ architecture.c4 improvement loop

## Output Expected

A conceptual framework document explaining:
- Effect hierarchy levels and their relationships
- Composition rules (how lower effects become higher effects)
- Where UI effects fit in the model
- What becomes deterministic vs what remains reasoning

## Related Issues

- Issue #189: XState + A11y static analysis
- Issue #191: Browser-MCP + XState runtime discovery
- ADR-0031: Architecture Documentation Quality Improvement Loop
