# ViViEf prompts 

This is file is used to create and edit prompts snippets for pasting into llm chats.

## review test code

can you do a very thorough review of the current tests in the vivief repo
are the tests complete and covering all edge cases?
is the balence between unit integration and e2e tests correct?

are we testing all edge cases for the ast processing for all languages we currently support?

then create a plan to address the issues you found

## check for specific models to determine the quality of what we have

a bit of background intro:
we just extracted the code from the CodeGraph repo src/devac-v2 code together with claude opus, we extended the test and fixed the docs.
The devac-v2 code came from the devac in the ~/ws/CodeGraph repo context were it went through a lot of research before we picked up the Ast level extraction for several languages with a neo4j graph database into the cleaner simpler context of this vevief repo (where we structured it as a proper turbo repo pnpm monorepo).

we would like the know the quality of the code, its test and the documentation and the general repo structure and tooling we have in place to be able to maintain and extend this codebase in the future.
the context is that we want to determine if this is a good base for further future extension we have planned to enable llm's and humans to query code and content in a more powerful way.

can you do a very thorough review of the current vivief repo based on the above context
create is as docs/reviews/quality-review-gemini.md

-------------------------------------------------------------------
WiP brainstorm level prompts

We want Graph, Relational, KeyValue, FullText, Vector, TimeSeries OTel Spans support 
if an light maintainable and fast way.
to enable any question to be supported by the appropriate tech to get the data needed in a deterministic way with the need for scanning the source data is hap hazard ways without the confidence of being complete. 
the idea is that gathering the complete set of thruth from the implementation themself will be usefull to get higher trust in the answers because we know all the data is available with the best way to access it.

sources are git repos, company documents, infra structure from cloud providers, ci/cd pipelines, monitoring data from otel traces and metrics, apm data, logs, etc.

storing these sources in a form that is queryable and connected to each other in a way that allows us to get the complete picture of the system and its behavior.

current technology stack
- duckdb/parquet for relational data

- milvus/weaviate for vector data
- elasticsearch for full text search
- neo4j/arangodb for graph data
- redis/rocksdb for key value data
- otel collector + jaeger/tempo for tracing data
- prometheus/loki for metrics and logs

to construct the answers

answers can be presented
- as prompts to tell what is needed to be done
- documentation to explain why how what when in the appropriate format
- code snippets to implement the needed functionality
- test cases to verify the implementation is correct
- diagrams to illustrate the architecture or flow
- data schemas to define how the data is stored and accessed
- configs to setup the necessary tools and environments
- scripts to automate repetitive tasks
- commands to execute specific actions in the system
- queries to retrieve or manipulate data in the system
- reports to summarize findings or results

## prepare for Effects integration

- work on determining generic Ast and Effects 


# CodeGraph: Universal AST + Effects System Design

## Background
CodeGraph/DevAC is a code intelligence platform. Current state:
- Multi-language parsing (TS, Python, C#, C, C++, Java, Go)
- Two-tier parsing: tree-sitter (fast) + compiler-grade (quality)
- Adding Swift, Kotlin, Objective-C support

## Design Challenge
Create a universal representation with two complementary layers:

### Layer 1: Universal AST (Structural)
- ~50-80 normalized node types shared across languages
- Language-specific extension point for non-universal constructs
- Preserves source locations and native AST references

### Layer 2: Effect Graph (Behavioral)
Based on the functional pattern:
effectHandler = (state, effect) => (state', [effect'])

Effect categories to consider:
- State: Read, Write, Allocate
- Control: Branch, Loop, Return, Throw/Catch
- IO: HTTP, Database, FileSystem, Console
- Concurrency: Spawn, Await, Lock, Send/Receive
- Calls: expanding to callee's effects

## Your Task
1. Explore the current codebase structure
2. Identify where universal AST transformation would fit
3. Design the effect extraction pipeline
4. Propose schema for storing both in our DuckDB/Parquet architecture
5. Create implementation plan

## Constraints
- Must support incremental updates (file-level granularity)
- Effect extraction should be language-specific, but effect graph is universal
- Query layer should work identically regardless of source language