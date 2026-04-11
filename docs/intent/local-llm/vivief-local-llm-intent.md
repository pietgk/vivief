# Vivief Intent: Local LLM Infrastructure — Gemma 4 + LiteRT-LM

> **Status**: Partially resolved (2026-04-09), revised (2026-04-11) — model strategy updated with Code Mode integration
> **Session**: Claude.ai brainstorm, 2025-04-08; Claude Code interview, 2026-04-11
> **Next**: Spike 0 — Sandbox Integration (see `vivief-code-mode-integration.md`)
> **Location**: `~/ws/vivief/docs/intent/local-llm/`

## Resolution

Original decisions from 2026-04-09 interview:

1. **Training strategy: Hybrid.** Few-shot + RAG to start for VivSurface and VivPractitioner (their tasks are complex and hard to synthesize accurately). Synthetic training data (Opus-generated) for VivRouter only — its intent classification task over the 5 primitives is narrow, well-defined, and reliably synthesizable. Train when real usage data accumulates for the other tiers. This avoids teaching models to mimic Opus rather than learning the actual distribution, while still getting VivRouter operational quickly.

2. **LiteRT-LM Tauri integration: Deferred to spike.** Both sidecar (crash isolation, independent lifecycle, ~50ms overhead) and FFI (zero IPC overhead, tighter coupling, crash propagation risk) are viable. Build a minimal Tauri app that loads FunctionGemma 270M via both approaches. Measure: startup latency, inference latency, memory overhead, crash behavior, developer ergonomics. Decide based on data, not theory.

Revised decisions from 2026-04-11 Code Mode integration interview (see `vivief-code-mode-integration.md` for full 25 decisions):

3. **Model strategy: Skills-first, fine-tuning contingent.** Start with E4B (native function calling) for all local tasks including routing — no fine-tuned VivRouter initially. Lean toward Code Mode skill accumulation over fine-tuning for capability building. Fine-tune VivRouter only if E4B classification accuracy proves inadequate. This replaces the prior assumption of immediate VivRouter fine-tuning.

4. **Inference backend: LiteRT-LM or Ollama behind typed bridge.** Both are viable inference backends. The Code Mode sandbox communicates via typed `external_*` functions that bridge to the host; the bridge doesn't care which inference backend sits behind it. Ollama is no longer "personal experimentation only" — it's a viable development backend.

5. **Sandbox integration as priority spike.** The TanStack Code Mode sandbox (`@tanstack/ai-code-mode` + `@tanstack/ai-isolate-quickjs`) becomes the foundation for all self-improving loop spikes. Sandbox integration moves ahead of fine-tuning work in priority order.

---

## Context

Vivief's architecture has always included a tiered LLM strategy: local, normal (Sonnet-level), and deep (Opus). The local tier was previously explored with Qwen3.5-27B via Ollama on an M1 Pro MacBook (32GB RAM). Google's release of Gemma 4 (April 2026, Apache 2.0) and the maturation of LiteRT-LM fundamentally changes what's achievable locally — enough to warrant a re-architecture of the local tier.

This document captures research findings and architectural decisions from a deep exploration session.

---

## Gemma 4 Family Overview

### Model Lineup

| Model | Total Params | Active Params | Context | Modalities | RAM (4-bit) | Target |
|-------|-------------|---------------|---------|------------|-------------|--------|
| E2B | 2.3B | 2B effective | 128K | Text, Image, Audio | ~3.6 GB | Phones, IoT, edge |
| E4B | 4.5B | 4B effective | 128K | Text, Image, Audio | ~5.5 GB | Laptops, flagship phones |
| 26B-A4B (MoE) | 26B | 3.8B active | 256K | Text, Image | ~16-18 GB | Workstations |
| 31B Dense | 31B | 31B | 256K | Text, Image | ~20 GB | Servers, high-end desktop |

### Key Capabilities Relevant to Vivief

- **Native function calling** — structured tool-call JSON output, not prompt-engineering hacks
- **Configurable thinking mode** — `<|think|>` token enables/disables chain-of-thought reasoning per request
- **Native system prompt support** — standard system/user/assistant roles (changed from Gemma 3)
- **Multimodal** — image understanding (OCR, document parsing, UI understanding, chart comprehension) + audio (ASR, speech translation) on E2B/E4B
- **128K context on edge models** — sufficient for significant Vivief session state
- **Apache 2.0 license** — no commercial restrictions, full freedom to fine-tune and deploy

