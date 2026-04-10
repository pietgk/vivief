# The Markdown file challenge of vector databases

from https://medium.com/@Micheal-Lanham/the-markdown-file-that-beat-a-50m-vector-database-38e1f5113cbe

Three of the most successful AI agent platforms in production right now store memory the same way you store grocery lists. Here’s why that’s not as crazy as it sounds.

I spent the last two weeks pulling apart the architectures of Manus, OpenClaw, and Claude Code. These aren’t weekend hobby projects. Manus hit $100M in ARR eight months after launch and got acquired by Meta for somewhere in the $2–3B range. Claude Code’s run-rate revenue crossed $2.5B in February 2026. OpenClaw has over 310,000 GitHub stars.

All three of them use plain Markdown files as their primary memory system. Not a managed vector database. Not a $50M infrastructure product. Markdown files.

What You’ll Learn in This Article:

The Convergence Pattern: Why three independent, production-scale agent systems all landed on file-based memory
The Context Engineering Logic: How Manus turned “filesystem as context” into a unit-economics strategy that saves real money
The Hybrid Architecture: How OpenClaw layers semantic retrieval on top of Markdown without handing authority to an external database
The Equilibrium Point: Where files stop working and when you actually need a database (it’s later than you think)
Press enter or click to view image in full size

Three Teams, One Weird Trick
Here’s what makes this interesting. These three projects didn’t copy each other. They arrived at the same pattern independently, solving different problems for different users.

Manus is a consumer-facing AI agent that handles complex multi-step tasks. OpenClaw is an open-source personal AI assistant. Claude Code is Anthropic’s official coding agent. Different teams. Different codebases. Different business models.

But crack open their architectures and you find the same core idea: the filesystem is the memory layer. The model reads and writes plain files (usually Markdown), and those files are the durable, inspectable record of what the agent knows and what it’s doing.

Press enter or click to view image in full size

A DEV Community article by Yaohua Chen coined this “convergent evolution,” and the framing stuck. But the more useful question isn’t “isn’t that neat?” It’s “why does this keep happening?”

The answer lives in how LLMs actually work, and in the economics of running them at scale.

Press enter or click to view image in full size

Manus: The $100M Proof That Files Are a Business Strategy
Manus is the most interesting case because its team actually published why they chose files over databases. In a July 2025 engineering post, Manus co-founder Yichao “Peak” Ji laid out the logic with unusual candor.

The core insight: Manus processes an average of 100 input tokens for every 1 output token. That ratio makes input cost the dominant variable. And the price difference between cached and uncached input tokens on Claude Sonnet is roughly 10x (about $0.30 vs $3 per million tokens).

That single number explains almost everything about Manus’s architecture decisions.

When your input-to-output ratio is 100:1 and cached tokens cost one-tenth as much, you want stable, predictable prompt prefixes. You want append-only context. You want your memory system to play nicely with KV-cache hit rates. These aren’t style preferences. They’re unit economics.

Press enter or click to view image in full size

todo.md: Memory and Attention Control in One File
Press enter or click to view image in full size

Manus averages about 50 tool calls per task. That’s a long chain of actions, and LLMs famously struggle with “lost-in-the-middle” effects where information in the center of a long context gets ignored.

Manus’s solution is elegant: they generate and repeatedly update a todo.md checklist during complex tasks. Every time the agent finishes a step, it rewrites the todo file and that rewrite puts the current plan into the most recent part of the context window, right where the model pays the most attention.

This is a subtle but important point. The Markdown file isn’t just storing information. It’s shaping attention. A database-backed RAG system can retrieve facts, but it doesn’t solve the “keep the plan hot” problem unless you also build an explicit planning artifact that gets reintroduced into recent context. Manus is doing exactly that, with a text file.

The leaked Manus system prompts (a widely circulated GitHub gist with over 2,500 stars) confirm this from an independent angle. The prompts include explicit rules requiring the agent to create todo.md as a checklist and update it immediately after completing each item. They also instruct the agent to save intermediate results and keep different reference information in separate files.

