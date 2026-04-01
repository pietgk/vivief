# Counselor-Client Session with Keet Video — ADR-0049 Stress Test

> Brainstorm: Walk through a real counseling session to challenge ADR-0049's architecture.
> Both parties have the Tauri app installed. Keet is available on desktop/mobile.
> Focus: data flow, moving parts, strengths, weaknesses, mitigations.

---

## 1. The Scenario

**Anna** — counselor, Tauri desktop app (macOS)
**Erik** — client, Tauri mobile app (iOS)

Both have the vivief Tauri app with Node.js sidecar (Phase 20+ architecture).
Both have Keet installed as a separate app on their device.
A 50-minute therapy session at 09:00 on a Tuesday morning.

---

## 2. Session Lifecycle

### Phase A: Before — Anna Prepares (08:30)

Anna opens vivief on her Mac. Her Node.js sidecar starts, connects to
Hyperswarm, syncs Erik's latest datoms from the always-on server.

```
Anna's Mac
┌─────────────────────────────────────────────────────────┐
│ Tauri Desktop                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ React SPA (WebKit webview)                          │ │
│ │                                                     │ │
│ │  ┌─────────────┐  ┌──────────────────────────────┐  │ │
│ │  │ Client List  │  │ Session Prep Surface         │  │ │
│ │  │              │  │                              │  │ │
│ │  │ ► Erik  ◄────│──│  Last session: Mar 17        │  │ │
│ │  │   Sara       │  │  Themes: sleep, anxiety      │  │ │
│ │  │   Johan      │  │  Risk flags: none            │  │ │
│ │  │              │  │                              │  │ │
│ │  │              │  │  ┌────────────────────────┐  │  │ │
│ │  │              │  │  │ AI Prep Brief           │  │  │ │
│ │  │              │  │  │ "Erik reported improved │  │  │ │
│ │  │              │  │  │  sleep last week.       │  │  │ │
│ │  │              │  │  │  Consider following up  │  │  │ │
│ │  │              │  │  │  on anxiety triggers."  │  │  │ │
│ │  │              │  │  │          trust: 0.85 ▲  │  │  │ │
│ │  │              │  │  └────────────────────────┘  │  │ │
│ │  └─────────────┘  └──────────────────────────────┘  │ │
│ └─────────────────────────────────────────────────────┘ │
│                           │                             │
│                    Protomux (localhost)                  │
│                           │                             │
│ ┌─────────────────────────┴───────────────────────────┐ │
│ │ Node.js Sidecar                                     │ │
│ │ ├── Hypercore 11 (Erik's datoms on disk)            │ │
│ │ ├── d2ts (warm indexes: EAVT, AEVT, AVET, VAET)    │ │
│ │ ├── XState (SessionPrepActor)                       │ │
│ │ │   └── :session/preparation-requested → AI brief   │ │
│ │ └── Hyperswarm ←──── syncs from always-on server    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Data flow — AI prep brief generation:**

```
Hypercore (Erik's history)
    │
    ▼
d2ts query: sessions where client = Erik, last 4 weeks
    │
    ▼
SessionPrepActor receives query results
    │
    ▼
:session/preparation-requested
    │
    ▼
LLM effectHandler (trust 0.85)
    ├── input: session datoms (themes, notes, homework)
    ├── output: prep brief text
    └── provenance: [:tx/source :ai/text-generation, :tx/trust-score 0.85]
    │
    ▼
Datom committed to Hypercore
    │
    ▼
d2ts materializes → React re-renders prep Surface
```

---

### Phase B: Join — Video Call Starts (08:55)

Anna clicks "Start Session" in vivief. Erik receives a notification on
his phone and opens his vivief app.

**This is where Keet enters the picture.**

#### Option 1: Keet Standalone (two apps side by side)

```
Anna's Mac                              Erik's iPhone
┌───────────────┬───────────────┐      ┌───────────────────┐
│ Vivief (Tauri)│ Keet (Pear)   │      │ Keet (Pear)       │
│               │               │      │ ┌───────────────┐ │
│ Session       │ ┌───────────┐ │      │ │ Anna's video  │ │
│ notes,        │ │ Erik's    │ │      │ │               │ │
│ prep brief,   │ │ video     │ │      │ │  ┌─────────┐  │ │
│ AI assist     │ │           │ │      │ │  │ (Anna)  │  │ │
│               │ │  ┌─────┐  │ │      │ │  └─────────┘  │ │
│               │ │  │Erik │  │ │      │ └───────────────┘ │
│               │ │  └─────┘  │ │      │                   │
│               │ └───────────┘ │      │  [Switch to       │
│               │               │      │   Vivief ►]       │
└───────┬───────┴───────┬───────┘      └────────┬──────────┘
        │               │                       │
   Node.js          Bare runtime            Bare runtime
   sidecar          (Keet)                  (Keet)
        │               │                       │
        └───────┬───────┘                       │
           Hyperswarm DHT ◄─────────────────────┘
```

**The deep link flow:**

```
Anna clicks "Start Session with Erik"
    │
    ▼
Vivief creates a Keet room link (via shared keypair)
    │
    ▼
Deep link: keet://<room-topic-key>
    │
    ├──► Anna's Keet opens, joins room
    │
    └──► Push notification to Erik
         Erik taps → Keet opens on iPhone, joins room
    │
    ▼
Keet P2P video established (Noise encrypted, direct)
Vivief Protomux established (datom sync active)
Both running simultaneously
```

#### Option 2: WebRTC Integrated (video inside vivief)

```
Anna's Mac
┌─────────────────────────────────────────────────────────┐
│ Tauri Desktop                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ React SPA                                           │ │
│ │ ┌────────────────────┬────────────────────────────┐ │ │
│ │ │ Erik's video       │ Session Notes (Loro)       │ │ │
│ │ │                    │                            │ │ │
│ │ │   ┌────────────┐   │ > Erik mentioned his sleep │ │ │
│ │ │   │  (Erik)    │   │   improved since starting  │ │ │
│ │ │   │            │   │   the breathing exercises. │ │ │
│ │ │   └────────────┘   │                            │ │ │
│ │ │                    │ AI: theme detected —       │ │ │
│ │ │  ┌──────┐          │ "sleep improvement" ▲0.85  │ │ │
│ │ │  │(Anna)│          │                            │ │ │
│ │ │  └──────┘          │ > Anxiety around work      │ │ │
│ │ │   [WebRTC P2P]     │   deadlines still present. │ │ │
│ │ └────────────────────┴────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────┘ │
│                           │                             │
│                    Protomux (localhost)                  │
│                           │                             │
│ ┌─────────────────────────┴───────────────────────────┐ │
│ │ Node.js Sidecar                                     │ │
│ │ ├── Hypercore 11                                    │ │
│ │ ├── d2ts warm tier                                  │ │
│ │ ├── XState (SessionActor — in-progress state)       │ │
│ │ ├── Protomux channels:                              │ │
│ │ │   ├── hypercore/alpha ──── datom sync             │ │
│ │ │   ├── loro-text/v1 ─────── session notes CRDT     │ │
│ │ │   ├── datom-app/v1 ─────── queries, presence      │ │
│ │ │   └── media-signal/v1 ─── WebRTC signaling    NEW │ │
│ │ └── Hyperswarm (peer discovery)                     │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
              │                              │
              │   Noise-encrypted stream     │
              │   via Hyperswarm             │
              ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│ Erik's iPhone — Tauri Mobile                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ React SPA (system webview)                          │ │
│ │ ┌────────────────────────────────────────────────┐  │ │
│ │ │ Anna's video              │ Session in progress│  │ │
│ │ │   ┌────────────┐          │ Themes: sleep ✓   │  │ │
│ │ │   │  (Anna)    │          │         anxiety    │  │ │
│ │ │   └────────────┘          │                    │  │ │
│ │ │                           │ Homework:          │  │ │
│ │ │   [WebRTC P2P]            │ □ Breathing 2x/day│  │ │
│ │ └────────────────────────────────────────────────┘  │ │
│ └─────────────────────────────────────────────────────┘ │
│                           │                             │
│ ┌─────────────────────────┴───────────────────────────┐ │
│ │ Node.js Sidecar                                     │ │
│ │ ├── Hypercore 11 (sparse — Erik's own data)         │ │
│ │ ├── d2ts (warm, partial indexes)                    │ │
│ │ ├── Protomux channels (same 4 channels)             │ │
│ │ └── Hyperswarm (discovers Anna's peer)              │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**WebRTC signaling via Protomux:**

```
Anna clicks "Start Video"
    │
    ▼
SessionActor sends :media/video-started
    │
    ▼
media-signal/v1 channel:
    Anna → SDP offer → Protomux → Erik
    Erik → SDP answer → Protomux → Anna
    Anna ↔ ICE candidates ↔ Erik
    │
    ▼
WebRTC P2P connection established
Video/audio flows DIRECTLY between browsers (not through Protomux)
    │
    ▼
Protomux continues carrying: datoms, Loro text, queries
WebRTC carries: video, audio
```

---

### Phase C: During — The 50-Minute Session

**All parallel data streams:**

```
Anna (Tauri Desktop)                    Erik (Tauri Mobile)
        │                                       │
        │◄══════════ WebRTC P2P ══════════════►│
        │         video + audio                  │
        │         (encrypted, direct)            │
        │                                       │
        │◄──── hypercore/alpha ────────────────►│
        │    datom feed sync                     │
        │    (Noise encrypted via Hyperswarm)    │
        │                                       │
        │◄──── loro-text/v1 ───────────────────►│
        │    session notes CRDT                  │
        │    (Anna types, Erik sees read-only)   │
        │                                       │
        │◄──── datom-app/v1 ───────────────────►│
        │    d2ts diffs, actor snapshots,        │
        │    theme detections, homework updates  │
        │                                       │
        │◄──── media-signal/v1 ────────────────►│
        │    WebRTC renegotiation if needed      │
        │                                       │
        ▼                                       ▼
  Always-on Server (relay + persistence)
  ├── Stores Anna's full Hypercore feed
  ├── Stores Erik's sparse Hypercore feed
  └── Bridges when direct P2P fails (NAT issues)
```

**What happens when Anna types a session note:**

```
Anna types in session notes textarea
    │
    ▼
Loro editor in webview creates text operation
    │
    ▼
loro-text/v1 Protomux channel → Erik's sidecar
    │                                │
    ▼                                ▼
Anna's Hypercore appends         Erik's d2ts receives
Loro snapshot datom              text update, re-renders
    │
    ▼
AI effectHandler monitors note content
    │
    ▼
Theme detected: "sleep improvement"
    │
    ▼
Datom: [session:42 :session/theme "sleep-improvement" tx:88 assert]
       [tx:88 :tx/source :ai/text-generation tx:88 assert]
       [tx:88 :tx/trust-score 0.85 tx:88 assert]
    │
    ▼
datom-app/v1 channel → Erik sees theme badge on his Surface
```

**What happens when AI detects a risk flag:**

```
AI effectHandler scans note content continuously
    │
    ▼
Detects: "Erik mentioned not eating for two days"
    │
    ▼
Guard Contract evaluates: risk keyword detected
    │
    ▼
:risk/flag-detected
    │
    ▼
SessionActor transitions to "risk-flagged" state
    │
    ▼
Datom: [session:42 :session/risk-flag "nutrition-concern" tx:89 assert]
       [tx:89 :tx/source :system/analysis tx:89 assert]
       [tx:89 :tx/trust-score 1.0 tx:89 assert]  ← system actor
    │
    ▼
Anna's Surface shows: ⚠ Risk flag — nutrition concern
Erik does NOT see the risk flag (Projection scope: counselor-only)
```

---

### Phase D: After — Session Ends (09:50)

```
Anna clicks "End Session"
    │
    ▼
SessionActor transitions: in-progress → completing
    │
    ├── WebRTC video call ends (media-signal/v1: :media/call-ended)
    │
    ├── AI generates session summary
    │   └── Input: session notes, themes, risk flags
    │   └── Output: summary datom (trust 0.85)
    │
    ├── Anna reviews summary in vivief
    │   └── Approves → datom trust elevated
    │       [tx:91 :tx/trust-score 0.95 tx:91 assert]  ← human-reviewed
    │
    ├── Homework assigned
    │   [homework:1 :homework/description "Continue breathing 2x/day" tx:92 assert]
    │   [homework:1 :homework/session session:42 tx:92 assert]
    │   [homework:1 :homework/client client:erik tx:92 assert]
    │
    └── Next appointment scheduled
        [appointment:next :appointment/date "2026-04-01T09:00" tx:93 assert]
        [appointment:next :appointment/client client:erik tx:93 assert]
    │
    ▼
SessionActor transitions: completing → completed
All datoms sync to always-on server
Erik's app shows: session summary, homework, next appointment
```

---

### Phase E: Between Sessions

```
Erik (mobile, offline at times)          Anna (desktop, reviewing patterns)
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ Vivief Mobile                │        │ Vivief Desktop               │
│                              │        │                              │
│ Homework tracker:            │        │ Cross-client pattern view:   │
│ ☑ Breathing — Mon            │        │                              │
│ ☑ Breathing — Tue            │        │ Erik:  sleep ▲ anxiety ─     │
│ □ Breathing — Wed            │        │ Sara:  mood ▲  sleep ─      │
│ □ Breathing — Thu            │        │ Johan: anxiety ▼ (improved)  │
│                              │        │                              │
│ Erik checks off homework     │        │ AI pattern across clients:   │
│     │                        │        │ "3 of 8 clients report       │
│     ▼                        │        │  work deadline anxiety       │
│ Datom committed to           │        │  this week" (trust 0.85)     │
│ local Hypercore              │        │                              │
│     │                        │        │                              │
│     ▼ (when online)          │        │                              │
│ Syncs to always-on server ───│───────►│ Anna's d2ts picks up         │
│                              │        │ Erik's homework completion   │
└──────────────────────────────┘        └──────────────────────────────┘
```

---

## 3. Keet Integration Models

### Model A: Keet Standalone (separate app, deep linking)

```
┌─ Anna's Device ──────────────────────────────────────────┐
│                                                          │
│  ┌──────────────────┐        ┌──────────────────┐       │
│  │ Vivief (Tauri)    │  deep  │ Keet (Pear)      │       │
│  │                   │  link  │                  │       │
│  │ "Start Video" ────│───────►│ Room: session-42 │       │
│  │                   │        │ Video: ✓         │       │
│  │ Session notes     │        │ Audio: ✓         │       │
│  │ AI assist         │        │                  │       │
│  │ Datom sync        │        │ P2P encrypted    │       │
│  └────────┬─────────┘        └────────┬─────────┘       │
│           │                           │                  │
│      Node.js sidecar            Bare runtime             │
│      Hyperswarm ─────────────── Hyperswarm               │
│      (vivief topic)             (keet room topic)        │
│           │                           │                  │
│           └───────── HyperDHT ────────┘                  │
│                   (one DHT, two apps)                    │
└──────────────────────────────────────────────────────────┘
```

**Pros:**
- Both apps use Hyperswarm — same DHT, shared network presence
- Keet handles video perfectly (battle-tested via Keet app)
- Vivief handles data perfectly (Protomux, Hypercore, d2ts)
- Clean separation of concerns

**Cons:**
- Two apps running simultaneously (UX friction, especially mobile)
- Two runtimes (Node.js for vivief, Bare for Keet) — more memory
- App switching on mobile is disruptive during therapy
- "In-room apps" (v0.6 vision) not available outside Pear ecosystem
- Identity management: same keypair must be shared between apps

**Identity sharing challenge:**

```
ED25519 Noise Keypair
┌─────────────────────────────┐
│ ~/.vivief/keypair.json      │ ← vivief generates this
│ { publicKey, secretKey }    │
└──────────────┬──────────────┘
               │
        Can Keet read this?
               │
               ▼
┌─────────────────────────────┐
│ Keet stores keys in its own │ ← Keet has its own key storage
│ Pear/Bare storage           │
│ NOT the same file           │
└─────────────────────────────┘

Problem: Two separate key stores.
Mitigation: On first run, import vivief key into Keet
            (QR code scan? Copy-paste? Shared keychain?)
```

---

### Model B: Keet Media Engine Embedded (inside vivief)

```
┌─ Vivief (Tauri) ──────────────────────────────┐
│                                                │
│  React SPA (webview)                           │
│  ├── Video display (WebRTC or Keet stream)     │
│  ├── Session notes (Loro)                      │
│  └── AI assist surface                         │
│                                                │
│  Node.js sidecar                               │
│  ├── Hyperswarm                                │
│  ├── Protomux                                  │
│  │   ├── hypercore/alpha                       │
│  │   ├── loro-text/v1                          │
│  │   ├── datom-app/v1                          │
│  │   └── keet-media/v1  ← Keet media protocol  │
│  │                                             │
│  └── Keet Media Engine  ← Does this exist?     │
│      ├── WebRTC ICE negotiation                │
│      ├── Video codec (VP8/VP9/AV1)             │
│      ├── Audio codec (Opus)                    │
│      └── Noise encryption layer                │
└────────────────────────────────────────────────┘
```

**Status: NOT FEASIBLE TODAY**

Keet does not expose a media SDK or embeddable video engine. The Keet
application is a monolithic Pear app — its media handling is internal,
not available as a library.

**What would make this feasible:**
- Holepunch releases `keet-media` as a standalone npm package
- Or: community builds a Hyperswarm-native WebRTC bridge
- Or: we build our own media engine using standard WebRTC + Protomux signaling

---

### Model C: WebRTC Inside Vivief (Protomux signaling)

```
┌─ Vivief (Tauri) ──────────────────────────────┐
│                                                │
│  React SPA                                     │
│  ├── Video: <video> element with WebRTC stream │
│  ├── getUserMedia() for camera/mic             │
│  └── RTCPeerConnection manages P2P video       │
│       │                                        │
│       │ SDP + ICE candidates                   │
│       ▼                                        │
│  Node.js sidecar                               │
│  ├── Protomux                                  │
│  │   ├── hypercore/alpha                       │
│  │   ├── loro-text/v1                          │
│  │   ├── datom-app/v1                          │
│  │   └── media-signal/v1  ← NEW channel        │
│  │       ├── SDP offer/answer relay            │
│  │       ├── ICE candidate relay               │
│  │       └── Call state (ringing/active/ended)  │
│  │                                             │
│  └── Hyperswarm (peer discovery for signaling) │
└────────────────────────────────────────────────┘
        │                                │
        │ Protomux (Noise encrypted)     │ WebRTC (DTLS encrypted)
        │ datoms, text, signaling        │ video, audio
        ▼                                ▼
┌─ Erik's Vivief (Tauri Mobile) ─────────────────┐
│  Same architecture, same channels               │
│  WebRTC P2P connection for video                 │
│  Protomux for everything else                    │
└──────────────────────────────────────────────────┘
```

**Pros:**
- One app — no switching, clean UX
- WebRTC is browser-native — works in any webview (Tauri, browser)
- Signaling via Protomux — reuses existing encrypted P2P infrastructure
- No dependency on Keet — fully self-contained
- Video is E2E encrypted (DTLS) independent of Protomux encryption (Noise)

**Cons:**
- Must build video UI (camera selection, mute, screen share)
- WebRTC TURN fallback needed when direct P2P fails (NAT traversal)
- No Keet ecosystem benefits (room management, group calls, etc.)
- Quality/reliability depends on our implementation, not Keet's battle-tested one

---

## 4. Full Moving Parts Diagram

**Model A — Keet Standalone + Vivief (recommended for Phase 20-25):**

```
┌─── Anna's Mac ──────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─ Vivief (Tauri) ─────────────────┐  ┌─ Keet (Pear) ──────────────┐ │
│  │ React SPA                        │  │                             │ │
│  │ ├── Session prep Surface         │  │  Video call with Erik       │ │
│  │ ├── Live session notes (Loro)    │  │  ┌─────────┐               │ │
│  │ ├── AI assist (themes, risks)    │  │  │ Erik's  │               │ │
│  │ └── Homework manager             │  │  │ face    │               │ │
│  │                                  │  │  └─────────┘               │ │
│  │ Node.js sidecar                  │  │  Bare runtime              │ │
│  │ ├── Hypercore 11                 │  │  └── Keet P2P media        │ │
│  │ ├── d2ts + XState               │  │                             │ │
│  │ └── Hyperswarm ◄────────────────►│──│── Hyperswarm               │ │
│  │     Protomux channels:           │  │   (same DHT)               │ │
│  │     ├── hypercore/alpha          │  │                             │ │
│  │     ├── loro-text/v1             │  │                             │ │
│  │     └── datom-app/v1             │  │                             │ │
│  └──────────────┬───────────────────┘  └──────────────┬──────────────┘ │
│                 │                                      │                │
└─────────────────┼──────────────────────────────────────┼────────────────┘
                  │            Internet                  │
                  │  (Noise encrypted)   (Keet P2P encrypted)
                  │                                      │
┌─────────────────┼──────────────────────────────────────┼────────────────┐
│                 │     Always-on Server                  │                │
│  ┌──────────────┴──────────────┐                       │                │
│  │ Hypercore relay             │                       │                │
│  │ (stores feeds, bridges      │                       │                │
│  │  offline peers)             │                       │                │
│  └──────────────┬──────────────┘                       │                │
└─────────────────┼──────────────────────────────────────┼────────────────┘
                  │                                      │
┌─────────────────┼──────────────────────────────────────┼────────────────┐
│                 │     Erik's iPhone                     │                │
│  ┌──────────────┴──────────────┐  ┌────────────────────┴─────────────┐ │
│  │ Vivief (Tauri Mobile)       │  │ Keet (Pear Mobile)               │ │
│  │ React SPA                   │  │                                  │ │
│  │ ├── Session view (read)     │  │  Video call with Anna            │ │
│  │ ├── Homework tracker        │  │  ┌─────────┐                    │ │
│  │ └── Next appointment        │  │  │ Anna's  │                    │ │
│  │                             │  │  │ face    │                    │ │
│  │ Node.js sidecar             │  │  └─────────┘                    │ │
│  │ ├── Hypercore 11 (sparse)   │  │  Bare runtime                   │ │
│  │ ├── d2ts (partial)          │  │  └── Keet P2P media             │ │
│  │ └── Hyperswarm              │  │      Hyperswarm (same DHT)      │ │
│  └─────────────────────────────┘  └──────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

Legend:
═══  Video/audio (Keet P2P)
───  Datom data (Protomux over Hyperswarm)
◄──► Shared DHT presence
```

**Model C — WebRTC Inside Vivief (recommended for Phase 25+):**

```
┌─── Anna's Mac ──────────────────────────────────────────┐
│                                                          │
│  ┌─ Vivief (Tauri) ──────────────────────────────────┐  │
│  │ React SPA                                         │  │
│  │ ├── Video + notes side by side                    │  │
│  │ ├── getUserMedia → RTCPeerConnection              │  │
│  │ └── All-in-one session workspace                  │  │
│  │                                                   │  │
│  │ Node.js sidecar                                   │  │
│  │ ├── Hypercore 11 (full feed)                      │  │
│  │ ├── d2ts + XState (SessionActor)                  │  │
│  │ └── Hyperswarm + Protomux                         │  │
│  │     ├── hypercore/alpha ────── datom sync         │  │
│  │     ├── loro-text/v1 ───────── notes CRDT         │  │
│  │     ├── datom-app/v1 ───────── queries, presence  │  │
│  │     └── media-signal/v1 ────── WebRTC signaling   │  │
│  └────────────────┬──────────────────────────────────┘  │
│                   │                                      │
└───────────────────┼──────────────────────────────────────┘
                    │
      ┌─────────────┤ Noise-encrypted Hyperswarm stream
      │             │ carries Protomux channels
      │             │
      │    ┌────────┘
      │    │
      │    │         ┌──── WebRTC P2P (direct, DTLS encrypted)
      │    │         │     video + audio
      │    │         │
┌─────┼────┼─────────┼────────────────────────────────────────┐
│     ▼    ▼         ▼   Erik's iPhone                        │
│  ┌─ Vivief (Tauri Mobile) ───────────────────────────────┐  │
│  │ React SPA                                             │  │
│  │ ├── Video + session view                              │  │
│  │ ├── Homework tracker                                  │  │
│  │ └── RTCPeerConnection ↔ Anna                          │  │
│  │                                                       │  │
│  │ Node.js sidecar                                       │  │
│  │ ├── Hypercore 11 (sparse)                             │  │
│  │ └── Hyperswarm + Protomux (same 4 channels)           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

Data paths:
─────  Protomux channels (datoms, text, queries, signaling) via Hyperswarm
═════  WebRTC (video, audio) via direct P2P after ICE negotiation
```

---

## 5. ADR-0049 Strengths Exposed

| # | Strength | Why it matters for this scenario |
|---|----------|--------------------------------|
| **S1** | Node.js sidecar runs full Holepunch | Both Anna and Erik have Hyperswarm, Hypercore, Protomux natively. Peer discovery "just works." |
| **S2** | Same React SPA everywhere | Anna's desktop and Erik's mobile render the same session UI. One codebase. |
| **S3** | Protomux channels already defined | `hypercore/alpha`, `loro-text/v1`, `datom-app/v1` handle all datom data flows without new infrastructure. Adding `media-signal/v1` is one `createChannel` call. |
| **S4** | Noise keypair as identity | The same identity model works for Hyperswarm peer auth AND Keet identity — conceptually aligned even if key sharing needs implementation. |
| **S5** | Always-on server as relay | When Erik's phone sleeps mid-session, the server holds his datoms until he reconnects. No data loss. |
| **S6** | Trust model on all datoms | AI-generated prep briefs carry `:tx/trust-score 0.85`. Anna's approved summary carries `0.95`. Erik's self-reported homework carries `1.0`. Everything is auditable. |
| **S7** | Projection scoping | Risk flags visible to Anna only (counselor scope). Erik sees themes but not risk assessment. The Projection's `scope` field handles this. |

---

## 6. ADR-0049 Weaknesses Exposed

| # | Weakness | Impact |
|---|----------|--------|
| **W1** | Keet is Pear/Bare — vivief is Tauri/Node.js | Two separate apps, two runtimes on the same device. Cannot share a Hyperswarm instance across process boundaries. Each maintains its own DHT presence. |
| **W2** | "In-room apps" is Pear-only | The v0.6 vision of Keet room launching vivief as an in-room app only works within the Pear ecosystem. Tauri apps cannot be launched as Pear in-room apps. |
| **W3** | No embeddable Keet media SDK | Cannot integrate Keet's video engine inside vivief. Must either use Keet standalone or build WebRTC from scratch. |
| **W4** | Mobile Node.js sidecar is unproven | Tauri v2 supports iOS/Android, but running a Node.js sidecar on mobile is not established. Memory and battery impact on phones is unknown. iOS may background-kill the sidecar. |
| **W5** | Two apps on mobile = poor UX | Switching between Keet (video) and vivief (notes) on a phone during a therapy session is disruptive. Split-screen is not available on all devices. |
| **W6** | Identity not shared automatically | Vivief's Noise keypair and Keet's Noise keypair are stored in different locations by different runtimes. Requires manual import or a shared keychain mechanism. |
| **W7** | WebRTC TURN fallback | If WebRTC direct P2P fails (symmetric NAT), a TURN relay server is needed. This adds a server dependency that doesn't exist in the Keet P2P model. |

---

## 7. Mitigations

### M1: Keet + Vivief Hyperswarm Coexistence (for W1)

Two Hyperswarm instances on the same device IS valid. They're separate
peers on the same DHT — like two people in the same room.

```
Device DHT presence:
┌────────────────────────────────────────┐
│ HyperDHT (global)                      │
│                                        │
│  vivief peer: ed25519:abc...           │
│  ├── announces on vivief workspace topic│
│  └── Protomux: datom channels          │
│                                        │
│  keet peer: ed25519:def...             │
│  ├── announces on keet room topic      │
│  └── Protomux: media channels          │
│                                        │
│  Two peers, one device, one DHT. OK.   │
└────────────────────────────────────────┘
```

**Mitigation level: Full.** This is how DHTs work. No architectural change needed.

### M2: Deep Linking Replaces In-Room Apps (for W2)

```
Anna clicks "Start Video" in vivief
    │
    ▼
Vivief generates a Keet room link:
    keet://<room-topic-derived-from-session-id>
    │
    ├──► OS launches Keet on Anna's device
    │    Keet joins the room, video starts
    │
    └──► Vivief sends push notification to Erik
         Notification contains keet:// deep link
         Erik taps → Keet opens, joins room
```

Not as seamless as in-room apps, but functional. The session ID
can derive a deterministic Keet room topic so both apps independently
compute the same room to join.

**Mitigation level: Partial.** Works but has UX friction (app switching).

### M3: WebRTC for Self-Contained Video (for W3, W5)

Build video calling inside vivief using standard WebRTC. The browser's
(or Tauri webview's) `getUserMedia` + `RTCPeerConnection` APIs are
mature and battle-tested.

**New Protomux channel — `media-signal/v1`:**

```
Channel: media-signal/v1
Messages:
  ├── call-offer    { sessionId, sdp }
  ├── call-answer   { sessionId, sdp }
  ├── ice-candidate { sessionId, candidate }
  ├── call-end      { sessionId, reason }
  └── call-state    { sessionId, state: ringing|active|held|ended }
```

Signaling flows through the existing Noise-encrypted Protomux connection.
Video/audio flows directly P2P via WebRTC's own DTLS encryption.

**Mitigation level: Full (for W3, W5).** Eliminates Keet dependency for
video entirely. One app, one UX, video + data in the same window.

### M4: Shared Identity File (for W6)

```
~/.vivief/
  └── identity/
      └── noise-keypair.json
          { publicKey: "ed25519:...", secretKey: "..." }

On Keet first launch:
  → Vivief offers "Link Keet identity"
  → Generates a signed proof from vivief keypair
  → QR code displayed in vivief
  → Scan in Keet → Keet imports the keypair
```

Alternatively, both apps read from a shared OS keychain entry.

**Mitigation level: Partial.** Requires implementation but is technically straightforward.

### M5: Mobile Sidecar Strategy (for W4)

Three options for mobile:

```
Option 1: Node.js SEA (Single Executable Application)
  └── Bundle Node.js + sidecar as one binary
      Tauri launches it as a sidecar process
      Memory: ~50-80 MB on iOS
      Risk: iOS may background-kill it

Option 2: Bare-Kit Worklet (Holepunch's approach)
  └── Embed Bare runtime in the mobile app
      Lighter than Node.js (~20-30 MB)
      Designed for mobile embedding
      Risk: experimental, less documented

Option 3: Server-Relayed Mode (no mobile sidecar)
  └── Mobile app connects to always-on server
      Server runs Hypercore, d2ts, Protomux
      Mobile is a thin client (like browser in Phase 1-19)
      Risk: no offline, depends on connectivity
```

**Recommended:** Start with Option 3 (server-relayed) for mobile clients.
Upgrade to Option 1 or 2 when mobile sidecar is proven via a spike.

**Mitigation level: Partial.** Option 3 works today. Options 1 & 2 need spikes.

### M6: TURN Server for WebRTC Fallback (for W7)

```
WebRTC connection attempt:
    │
    ├── Direct P2P works? ──► Great, no relay needed
    │
    └── NAT blocks direct? ──► TURN relay fallback
                                │
                                ▼
                        vivief TURN server
                        (self-hosted or managed)
                        Only carries encrypted media
                        Does NOT see content (DTLS)
```

TURN servers are standard WebRTC infrastructure. Can be self-hosted
(coturn) or use a managed service. The TURN server only relays
encrypted bytes — same "blind relay" principle as dht-relay.

**Mitigation level: Full.** Standard solution, well-understood.

---

## 8. Recommended Integration Path

```
Phase 20-25: Keet Standalone + Deep Linking (Model A)
─────────────────────────────────────────────────────
✓ Keet handles video (proven, battle-tested)
✓ Vivief handles data (Protomux, Hypercore, d2ts)
✓ Deep links connect the two apps
✗ Two apps running (UX friction on mobile)
✗ Identity requires manual linking

Phase 25+: WebRTC Inside Vivief (Model C)
─────────────────────────────────────────
✓ One app — video + data in same window
✓ Signaling via media-signal/v1 Protomux channel
✓ WebRTC is browser/webview-native
✓ No Keet dependency for core workflow
✗ Must build video UI (camera, mute, screen share)
✗ Needs TURN fallback server

Long Term: If Keet Exposes Media SDK (Model B)
──────────────────────────────────────────────
✓ Best of both: Keet's proven media + vivief's data
✓ Single app, single runtime
? Depends on Holepunch releasing a media SDK
? No timeline or commitment from Holepunch
```

---

## 9. Impact on ADR-0049

### What ADR-0049 Gets Right

The core architecture holds. Node.js sidecar with Hyperswarm + Protomux
enables all datom data flows. The React SPA renders identically on
desktop and mobile. The phased approach (browser → Tauri) is sound.

### What ADR-0049 Should Address

| Item | Recommendation |
|------|---------------|
| **`media-signal/v1` channel** | Add to ADR-0047's Protomux channel list when WebRTC video is built (Phase 25+). This is a natural fourth channel, not an architecture change. |
| **Mobile sidecar spike** | Add to ADR-0049's spike table: "Node.js sidecar on iOS/Android via Tauri v2" — Pre-Phase 20. This is the biggest unvalidated assumption. |
| **Keet identity sharing** | Add spike: "Noise keypair sharing between vivief and Keet" — Phase 20. Validates that both apps can use the same identity. |
| **TURN server** | If WebRTC is adopted (Phase 25+), a TURN server is needed as NAT fallback. This is standard infrastructure but should be noted in the deployment model. |
| **Mobile thin-client fallback** | ADR-0049 should acknowledge that mobile clients MAY operate in server-relayed mode (like Phase 1-19 browser) if the mobile sidecar proves impractical. This preserves the architecture's "progressive enhancement" principle. |

### New Spikes

| Spike | Phase | What it unblocks |
|-------|-------|-----------------|
| Node.js sidecar on iOS (Tauri v2 mobile) | Pre-Phase 20 | Mobile app architecture — determines sidecar vs thin-client |
| Noise keypair sharing (vivief ↔ Keet) | Phase 20 | Keet standalone integration (Model A) |
| WebRTC signaling over Protomux | Phase 25 | Integrated video (Model C) |
| Bare-Kit as mobile alternative to Node.js sidecar | Phase 25 | Lighter mobile sidecar if Node.js SEA is too heavy |