### Performance on M1 Pro 32GB

| Model | Quant | tok/s (decode) | Memory | Headroom | Status |
|-------|-------|---------------|--------|----------|--------|
| E2B | Q8 | ~95 | ~3.6 GB | Excellent | Always-on workhorse |
| E4B | Q4 | ~57 | ~5.5 GB | Excellent | Always-on workhorse |
| 26B MoE | Q4_K_M | ~10-15 | ~17 GB + KV | Tight (5-8 GB free) | Usable, not always-on |
| 26B MoE | Q2 (dynamic) | ~12-18 | ~12-14 GB | Moderate | Better fit, quality trade-off |
| 31B | Q4 | — | ~20 GB + KV | Won't fit practically | Not viable |

#### 26B MoE Deep Dive

Initial reports of ~2 tok/s were from misconfigured setups (CPU fallback, no GPU offload). The model **does fit** on 32GB at Q4 — all 26B params must be resident even though only 3.8B activate per token (MoE saves compute, not memory).

**Memory math**: macOS (~5 GB) + model weights Q4 (~17 GB) + KV cache + runtime (~3-5 GB) = ~25-27 GB total. Leaves 5-8 GB headroom — enough if context is kept short (4K-8K tokens). At 32K+ context, KV cache growth causes swapping and performance collapse.

**Speed is bandwidth-bound**: M1 Pro has ~200 GB/s memory bandwidth. M4 Max has ~546 GB/s and achieves 20-30 tok/s on 26B MoE. Proportional scaling puts M1 Pro at ~10-15 tok/s, confirmed by community reports from similar hardware configs.

**Optimization levers**:
- `OLLAMA_NUM_GPU=99` — offload all layers to Metal GPU (critical on unified memory)
- Q4_K_M or Unsloth Dynamic 2-bit (`UD-Q2_K_XL`) for more breathing room
- KV cache quantization (TurboQuant in mlx-vlm) helps at longer contexts
- Keep context ≤8K tokens for stable performance
- Close heavy apps to maximize available unified memory

**Conclusion**: E2B and E4B are the always-on local workhorses. The 26B MoE is viable as an on-demand "Local Sonnet-lite" — loaded when needed for quality-sensitive tasks, not running permanently alongside the app stack.

---

## LiteRT-LM — The Runtime Decision

### What It Is

LiteRT is Google's on-device ML runtime (successor to TFLite). LiteRT-LM is the GenAI orchestration layer on top, providing:

- KV-cache management
- Prompt templating and session management
- Function calling APIs (first-class, not bolted on)
- Session cloning (fork context without re-prefill)
- Hardware acceleration auto-selection (CPU/GPU/NPU)

LiteRT-LM powers Gemini Nano in Chrome, Chromebook Plus, and Pixel Watch — production-proven at hundreds of millions of devices.

### LiteRT-LM Benchmarks (E4B, 1024 prefill / 256 decode)

| Device | Backend | Prefill | Decode | TTFT | Memory |
|--------|---------|---------|--------|------|--------|
| MacBook Pro M4 Max | GPU | 2,560 t/s | 101 t/s | 0.4s | 3.2 GB |
| MacBook Pro M4 Max | CPU | 277 t/s | 27 t/s | 3.7s | 890 MB |
| S26 Ultra | GPU | 1,293 t/s | 22.1 t/s | 0.8s | 710 MB |
| Raspberry Pi 5 | CPU | 51 t/s | 3.2 t/s | 20.5s | 3 GB |
| RTX 4090 | GPU | 7,260 t/s | 91 t/s | 0.2s | 1.1 GB |
| Web (Chrome M4 Max) | GPU | 1,598 t/s | 44 t/s | 1.5s | 3.3 GB |

LiteRT-LM is ~2x faster than Ollama on equivalent hardware for Gemma models.

### Decision: LiteRT-LM as Single Runtime (Dev + Prod)

**Chosen**: LiteRT-LM only — no Ollama in the Vivief dependency graph.

**Rationale**:

1. **One stack, dev to prod** — what you test is what you ship. Eliminates tokenizer/quantization discrepancies between runtimes (a known issue with Gemma 4 on llama.cpp)
2. **Cross-platform from same codebase** — Android, iOS, macOS, Linux, Windows, Web, IoT. Essential for Vivief's Tauri desktop → future mobile path
3. **Embeddable library, not a daemon** — C++ library linked into Tauri sidecar or via FFI. No HTTP localhost overhead, no process lifecycle management
4. **Native function calling API** — critical for VivRouter pattern
5. **Session cloning / KV-cache** — maps directly to Vivief's practitioner session model
6. **One model format** — `.litertlm` only, no parallel `.gguf` pipeline
7. **Hardware acceleration without config** — auto-selects Metal on Apple Silicon, NPU on mobile

**CLI for development**: `uv tool install litert-lm` provides comparable dev ergonomics to Ollama.

**Accepted trade-offs**:
- Model breadth limited to litert-community conversions (Gemma, Qwen 3.5, handful of others) — acceptable because hard tasks go to Sonnet/Opus API
- No LoRA hot-swap yet — solvable by merging adapters into separate model files in build pipeline
- Smaller community knowledge base — offset by Google's own engineering investment

**Ollama is also viable behind the typed bridge** (revised 2026-04-11). The Code Mode sandbox communicates via `external_*` functions that bridge to the host — the bridge doesn't care whether LiteRT-LM or Ollama handles inference. Both are acceptable development backends. LiteRT-LM remains the production target for cross-platform deployment.

---

## FunctionGemma — The Micro-Agent Layer

### What It Is

FunctionGemma is a specialized 270M parameter model (based on Gemma 3 270M) fine-tuned specifically for function calling. It is not a chat model — it translates natural language into structured API calls.

- ~550 MB RAM at full precision
- Designed to be fine-tuned for specific function-calling tasks
- Acts as independent agent for local tasks OR as router to larger models
- Multi-turn tool calling supported
- Mobile Actions benchmark: 58% base → 85% after task-specific fine-tuning

### Relevance to Vivief

FunctionGemma is the foundation for building **VivRouter** — a Vivief-native micro-agent that knows the five primitives and routes intent to the correct handler at near-instant latency.

---

## Revised Tiered LLM Architecture

### Five-Tier Model (was three, revised 2026-04-11)

| Tier | Model | Size | Purpose | Latency | Runtime | Always-on? |
|------|-------|------|---------|---------|---------|------------|
| **Micro** | E4B (native function calling) | 4B | Intent classification, primitive routing, skill selection, quick validation | <100ms | LiteRT-LM / Ollama | Yes |
| **Local** | E4B (Code Mode) | 4B | Simple Code Mode TypeScript generation, skill authoring, diagram gen | 1-3s | LiteRT-LM / Ollama | Yes |
| **Local+** | 26B MoE Q4 ("Sonnet-lite") | 26B (3.8B active) | Complex Code Mode generation offline, quality validation, optimization loops | 3-8s | LiteRT-LM / Ollama | On-demand |
| **Normal** | Sonnet | API | Complex skill authoring, quality Code Mode generation | API | Claude API | — |
| **Deep** | Opus | API | Architectural skills, training data generation, hard problems | API | Claude API | — |

> **Revised 2026-04-11**: Micro tier changed from "VivRouter (FunctionGemma fine-tune)" to "E4B (native function calling)". Start without fine-tuning; add VivRouter fine-tuning only if E4B classification accuracy proves inadequate. Skills-first approach: Code Mode skill accumulation over LoRA fine-tuning. See `vivief-code-mode-integration.md` Q17, Q20, Q24.

The **Local+** tier is the key addition. It fills a specific gap: tasks that are too expensive to run in repeated Sonnet API loops but need higher reasoning quality than the fine-tuned E4B provides. Examples:

- **Fine-tuning validation loops** — compare VivSurface E4B output against 26B MoE output locally to check quality drift, instead of burning Sonnet API credits
- **Training data quality checks** — use 26B MoE to score/filter synthetic training data generated by Opus before committing to a fine-tuning run
- **Optimization iterations** — when iterating on Projection compiler prompts or Contract validation rules, run 50 test cases through 26B MoE locally instead of 50 Sonnet API calls
- **Offline deep reasoning** — when no internet is available but a practitioner needs higher-quality analysis than E4B can provide

**Operational model**: 26B MoE is not loaded by default. It's invoked on-demand: Vivief unloads the E4B, loads 26B MoE, processes the batch/task, then swaps back. This avoids the memory pressure of running both simultaneously.