Even if you’re skeptical of marketing narratives, the operational prompts tell the same story: file-writing discipline is baked into the harness.

Press enter or click to view image in full size

OpenClaw: Adding Retrieval Without Surrendering Control
If Manus is the “pure file” case, OpenClaw shows what the next step looks like. It keeps Markdown as the canonical memory surface but layers semantic retrieval on top, all without requiring an external managed vector database.

The Memory Layout
OpenClaw’s memory system uses two kinds of files:

MEMORY.md holds durable, curated information (the stuff the agent should always know)
Dated files in memory/YYYY-MM-DD.md capture day-to-day notes
This is “memory as documentation.” A human can open these files, read them, edit them, and version-control them with Git. Try doing that with a vector database.

The Compaction Problem (and Why It Matters More Than Embeddings)
OpenClaw surfaces a production concern that most “just use a database” arguments gloss over: what happens when the context window fills up?

OpenClaw implements an automatic memory flush. When the session nears its context limit, the system triggers a silent agent turn that tells the model to write durable memories to the memory files before compaction truncates the conversation history.

This is practical evidence that the core problem isn’t “where do I store embeddings?” It’s “how do I preserve state across compaction boundaries?” Files solve that directly. The agent writes what it needs to remember, and the next session reads it back.

Press enter or click to view image in full size

The Semantic Layer (Built on Top of Files, Not Instead of Them)
Here’s where OpenClaw gets interesting for the “but what about vector search?” crowd.

OpenClaw can build a small vector index over its Markdown memory files. But the key word is “over.” The files are the source of truth. The vector index is a derived capability for finding notes when keyword search falls short.

It works with both remote embeddings and local ones, and it uses sqlite-vec to run vector search inside SQLite. No managed infrastructure. No external database. Just local files with an optional retrieval layer bolted on.

OpenClaw even includes hybrid retrieval with explicit tuning knobs: a vectorWeight of 0.7 and textWeight of 0.3 by default, plus MMR-style diversification to reduce redundant results and temporal decay (with a configurable half-life) so stale notes don't outrank fresh ones.

This is a mature, production-aware design. It acknowledges that pure keyword search breaks on paraphrases and synonyms. But it solves that problem by indexing the existing files, not by replacing them with a database.

Press enter or click to view image in full size

Claude Code: When the Vendor Ships the Pattern
Claude Code matters because it turns the Markdown memory pattern from a community convention into a documented product feature.

CLAUDE.md: Hierarchical Instructions Without a Database
Claude Code’s memory system centers on CLAUDE.md files that contain persistent instructions, rules, workflows, and project architecture notes. The model reads these at the start of every session.

The clever part is the hierarchy:

Managed policy instructions (OS-specific system locations) for org-wide rules
Project instructions (./CLAUDE.md) shared via source control
User instructions (~/.claude/CLAUDE.md) for personal preferences
Directory-level files that load on demand when Claude reads files in subdirectories
This is progressive disclosure. Instead of dumping everything into context at startup, the system loads what’s relevant based on scope. No vector database required for this kind of “retrieval.” The filesystem’s directory structure is the retrieval mechanism.

Press enter or click to view image in full size

One Important Correction
Anthropic’s blog post describes CLAUDE.md as becoming “part of the system prompt.” But the actual docs are more precise: CLAUDE.md content gets delivered as a user message after the system prompt, not inside it. It’s context, not enforced configuration.

This matters because it changes what “memory” means operationally. The file isn’t a magic enforcement boundary. It’s a standardized context channel that needs to be kept concise and consistent to work well. Anthropic even recommends keeping each CLAUDE.md under about 200 lines and periodically removing contradictions.

Auto-Memory: A Capped, File-Based Second Brain
Claude Code also maintains an auto-memory directory per project at ~/.claude/projects/<project>/memory/ with a MEMORY.md file and optional topic files. Only the first 200 lines of MEMORY.md load at session start. Topic files load on demand.

