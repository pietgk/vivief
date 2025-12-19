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

## ci updates

the ci workflow build went ok, the release action failed can we plan a fix for it
also it seems that the C# tests did not run can you have a look at it, it might be that we need to plan supporting dotnet in the ci 
also it seems that it is easy to forget adding a changelog entry, lets see if we need to improve our workflow to avoid missing adding a changeset. 
what options would be available to make committing the changes with a correct commit message, making sure the changelog is correctly handled and that the ADR check is handled. currently the advice is to tell you (claude) to check this. but it is so easy to forget this. what would be a good solution to make this a better developer experience. maybe create a command or tool or skill or hook  so lets determine what is wise

## entity id and repo name dependency

can we have a thorough look at the way entityid is using the repo name.
   when we run tests inside repo vivief and create snapshots
   and then run the snapshot test in a github worktree with a different directory name
   the entityid is different. we need to find a structural way to make the repo name
   not dependent on the directory name.
   
   
   
## doc update 

the current documentation on how to install devac-cli is outdated and does not explain installing it from the repo locally.

also using hte github packages release of devac-cli and devac-mcp is not documented

we now have a release (See https://github.com/pietgk/vivief/pkgs/npm/devac-cli and https://github.com/pietgk/vivief/pkgs/npm/devac-mcp) that enables installing devac-cli and devac-mcp from github packages. 
you can reference their readme with documentation to get context that can be used or referenced by you in the to be created doc.

a main use of this repo is to be able to analyse code bases locally with the devac-cli tool and use of the devac-mcp with claude code cli or copilot cli or github copilot chat to ask questions about the code base using the devac-mcp to get more extensive and better answers

can we plan and create a start-asking-about-your-code-guide.md in the docs with step by step instructions to get started with analysing a code base and asking questions about it using the devac-cli and devac-mcp tools together with an llm tool like claude code cli or github copilot chat.
Starting point is a directory with cloned repos where the developer is working on.
So we start with nothing installed, explain installing the needed tools, instruct to have a workspace directory (use ~/ws as example) where the code bases are cloned, then explain how to analyse a code base with devac-cli, then how to start the devac-mcp server for that code base, then how to connect an llm tool like claude code cli or github copilot chat to the mcp server and then how to ask questions about the code base.

example questions we can use are:

give me a high level system diagram of the complete code base using the c4 model concepts as a markdown file.

what communication channels are used to contact the users of this code base.

## combine worktree and devac hub concepts

what repo contains the issue, we have a bit of a mismatch with issues per repo and we have a bit of a concepts that issues can be about multiple repos. we need to be more explicit that issues are inside a repo.

starting claude is no longer needed (so lets make the default that we do not start claude cli) as we only need 1 claude session that is started in the repos parent dir when we want to work on 1 or more repos in a flexible way.
TODO determine how it works now first, also see resume and usefullness of issue-context.md 
as without the need for starting claude the worktree concept is less needed as we can just use the parent dir context to work on multiple repos naturally and claude /commands are valid again without the cwd issue that started the idea that we needed devac-worktree. 

the deterministic flow could we nicer than /commands so we need to try both.

i do not understand devac-worktree --repos option.

we need to determine why we need ~/.devac/worktrees.json



devac context icons are not explained what do they mean? needs to be added to the --help.

current review generates the prompt for copy paste.
review does not support specifying the models that should perform the review, the original idea suggested using copilot cli with --model support ("claude-opus-4.5", "gpt-5.1-codex-max", "gemini-3-pro-preview")
this to enable comparing the results from different models to determine which model gives the best results for specific tasks.
also add focus areas to also include plan, code, pr and doc.
this needs a seperate issue to see what we want.

we need better watch support and docs and determining how it should work
watch is now per repo.

## search extensions

### Vision View Effect 

effectHandler = (State, Effect) => (State', [Effect'])

with proper higher level effects grouped into categories like IO.HTTP

### Hybrid Search (FTS + Vector)
For situations where queries are vague or documents contain overlapping keywords with semantic differences, a hybrid search approach combining full-text search with vector embeddings works well. MotherDuck
This is useful for RAG pipelines — you can combine BM25 scores with vector similarity using reciprocal rank fusion.
Important Caveat
The FTS index is built on a table, not directly on a Parquet file. So you need to:

Load the Parquet into a table
Create the index on that table

The index lives in DuckDB's storage, not in the Parquet file itself. If you need persistent FTS across sessions, use a DuckDB database file rather than in-memory.

## extraction extensions

### jira-cli (already a gh issue)

### aws, gcloud, azure infra extraction to get the infrastructure as code and the current state of the infrastructure

### cms systems from their backup json data export (contentfull, etc)

### Datadoc

Dogshell — General API access
A wrapper for the Datadog API that comes with the official datadogpy Python library. It lets you use the Datadog API from the command line. Datadog
bashpip install datadog

# Configure ~/.dogrc
[Connection]
apikey = MY_API_KEY
appkey = MY_APP_KEY
Commands:
bashdog metric post my_metric 1.0 --tags "env:prod"
dog event post "Deployment" "v1.2.3 deployed"
dog monitor show 12345


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