### Specialized Model Strategy

Three Vivief-specific models, all local:

#### VivRouter (FunctionGemma fine-tune, ~270M)

**Purpose**: Intent classification + primitive routing. Runs on everything including mobile.

**Function schemas** map to Vivief's five primitives:
- `create_datom({entity, attribute, value, tx})`
- `query_projection({spec, filters})`
- `update_surface({template, delta})`
- `validate_contract({datoms, rules})`
- `dispatch_effect({handler, payload})`

**Training data**: ~1000-2000 examples of natural language → function call pairs, generated by Opus.

**Example**:
```
User: "Schedule a session with Anna next Thursday at 14:00"
→ dispatch_effect({handler: "scheduling", payload: {client: "Anna", datetime: "..."}})

User: "Show me Anna's progress over the last 3 months"
→ query_projection({spec: "client_progress", filters: {client: "Anna", range: "3m"}})
```

#### VivSurface (E4B LoRA fine-tune)

**Purpose**: Generative Surface compilation — the "Projection compiler" concept as a locally-trained model.

**Training data**:
- (Projection spec → Surface template output) pairs
- (Natural language intent → Projection spec) pairs
- (Schema description → Contract rules) pairs
- Mermaid diagram generation (already validated: E4B does this well out of the box)

#### VivPractitioner (E4B LoRA fine-tune, domain-specific)

**Purpose**: Clinical/practice domain knowledge per practitioner type.

**Key insight**: LoRA adapters are small (~50-200 MB). Different practitioners can have different adapters:
- Psychology adapter
- Physiotherapy adapter
- General practice adapter
- Custom per-organization adapters

**Runtime model** (adapters merged into separate model files until LiteRT-LM supports hot-swap):
```
Base E4B (always loaded, ~5.5 GB)
  → VivSurface model (for UI generation tasks)
  → VivPractitioner-Psychology model (per practitioner session)
  → VivPractitioner-Physio model (swap per login)
```

### Resource Budget on M1 Pro 32GB

**Normal operation (Micro + Local tiers):**

| Component | RAM | Notes |
|-----------|-----|-------|
| VivRouter (FunctionGemma) | ~500 MB | Always loaded |
| VivSurface or VivPractitioner (E4B) | ~5.5 GB | One active at a time |
| Vivief app + D2TS + Loro + DuckDB | ~4 GB | Estimate |
| macOS + other | ~8 GB | |
| **Headroom** | **~14 GB** | Comfortable |

**On-demand Local+ mode (26B MoE swap):**

| Component | RAM | Notes |
|-----------|-----|-------|
| VivRouter (FunctionGemma) | ~500 MB | Stays loaded |
| 26B MoE Q4_K_M | ~17 GB | Replaces E4B temporarily |
| Vivief app + D2TS + Loro + DuckDB | ~4 GB | Estimate |
| macOS + other | ~6 GB | Close non-essential apps |
| **Headroom** | **~4.5 GB** | Tight but functional at ≤8K context |

The swap is explicit and user/system-initiated — not automatic. When Local+ completes, the system unloads 26B MoE and reloads E4B for normal operation.

---

## Fine-Tuning Pipeline

### Unsloth — What It Is and What It Isn't (On Our Hardware)

**Unsloth** is the de facto standard for efficient LLM fine-tuning. It works by rewriting PyTorch backpropagation into hand-optimized Triton kernels, achieving ~2x faster training and ~70% less VRAM than vanilla HuggingFace — with zero accuracy loss. It sits on top of the standard HuggingFace stack (transformers + PEFT + TRL) and provides `FastLanguageModel` as the main API.

**Unsloth has two faces:**

1. **Unsloth Core** — the training library. LoRA, QLoRA, full fine-tuning, RL (DPO, GRPO, PPO). This produces the fine-tuned models.
2. **Unsloth Studio** — a web GUI wrapping inference (chat), Data Recipes (auto-generate training datasets from PDFs/CSV/JSON using a visual node-based workflow), training with real-time monitoring, model comparison, and GGUF export.

**Critical constraint: Unsloth training requires NVIDIA CUDA GPUs.** On Apple Silicon (our M1 Pro), Unsloth Studio only supports chat inference and Data Recipes. GPU-accelerated training via MPS is not recognized. Official MLX training support is listed as "coming soon" but is not yet available.