This is a vendor-designed answer to the “memory file grows without bound” critique. Instead of pretending infinite memory is free, Claude Code imposes a hard cap on the always-loaded index and encourages spillover into topic files. It’s a simple, practical constraint that sidesteps the scaling problem most “just use Markdown” arguments ignore.

Press enter or click to view image in full size

Where Markdown Files Actually Fail
I’d be doing you a disservice if I pretended files solve everything. They don’t. The honest version of this thesis is narrower and more useful: for single-user or single-threaded agent workflows (especially local coding agents), file-based memory delivers disproportionate value because it aligns with how LLMs work and what they cost to run.

But there are real failure modes.

Context budget pressure. Claude Code explicitly warns that CLAUDE.md consumes tokens every session and that overly large files reduce adherence. Files work until they get bloated and internally contradictory.

Concurrency. The moment multiple agents or users need to touch the same memory, concurrent file writes can corrupt data. You need database guarantees (atomicity, isolation, coordination) at that point. This isn’t even about Markdown vs. databases. It’s about filesystems vs. databases, and databases win under concurrent access.

Semantic retrieval at scale. Grep and keyword search break on paraphrases and synonyms. As your knowledge base grows, vector search becomes necessary, not optional. OpenClaw’s hybrid mode is a pragmatic acknowledgement of this.

Cache invalidation costs. Manus discovered that some “clever” dynamic behaviors, like adding and removing tools mid-iteration, actually degrade performance by invalidating KV caches and confusing the model. Not all complexity buys you capability. Some just buys you higher bills.

Press enter or click to view image in full size

The Equilibrium Architecture
The evidence from these three systems points to a likely equilibrium that’s more useful than “files vs. databases”:

Press enter or click to view image in full size

Files (usually Markdown) as the primary interface. Plans, conventions, learnings, and instructions live in human-readable, version-controllable text files. This is the layer the model and the human both interact with directly.

Aggressive offloading to disk. Large tool outputs get saved as files with restorable references (paths, URLs) so context can shrink without information loss. Manus calls this the “Context Window = RAM, Filesystem = disk” model.

Derived retrieval layers. When scale demands semantic search, you build an index over the files. OpenClaw does this with SQLite and sqlite-vec. The files remain the source of truth. The index is a search optimization.

Clear escalation paths. When memory needs to be shared and correct under concurrent access, you move the substrate to a database. But even then, the agent-facing interface can still look like “files in a folder.”

This isn’t a radical position. It’s just saying: start with the simplest thing that works, and add infrastructure when the operational demands force you to. For a huge class of agent workflows right now, the simplest thing that works is a Markdown file.

Press enter or click to view image in full size

What This Means for the Vector Database Market
The awkward question for VC-funded memory infrastructure is real. But the funding picture doesn’t collapse under this thesis. It bifurcates.

Memory-layer startups like Mem0 ($24M raised), Letta ($10M seed at a $70M valuation), and Zep (whose Graphiti project crossed 20,000 GitHub stars) are specifically solving the parts that file-first systems struggle with: durability across deployments, user-level personalization, retrieval at scale, governance, and enterprise controls.

Meanwhile, vector search is becoming a commodity feature. Survey data shows adoption climbing steadily, with vector capabilities showing up inside Postgres extensions, integrated database features, and managed services alike. The market isn’t choosing between files and vectors. It’s moving toward composable combinations of both.

The Bottom Line (Without the Bow)
“The markdown file that beat a $50M vector database” works best as an argument about default starting architecture, not as a prediction that databases have no role.

The more precise, evidence-backed thesis: these successful agent stacks treat files as the first-class interface for state, and then add retrieval and stronger substrates only when the operational demands force them to.

If you’re building an agent today and your first instinct is to set up a vector database, take a step back. Look at what Manus, OpenClaw, and Claude Code actually ship. Start with a Markdown file. You can always add a database later.

You probably can’t say the same in reverse.
