# high level concepts

status: this intent is in the scribble phase

we want to create the outer high level concepts to get better insight and overview of the technical and logical creation environment we are creating.

first text statements to ground us more and more from several research sessions.

then to make sure we understand each other the diagrams making sure we have a clean set of Concepts that we can see, understand, reason and discuss.

## Sketch brainstorm

SessionHarness 
- SessionContext with
  - layers of context-fragments maintained by interactions with partitioners 
  - context-fragments use progressive-disclosure to more context
  - progressive-disclosure are projections from dAtoms using
    - front-matter to identify the context for quick analysis 
    - markdown-text with standard markdown hierarchy 
    - markdown-references: descriptive named links to other documents
- Improvement lifeCycle

Container:
                Surface
              |         ^
              | Improve |
              v         |
      Projection<=>effectHandler
              ^         |
              |         V
              Researcher

Contracts at the boundaries


Make Surface available to see and use and make runtime behaviour available for query as improvement input

research is update our knowledge by reasoning on where to search for what we want to know

query is 
- code
- template classifier - code
- reasoning - novel template+code

retrieve
- context
- dAtom hot, warm, frozen optimised for the query KV, Relational, Graph, Vector, FTS, Document
- web search -> dAtoms


## Statements

System uses P2P streams between Systems with Containers/Actor-systems with Component/Actors with Functions

Actors can be LLMAgent with skills + Agent virtual machine

Where Systems, Containers, Components host effectHandlers (provide a runtime environment).
Where Actor-systems and Actors and Functions are all effectHandlers

dAtoms can reference content addressable Documents including #chapter, so FileSystem needs a definition and some thoughts (WorkSpace, IPFS, HyperCore, ....)

Api is typescript

Intent should be optimized to prefer reference or query (Projection) as progressive disclosure to avoid token tax similar to not bloating context memory by referencing files with more detailed information.

Intent is prompt for Actor with llm model and Tools effectHandlers all using dAtoms

Runner/Runtime/BridgeWrapper as Concept or is that an effectHandler itself with shell access and implicit OS-container or CloudFlare worker idea, or reframed we have Tools and Bridges and WebSearch and FileSystem and Shell commands that need a clean definition as that needs work.

Session as universal Concept for interaction between Human, AI and System.

Multi-agent primitives. SequentialAgent, ParallelAgent, and LoopAgent are first-class abstractions. Make sure Error handling is a first class thing as already defined

OpenCode loop:
 state = init_task_state(request)
 while not state.done:
   prompt = build_prompt(state)
   response = call_llm(prompt)
   actions = parse_actions(response)
   state = apply_actions(state, actions)
   stream_updates(state)

LLM response tool call to call effectHandlers

levels of viewing ViViEf at the total Concept level

prompt - plan - stateMachine
  "Delegation Classification Organiser Categorizer" effectHandler builds prompt 
  => categorize => template(prompt) => [effectHandler(prompt)]

The concept of dispatching to a set of agents (sequentially, in parallel, or looping) is a first-class abstraction.

Meaning we use prompt to actor-system categorisation by local models or fallback to reasoning models

determine the level of research that we should put into it
- research(how much)
- plan
- categorise
==> plan can be templated can include the effectHandlers => dispatch

code analysis is research as dAtoms to query by code, sql, vector search, fts, ... plus Surfaces (text Bubbles, Components)

the idea to ask an actor-system how confident they are that they can handle a intent.
So ask who wants and can handle this and what does it cost.
so if they are confident enough we dispatch to them, otherwise we fallback to asking a different actor-system.