### Training Options for M1 Pro 32GB

**Option A: mlx-tune (recommended for local prototyping)**

`mlx-tune` is a community project (not official Unsloth) that wraps Apple's native MLX framework with an Unsloth-compatible API. It supports SFT, DPO, GRPO, and Vision fine-tuning natively on Apple Silicon, including Gemma 4 (E2B, E4B, 26B MoE, 31B) as of v0.4.18.

The API is a one-import change from Unsloth proper:
```python
# CUDA (Unsloth)                       # Apple Silicon (mlx-tune)
from unsloth import FastLanguageModel   from mlx_tune import FastLanguageModel
from trl import SFTTrainer              from mlx_tune import SFTTrainer
# Rest of code stays exactly the same
```

Install: `uv pip install mlx-tune`

This gives us code portability — scripts written for mlx-tune on Mac can move to Unsloth on CUDA by changing one import. Training will be slower than CUDA but viable for our model sizes (270M FunctionGemma, 4B E4B).

**Option B: Google Colab / cloud GPU (for larger training runs)**

- FunctionGemma (270M) full fine-tune: fits free Colab T4 (8-10 GB VRAM)
- E4B LoRA: needs Colab Pro A100 or similar (~17 GB VRAM)
- E4B QLoRA: fits free Colab T4 (~10 GB VRAM)

Workflow: prepare datasets locally → push to HuggingFace → train on Colab with Unsloth proper → pull adapter back. More friction, but uses the battle-tested training engine.

**Option C: Wait for official Unsloth MLX support**

Listed as next priority by the Unsloth team. Could land any week, but "coming soon" is undefined.

**Chosen approach**: **mlx-tune for local prototyping and small training runs** (FunctionGemma, small E4B LoRA datasets). **Colab with Unsloth proper for larger E4B training runs** (VivSurface, VivPractitioner with 10K+ examples). This gives us immediate local iteration with a scale-up path that uses the same API.

### Unsloth Studio Data Recipes (Usable on Mac Today)

Even without training capability, Unsloth Studio's Data Recipes is valuable on our Mac for **dataset preparation**:

- Visual node-based workflow for data ingestion and transformation
- Multimodal ingestion: PDFs, DOCX, JSONL, CSV, TXT
- Synthetic data generation: transforms unstructured documents into structured instruction-following datasets
- Auto-formats into ChatML, Alpaca, or custom formats

For Vivief: feed in practitioner documentation, session note templates, assessment frameworks → auto-generate the QA pairs needed for VivPractitioner fine-tuning. Then train with mlx-tune locally or push to Colab.

Install: `curl -fsSL https://unsloth.ai/install.sh | sh` → open `http://localhost:8888`

### Data Generation Loop (Self-Reinforcing)

1. **Opus generates synthetic training data** — describe primitives, Opus generates example pairs
2. **Unsloth Studio Data Recipes** — auto-generate additional training data from practitioner documents
3. **Fine-tune locally** with mlx-tune on M1 Pro, or on Colab with Unsloth for larger runs
4. **Export** — mlx-tune exports to HuggingFace format and GGUF
5. **Convert to `.litertlm`** via LiteRT Generative Torch API for production deployment
6. **Deploy fine-tuned model** — handles 80% of requests locally via LiteRT-LM
7. **Log escalations to Sonnet/Opus** — these become new training data
8. **Periodic re-fine-tune** — local model improves continuously

This mirrors Vivief's creation loop — the practitioner and AI collaborating with human approval of AI-proposed changes — applied to model training itself.

### Training Data Requirements

| Model | Examples Needed | Generation Method |
|-------|----------------|-------------------|
| VivRouter (FunctionGemma) | 1,000-2,000 | Opus-generated from primitive specs |
| VivSurface (E4B LoRA) | 5,000-10,000 | Opus-generated from Surface/Projection pairs |
| VivPractitioner (E4B LoRA) | 10,000-50,000 | Domain corpus + Opus synthesis + Unsloth Data Recipes |

### Fine-Tuning Hardware Requirements

