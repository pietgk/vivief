# ADR: Vivief P2P v2 — Unified QUIC Stack with MoQ

**Status**: Brainstorming / Proposal  
**Date**: 2026-03-25  
**Supersedes**: vivief-p2p-lean-stack-adr.md (v1)  
**Key insight**: MoQ (Media over QUIC) already integrates with Iroh and provides a unified pub/sub model for BOTH datom sync AND video conferencing. One protocol stack handles everything.

---

## 1. The Unifying Idea

MoQ's publish/subscribe model over QUIC tracks maps onto ALL vivief data flows — not just video:

| Vivief concern | MoQ concept | Track pattern |
|---------------|-------------|---------------|
| Hot datom sync | Track of datom groups | `practice42/datoms/entity-ns` |
| Video call (outgoing) | Video + audio tracks | `practice42/alice/video`, `practice42/alice/audio` |
| Loro text collaboration | Track of CRDT updates | `practice42/notes/session-789` |
| Frozen tier distribution | Blob track (or out-of-band iroh-blobs) | `practice42/frozen/epoch-5` |
| Presence/status | Lightweight track | `practice42/presence` |

**One transport, one pub/sub model, one congestion strategy. Datoms are just another track.**

### The stack

| Layer | Technology | Role |
|-------|-----------|------|
| Transport | **QUIC** (via Iroh for P2P holepunch, via WebTransport for browsers) | Encrypted, multiplexed, congestion-aware |
| Pub/sub | **MoQ (moq-lite)** | Track-based publish/subscribe with priority, ordering, and group semantics |
| Media format | **hang** (MoQ's WebCodecs-based format) | Video/audio encoding for conferencing |
| Datom format | **Custom MoQ track format** | Datom multisets as MoQ groups |
| Text CRDT | **Loro** | Rich text collaboration (updates sent as MoQ track) |
| Incremental compute | **D2TS** | Differential dataflow on received datom streams |
| Verification | **iroh-blobs** (BLAKE3) | Frozen tier integrity |
| Runtime | **Browser-native** + optional Rust sidecar | No Bare, no Node.js |

---

## 2. MoQ — What It Is and Why It Changes Everything

### Overview

**Media over QUIC** (MoQ) is an IETF-standardized pub/sub protocol built on QUIC. Backed by Google, Cisco, Akamai, Cloudflare, Meta. Despite the name "Media", the core protocol (moq-transport / moq-lite) is media-agnostic — it's a generic pub/sub for any real-time data delivered as named tracks of ordered groups of frames.

- **Specification**: IETF draft-ietf-moq-transport (currently draft 17)
- **Implementation**: https://github.com/moq-dev/moq (Rust + TypeScript, MIT/Apache-2.0)
- **moq-lite**: Simplified subset, forwards-compatible with full moq-transport
- **CDN support**: Runs on Cloudflare's global network (330+ cities) today
- **Iroh integration**: Native P2P support via iroh already exists in moq-native and moq-relay

### Core data model

```
Origin (scope)
  └─ Broadcast (named, discoverable collection from one publisher)
       └─ Track (series of groups, potentially out-of-order)
            └─ Group (series of frames, delivered reliably in-order within group)
                 └─ Frame (chunk of bytes with upfront size)
```

Key properties:
- **Tracks are independent QUIC streams** — no head-of-line blocking between tracks
- **Groups are join points** — new subscribers start at the latest group
- **Congestion is subscriber-controlled** via priority, group order, and group timeout
- **Broadcasts are discoverable** — live notification when participants join/leave
- **Relay-friendly** — content cached and fanned-out without understanding payload

### MoQ + Iroh = P2P media + data

The moq-dev crates already support iroh as a transport:

```rust
// moq-relay with iroh enabled
just relay --iroh-enabled
// → prints iroh endpoint ID

// Publisher connects P2P via iroh
just pub-iroh video iroh://ENDPOINT_ID practice42/
```

Connection URLs supported:
- `iroh://<ENDPOINT_ID>` — moq-lite over raw QUIC via iroh (P2P)
- `h3+iroh://<ENDPOINT_ID>/path` — WebTransport over HTTP/3 over iroh
- Standard WebTransport for browser clients

The **iroh-live** crate (n0-computer/iroh-live) adds native capture and encoding on top, creating a complete P2P live streaming toolkit.

### Why this matters for vivief

Without MoQ, vivief would need to build:
1. A custom gossip protocol for hot datoms (iroh-gossip)
2. A separate video conferencing stack (WebRTC or custom)
3. A separate text sync protocol (Loro over custom transport)
4. Custom congestion handling for each

With MoQ, ALL of these become tracks in the same pub/sub system:
- Same connection, same congestion control, same relay infrastructure
- Priority-based degradation: audio > datoms > video > text updates
- Live discovery: `announced("practice42/")` reveals all participants AND their tracks
- One relay handles everything — self-hosted or Cloudflare

---

## 3. Architecture: Everything Is a Track

### Track namespace design

```
{practice-id}/
  ├─ presence                          # Lightweight: who's online, cursor pos
  ├─ datoms/
  │   ├─ {namespace}                   # Hot datom stream per entity namespace
  │   └─ catch-up                      # Warm tier: version-vector-based sync
  ├─ {participant-id}/
  │   ├─ audio                         # Opus-encoded audio track
  │   ├─ video                         # H.264/VP9 video track (multiple renditions)
  │   └─ screen                        # Screen share track (optional)
  ├─ notes/
  │   └─ {document-id}                 # Loro CRDT updates for each document
  └─ frozen/
      └─ {epoch-id}                    # Frozen tier snapshot announcements
```

### Conference room: live discovery

MoQ's `announced()` mechanism provides live discovery of broadcasts. When a participant joins:

```typescript
// Subscribe to all broadcasts in practice room
const session = await connect('iroh://RELAY_ENDPOINT_ID')
const announced = session.announced('practice42/')

for await (const event of announced) {
  if (event.type === 'active') {
    // New broadcast: could be a participant, datom stream, or document
    const name = event.broadcast  // e.g., "practice42/alice"
    
    // Subscribe to their audio (high priority)
    session.subscribe(`${name}/audio`, { priority: 100, groupOrder: 'asc', groupTimeout: 500 })
    
    // Subscribe to their video (lower priority, drop under congestion)
    session.subscribe(`${name}/video`, { priority: 50, groupOrder: 'desc', groupTimeout: 2000 })
  }
  if (event.type === 'inactive') {
    // Participant left — subscriptions auto-close
  }
}
```

### Datom sync as MoQ tracks

Hot datoms become MoQ frames within groups:

```
Track: practice42/datoms/clients
  Group 100 (tx version 100):
    Frame 0: [entity=42, attr=:name, value="Alice", diff=+1]
    Frame 1: [entity=42, attr=:phone, value="+46...", diff=+1]
  Group 101 (tx version 101):
    Frame 0: [entity=42, attr=:name, value="Alice", diff=-1]  // retract
    Frame 1: [entity=42, attr=:name, value="Alicia", diff=+1] // assert new
```

MoQ group semantics align perfectly with datom transactions:
- **Group = transaction** — all datoms in a tx are delivered reliably and in-order
- **Groups are independent** — transactions can arrive out-of-order (D2TS handles reordering)
- **Group ID = tx version** — monotonically increasing
- **New subscribers start at latest group** — join the hot stream immediately, then catch up warm tier separately

### Congestion priority table

| Track | Priority | Order | Timeout | Rationale |
|-------|----------|-------|---------|-----------|
| `*/audio` | 100 | ascending | 500ms | Speech must not drop |
| `*/datoms/*` | 90 | ascending | 1000ms | Data integrity > video |
| `*/presence` | 85 | descending | 200ms | Latest state only |
| `*/video` | 50 | descending | 2000ms | Drop old frames, show latest |
| `*/screen` | 40 | descending | 3000ms | Screen share tolerates more lag |
| `*/notes/*` | 30 | ascending | 5000ms | Text sync can buffer longer |

Under congestion: audio stays, datoms stay, video drops frames, text sync delays. Exactly the right degradation for a practice management tool with embedded meetings.

---

## 4. MoQ's `hang` Format for Video/Audio

### What it is

`hang` is MoQ's WebCodecs-based media format. It uses a `catalog.json` track to describe available renditions, then each rendition is a separate MoQ track.

### Catalog example for a vivief participant

```json
{
  "video": {
    "renditions": {
      "high": {
        "codec": "avc1.64001f",
        "codedWidth": 1280,
        "codedHeight": 720,
        "container": "legacy"
      },
      "low": {
        "codec": "avc1.42e01e",
        "codedWidth": 640,
        "codedHeight": 360,
        "container": "legacy"
      }
    }
  },
  "audio": {
    "renditions": {
      "default": {
        "codec": "opus",
        "sampleRate": 48000,
        "numberOfChannels": 1,
        "container": "legacy"
      }
    }
  }
}
```

### Key properties

- **WebCodecs-based**: Uses browser-native WebCodecs API for encode/decode — no external codecs needed
- **Multiple renditions**: Publish at different qualities, subscriber chooses based on bandwidth
- **Live catalog updates**: Track resolution/codec changes are published as catalog updates
- **Group = GoP**: Each MoQ group aligns with a video Group of Pictures (keyframe boundary)
- **Container options**: `legacy` (minimal overhead: varint timestamp + payload) or `CMAF` (fMP4 compatibility)
- **Hardware acceleration**: iroh-live uses ffmpeg for hardware-accelerated H.264 encoding on native

### Browser implementation

```typescript
import { Watch, Publish } from '@moq/hang'

// Subscribe to a participant's media
const watch = new Watch(session, 'practice42/alice')
watch.onVideoFrame = (frame: VideoFrame) => {
  // Render to canvas or <video> element
  videoCtx.drawImage(frame, 0, 0)
  frame.close()
}
watch.onAudioData = (data: AudioData) => {
  // Feed to WebAudio API
  audioCtx.decodeAudioData(data)
}

// Publish own media
const publish = new Publish(session, 'practice42/bob')
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
publish.addVideoTrack(stream.getVideoTracks()[0])
publish.addAudioTrack(stream.getAudioTracks()[0])
```

---

## 5. D2TS — Unchanged from v1 (Differential Dataflow for Datoms)

D2TS role is unchanged: it receives datom multisets from MoQ tracks and performs incremental computation.

The key difference from v1: datoms now arrive via MoQ track subscription instead of iroh-gossip:

```typescript
// Subscribe to datom track via MoQ
const datomTrack = session.subscribe('practice42/datoms/clients', {
  priority: 90,
  groupOrder: 'ascending',
  groupTimeout: 1000
})

// Feed into D2TS
for await (const group of datomTrack) {
  const txVersion = group.id
  for await (const frame of group) {
    const datom = decodeDatom(frame.payload)
    d2tsInput.sendData(txVersion, new MultiSet([[datom, datom.diff]]))
  }
  d2tsInput.advanceTo(txVersion + 1)
}
```

All D2TS concepts from v1 remain: multiset consolidation, frontier advancement, compaction as frozen tier, SQLite persistence for warm tier.

See v1 document Section 4 for full D2TS details (compaction math, tier mapping, operator examples).

---

## 6. Loro — Text CRDT Updates as MoQ Track

Loro's role is unchanged but its transport becomes a MoQ track:

```typescript
// Publish Loro updates as MoQ track
const loroDoc = new LoroDoc()
const text = loroDoc.getText('content')

loroDoc.subscribe(event => {
  if (event.by === 'local') {
    const updates = loroDoc.export({ mode: 'update', from: lastSyncVersion })
    // Publish as MoQ frame in a new group
    noteTrack.publishGroup(groupId++, updates)
    lastSyncVersion = loroDoc.oplogVersion()
  }
})

// Subscribe to other peers' Loro updates
const remoteUpdates = session.subscribe(`practice42/notes/${docId}`)
for await (const group of remoteUpdates) {
  for await (const frame of group) {
    loroDoc.import(frame.payload)
  }
}
```

Advantage over v1: Loro updates flow through the same MoQ congestion control as everything else. Under heavy congestion (poor network), text sync gracefully degrades (priority 30) while audio and datoms are preserved.

---

## 7. Frozen Storage Verification — Unchanged from v1

Iroh blobs with BLAKE3 verified streaming for frozen tier integrity. See v1 document Section 7 for full details (Options A/B/C).

The frozen tier lives outside MoQ — it's bulk data transfer, not real-time pub/sub. When a peer needs the frozen snapshot:

1. Discover frozen epoch via MoQ announcement: `practice42/frozen/epoch-5`
2. The announcement frame contains the BLAKE3 hash of the frozen blob
3. Fetch the blob out-of-band via iroh-blobs (verified streaming)
4. Apply frozen state, then subscribe to warm/hot MoQ tracks for catch-up

---

## 8. Relay Topology

### Self-hosted relay (recommended for practice data sensitivity)

```
                    ┌─────────────────┐
                    │  moq-relay      │
                    │  (self-hosted)  │
                    │  --iroh-enabled │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌──────▼─────┐  ┌────▼────────┐
     │ Practitioner│  │  Client    │  │  Admin      │
     │ (desktop)  │  │  (browser) │  │  (desktop)  │
     │ iroh native│  │ WebTransport│  │ iroh native │
     └────────────┘  └────────────┘  └─────────────┘
```

- Desktop/mobile clients: connect via iroh (P2P holepunching, E2E encrypted)
- Browser clients: connect via WebTransport (through relay, TLS encrypted)
- Relay caches and fans out — doesn't understand payload content
- Can optionally add E2E encryption on top (relay sees nothing)

### Hybrid: self-hosted + Cloudflare

For geographically distributed practices or when NAT traversal is difficult:

```
     iroh P2P (direct)          Cloudflare MoQ CDN
    ┌──────────────┐          ┌──────────────────┐
    │ Practitioner ◄──────────► moq-relay (self) │
    │ (Stockholm)  │          │ (origin server)  │
    └──────────────┘          └────────┬─────────┘
                                       │ federated
                              ┌────────▼─────────┐
                              │ Cloudflare edge   │
                              │ (330+ cities)     │
                              └────────┬─────────┘
                                       │
                              ┌────────▼─────────┐
                              │ Client (browser)  │
                              │ (anywhere)        │
                              └──────────────────┘
```

MoQ subscribers auto-route to the best available connection. If P2P via iroh works, use it. If not, fall back to relay/CDN.

---

## 9. What We Drop (Updated from v1)

| Technology | Why not |
|-----------|---------|
| **Holepunch (all of it)** | Iroh + MoQ replaces Hyperswarm, Bare, Protomux. D2TS replaces Hypercore/Hyperbee. |
| **WebRTC** | MoQ replaces it for conferencing. No SDP offer/answer dance, no ICE negotiation, no SFU complexity. MoQ relay IS the SFU but simpler. |
| **iroh-gossip** (as primary transport) | MoQ tracks replace gossip for hot datom broadcast. Gossip may still be used internally by the relay for cluster discovery, but vivief doesn't interact with it directly. |
| **Custom sync protocols** | MoQ's pub/sub with priority/ordering handles all sync patterns. |
| **Holochain, libp2p, Yjs, Automerge** | Same reasoning as v1. |

### What we gained by adding MoQ

1. **Video conferencing for free** — hang format + WebCodecs, no WebRTC complexity
2. **Unified congestion control** — one policy for audio, video, datoms, and text
3. **CDN-ready from day one** — Cloudflare MoQ network is production
4. **Live discovery** — `announced()` gives us presence, room management, and track discovery
5. **Standards track** — IETF backing means long-term viability
6. **Relay clustering** — moq-relay's built-in clustering for multi-node deployment

---

## 10. Full Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     Vivief Client                            │
│                                                              │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌───────────┐ │
│  │ UI Layer │  │ Video/Audio│  │ D2TS     │  │ Loro CRDT │ │
│  │ (React)  │  │ (WebCodecs)│  │ Engine   │  │ (text)    │ │
│  └────┬─────┘  └─────┬──────┘  └────┬─────┘  └─────┬─────┘ │
│       │               │              │               │       │
│  ┌────┴───────────────┴──────────────┴───────────────┴─────┐ │
│  │                    MoQ Session                           │ │
│  │  Tracks:                                                 │ │
│  │   practice42/alice/audio     (publish, priority 100)     │ │
│  │   practice42/alice/video     (publish, priority 50)      │ │
│  │   practice42/datoms/clients  (pub+sub, priority 90)      │ │
│  │   practice42/notes/session-1 (pub+sub, priority 30)      │ │
│  │   practice42/presence        (pub+sub, priority 85)      │ │
│  │                                                          │ │
│  │  Announcements:                                          │ │
│  │   announced("practice42/") → discover all participants   │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         │                                     │
│  ┌──────────────────────┴───────────────────────────────────┐ │
│  │              Iroh Endpoint (P2P) / WebTransport (web)    │ │
│  │  • QUIC + holepunching + relay fallback                  │ │
│  │  • ALPN: moql (moq-lite) / h3 (WebTransport)            │ │
│  │  • Ed25519 identity (NodeId)                             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌────────────┐  ┌─────────────┐  ┌────────────┐            │
│  │ SQLite     │  │ Blob Store  │  │ Loro Store │            │
│  │ (D2TS warm │  │ (frozen +   │  │ (CRDT docs)│            │
│  │  tier)     │  │  BLAKE3)    │  │            │            │
│  └────────────┘  └─────────────┘  └────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

---

## 11. Implementation Phases

### Phase 1: Datom sync via MoQ + D2TS

- Set up moq-relay (self-hosted, iroh-enabled)
- Define datom track format (MoQ group = tx, frame = datom)
- D2TS pipeline receiving from MoQ track subscription
- SQLite warm tier persistence
- Basic two-peer sync

### Phase 2: Video conferencing via hang

- Add hang format media tracks
- WebCodecs capture/encode/decode in browser
- iroh-live for native clients (hardware-accelerated encoding)
- Conference room via `announced()` discovery
- Priority-based congestion handling

### Phase 3: Text collaboration via Loro

- Loro document updates as MoQ track
- Merge with datom system (document references as datoms)
- Concurrent editing in meeting notes

### Phase 4: Frozen tier + verification

- D2TS compaction → iroh-blobs snapshot
- BLAKE3 verified streaming for frozen tier transfer
- Epoch-based sync for new/recovering peers

### Phase 5: Polish

- E2E encryption for sensitive practice data
- Multi-rendition video (auto-quality switching)
- Offline-first with warm tier SQLite
- Self-hosted relay deployment guide

---

## 12. Open Questions (Updated)

1. **MoQ relay as single point?** The self-hosted relay is critical infrastructure. Failover strategy? moq-relay supports clustering — run 2+ nodes for redundancy. But is this acceptable for a small practice?

2. **Browser-to-browser P2P?** MoQ's iroh integration is "native only" currently. Browser clients go through the relay. Is this acceptable? For a practice with 2-5 users, relay bandwidth is trivial. Long-term, WebTransport may enable browser P2P.

3. **Datom track granularity**: One track per entity namespace? Per entity? Per transaction? The trade-off is discovery overhead vs congestion granularity. Recommendation: one track per namespace (e.g., `datoms/clients`, `datoms/sessions`, `datoms/billing`).

4. **MoQ vs iroh-gossip for datoms**: MoQ is pub/sub through a relay. iroh-gossip is decentralized epidemic broadcast. For a small practice (2-5 peers), the relay model is simpler and the relay is already needed for video. Gossip would only matter for truly serverless P2P scenarios.

5. **E2E encryption**: MoQ relay caches and forwards but doesn't inspect content. For practice data (session notes, client info), E2E encryption is likely required. MoQ supports this but it's not built-in — need to add Noise or similar on top. iroh's connections are already E2E encrypted when using iroh transport.

6. **moq-lite maturity**: The moq.dev implementation is active and has Cloudflare backing, but it's still evolving. The IETF spec is at draft 17. Risk assessment: the core pub/sub model is stable; wire format may change. Using moq-lite (not full moq-transport) reduces surface area.

7. **D2TS + MoQ integration**: D2TS expects `(data, time, diff)` tuples. MoQ delivers groups of frames. The adapter is straightforward (group ID = tx version, frame = encoded datom), but needs careful handling of out-of-order group delivery.

8. **hang format for non-media tracks?** Should datom tracks use hang's container format (legacy: varint timestamp + payload)? Or a completely custom format? The hang container is dead simple for the "legacy" mode — just a varint timestamp and raw bytes. Could reuse it.

---

## 13. References

### MoQ
- MoQ docs: https://doc.moq.dev/
- MoQ GitHub: https://github.com/moq-dev/moq
- moq-lite spec: https://doc.moq.dev/spec/draft-lcurley-moq-lite.html
- hang format: https://doc.moq.dev/concept/layer/hang.html
- IETF MoQ Transport: https://datatracker.ietf.org/doc/draft-ietf-moq-transport/
- Cloudflare MoQ launch: https://blog.cloudflare.com/moq/
- MoQ + Iroh integration: https://github.com/moq-dev/moq (see iroh section in README)
- iroh-live (P2P streaming): https://github.com/n0-computer/iroh-live
- MoQ demo: https://moq.dev/
- @moq/lite (TypeScript): https://doc.moq.dev/js/@moq/lite.html
- @moq/hang (TypeScript): https://doc.moq.dev/js/@moq/hang/

### Iroh
- Iroh GitHub: https://github.com/n0-computer/iroh
- Iroh docs: https://docs.iroh.computer
- Iroh blobs: https://www.iroh.computer/docs/protocols/blobs
- Iroh WASM: https://docs.iroh.computer/deployment/wasm-browser-support
- Iroh DAG sync: https://www.iroh.computer/blog/iroh-dag-sync
- BLAKE3 hazmat: https://www.iroh.computer/blog/blake3-hazmat-api
- Lambda Class interview: https://blog.lambdaclass.com/the-wisdom-of-iroh/

### D2TS / Differential Dataflow
- D2TS GitHub: https://github.com/electric-sql/d2ts
- D2TS npm: https://www.npmjs.com/package/@electric-sql/d2ts
- Frank McSherry's DD: https://github.com/TimelyDataflow/differential-dataflow
- DD compaction: Appendix A of sigmod2019-submission.pdf in TimelyDataflow repo
- Materialize "Building DD from Scratch": https://materialize.com/blog/differential-from-scratch/
- Materialize "Managing Memory": https://materialize.com/blog/managing-memory-with-differential-dataflow/

### Loro
- Loro GitHub: https://github.com/loro-dev/loro
- Loro docs: https://loro.dev/docs/tutorial/get_started
- Loro Rust API: https://docs.rs/loro/

### Previous ADR
- v1 (full D2TS compaction details, iroh-blobs verification options, Holepunch analysis): vivief-p2p-lean-stack-adr.md

### Papers
- HyParView (gossip membership): https://asc.di.fct.unl.pt/~jleitao/pdf/dsn07-leitao.pdf
- PlumTree (epidemic broadcast): https://asc.di.fct.unl.pt/~jleitao/pdf/srds07-leitao.pdf
- Differential Dataflow: http://michaelisard.com/pubs/differentialdataflow.pdf
- Fugue (Loro's text algorithm): https://arxiv.org/abs/2305.00583
