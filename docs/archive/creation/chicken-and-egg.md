# Intent: The Design-Implement Balance (Archived)

**Status**: Archived 2026-04-09 — meta-observation internalized in docs lifecycle model (intent→contract→fact).

## The problem

Vivief is about creation. Creating vivief IS using vivief's creation loop. We want to design but need to implement to iterate. We need to implement but need design to know what to build.

## Current approach

Design and implement simultaneously:
- DatomStore implementation informs datom concept refinement
- P2P brainstorms inform Projection delivery modes
- Security brainstorms inform Contract enforcement
- Each spike/prototype either validates or challenges the concepts

## The docs as first artifact

The documentation restructuring (intent/contract/fact) is itself the creation loop in action:
- Brainstorms start as **intents**
- Decisions get promoted to **contracts**
- Implementations become **facts**
- Facts that don't match contracts trigger new intents

## Open questions

- When should we spike before specifying? When specify before spiking?
- How do we keep the creation loop turning without either side blocking?
- Can the datom store itself track the evolution of concepts? (meta-creation)

## Related

- `intent/creation/creation-is-what-we-do.md` — The thesis that everything is creation
- `intent/creation/developer-flow.md` — Developer workflow concepts
- `story/arc.md` — The narrative of how this unfolded