| Activity | RAM | Time | Tool | Where |
|----------|-----|------|------|-------|
| Fine-tune FunctionGemma (full) | ~4 GB | minutes | mlx-tune or Unsloth | Local M1 Pro or Colab T4 |
| Fine-tune E4B (QLoRA) | ~10 GB | 1-3 hours | mlx-tune or Unsloth | Local M1 Pro or Colab T4 |
| Fine-tune E4B (LoRA) | ~17 GB | 2-4 hours | Unsloth | Colab Pro A100 |
| Dataset preparation | minimal | varies | Unsloth Studio Data Recipes | Local M1 Pro |
| Export to GGUF (testing) | minimal | minutes | mlx-tune or Unsloth | Local |
| Convert to .litertlm (prod) | TBD | TBD | LiteRT Generative Torch API | Local |

---

## Capabilities Unlocked by Going Gemma 4 + LiteRT-LM

### Replaces Separate Tools

| Previously | Now handled by |
|-----------|---------------|
| Whisper.cpp (ASR) | E4B native audio input |
| Qwen3.5-27B (local workhorse) | E4B (lighter, multimodal, native function calling) |
| Prompt-engineered function routing | VivRouter (FunctionGemma, trained on primitives) |
| Cloud-only Surface compilation | VivSurface (local E4B fine-tune) |

### New Capabilities (Not Previously Possible Locally)

- **Image understanding** — practitioners photograph documents, receipts, handwritten notes → structured datoms. No data leaves device
- **Audio transcription** — session recording → text, fully local
- **Diagram generation** — mermaid/visual output from natural language, validated working well with E4B
- **UI understanding** — screenshot → structured data extraction for Surface debugging
- **Web inference** — E4B runs at 44 tok/s in Chrome via WebGPU, aligned with local-first philosophy if Vivief ever has a web surface
- **Per-practitioner specialization** — LoRA adapters per domain, swappable

---

## Integration with Vivief Architecture

### Mapping to Five Primitives

| Primitive | Local LLM Role |
|-----------|---------------|
| **Datom** | VivRouter classifies intent → creates pending datoms for human approval |
| **Projection** | VivSurface compiles natural language → Projection specs |
| **Surface** | VivSurface generates Surface templates from Projection output |
| **Contract** | VivRouter validates datom mutations against contract rules locally |
| **effectHandler** | VivRouter dispatches effects via function calling |

### Mapping to Existing Architecture Decisions

| Decision | Alignment |
|----------|-----------|
| Creation loop (practitioner + AI collaboration) | VivRouter proposes, human approves — fully local |
| Generative UI / Projection compiler | VivSurface fine-tune is the compiler — local, deterministic after training |
| Selective encryption (AES-256-GCM) | All LLM inference local — encrypted datoms never leave device for AI processing |
| Local-first / Iroh P2P | LiteRT-LM embeds in Tauri — no server dependency for inference |
| Tauri sidecar (no mobile support) | LiteRT-LM is native on mobile — solves the sidecar gap |
| Contract-driven development | Contracts can be validated locally by VivRouter at near-instant latency |

---

## Open Questions for Claude Code CLI Session

1. **LiteRT-LM Tauri integration** — FFI vs sidecar vs IPC? What's the cleanest embedding path for a Rust/TS app?
2. **`.litertlm` conversion pipeline** — document the exact mlx-tune/Unsloth → GGUF → LiteRT Generative Torch API → `.litertlm` export chain. Is it stable enough for a build pipeline?
3. **LoRA merge strategy** — until LiteRT-LM supports hot-swap, what's the disk/memory cost of maintaining separate merged models per practitioner domain?
4. **FunctionGemma vs Gemma 4 E2B for routing** — FunctionGemma is 270M text-only (Gemma 3 base). E2B is 2.3B multimodal (Gemma 4). Is FunctionGemma still the right router base, or should we fine-tune E2B directly?
5. **Training data generation** — design the Opus prompt templates for generating VivRouter and VivSurface training pairs from Vivief's primitive specifications
6. **Benchmark on actual M1 Pro** — install LiteRT-LM CLI and benchmark E2B + E4B on our specific hardware. Compare with the published M4 Max numbers
7. **Web inference feasibility** — E4B at 44 tok/s in Chrome. Is this viable for a Vivief web client, or is it a party trick?
8. **MoQ alignment** — does LiteRT-LM's session management conflict or complement the MoQ-based datom sync architecture?
9. **D2TS pipeline integration** — can LiteRT-LM inference results feed directly into D2TS differential dataflow as datom sources?
10. **mlx-tune validation** — install mlx-tune, fine-tune FunctionGemma on a small test dataset on M1 Pro, verify the full pipeline works: train → export GGUF → convert `.litertlm` → run on LiteRT-LM
11. **Unsloth Studio Data Recipes evaluation** — test the dataset generation pipeline with sample practitioner documentation. Assess quality of auto-generated QA pairs before committing to this as a training data source
12. **Colab training workflow** — set up the Colab notebook with Unsloth proper for E4B LoRA training. Document the full round-trip: local dataset prep → HuggingFace push → Colab train → pull adapter → merge → convert

---

## Action Items (Priority Order, revised 2026-04-11)

> Reprioritized: Sandbox integration and Code Mode spikes move ahead of fine-tuning work. See `vivief-code-mode-integration.md` for rationale.

1. **Install and benchmark LiteRT-LM CLI** on M1 Pro 32GB — establish baseline inference performance
2. **Test E4B function calling** with Vivief primitive schemas via LiteRT-LM or Ollama
3. **Spike 0: Sandbox Integration** — install `@tanstack/ai-code-mode` + `@tanstack/ai-isolate-quickjs`, implement `external_*` bridge to vivief effectHandlers, Contract enforcement at boundary
4. **Spike 1: Contract Verifier** — `verify(artifact, contract)` function, exposed as `external_verify` in sandbox
5. **Spike 2: Prompt Garden** — autoresearch on Code Mode system prompt templates, skills accumulate from successful executions
6. **Spike 3: Template Forge** — ATLAS as Code Mode meta-skill with `Promise.all` for parallel candidates
7. **Evaluate E4B classification accuracy** — test intent classification into five primitives with function calling schemas. If accuracy is insufficient, proceed to VivRouter fine-tuning (items 8-10)
8. *(Contingent)* **Install mlx-tune** — verify Gemma 4 E4B and FunctionGemma LoRA training works on M1 Pro
9. *(Contingent)* **Prototype VivRouter** — fine-tune FunctionGemma on 200 hand-written primitive routing examples
10. *(Contingent)* **Validate full pipeline** — mlx-tune train → export GGUF → convert `.litertlm` → run on LiteRT-LM
11. **Install Unsloth Studio** — evaluate Data Recipes for practitioner document → training dataset generation
12. **Investigate LiteRT-LM Tauri embedding** — FFI/sidecar architecture spike (deferred — web progressive enhancement first per Q4)

---

## References

- [Gemma 4 announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4)
- [LiteRT-LM GitHub](https://github.com/google-ai-edge/LiteRT-LM)
- [LiteRT overview](https://ai.google.dev/edge/litert/overview)
- [litert-community HuggingFace](https://huggingface.co/litert-community)
- [gemma-4-E4B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm)
- [gemma-4-E2B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm)
- [FunctionGemma](https://huggingface.co/google/functiongemma-270m-it)
- [FunctionGemma guide](https://blog.google/technology/developers/functiongemma/)
- [Fine-tuning FunctionGemma](https://ai.google.dev/gemma/docs/functiongemma/finetuning-with-functiongemma)
- [Gemma 4 fine-tuning with Unsloth](https://unsloth.ai/docs/models/gemma-4/train)
- [Unsloth Studio](https://unsloth.ai/docs/new/studio) — Data Recipes works on Mac, training requires NVIDIA GPU
- [Unsloth requirements](https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements) — platform support matrix
- [Unsloth fine-tuning guide](https://unsloth.ai/docs/get-started/fine-tuning-llms-guide)
- [mlx-tune GitHub](https://github.com/ARahim3/mlx-tune) — community Unsloth-compatible API for Apple Silicon, Gemma 4 support
- [mlx-tune PyPI](https://pypi.org/project/unsloth-mlx/) — `uv pip install mlx-tune`
- [HuggingFace Gemma 4 blog](https://huggingface.co/blog/gemma4)
- [LiteRT-LM in Chrome/Chromebook/Pixel Watch](https://developers.googleblog.com/on-device-genai-in-chrome-chromebook-plus-and-pixel-watch-with-litert-lm/)
- [TanStack Code Mode](https://tanstack.com/ai) — sandbox execution, skills system, AG-UI streaming
- [Code Mode integration decisions](vivief-code-mode-integration.md) — 25 resolved decisions (2026-04-11)
