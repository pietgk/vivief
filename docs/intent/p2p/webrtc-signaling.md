# WebRTC Signaling over Protomux — Can We Kill the Signal Server?

> Brainstorm: Deep technical analysis of using Protomux as the WebRTC
> signaling channel, eliminating the traditional centralized signal server.
> Builds on the `media-signal/v1` channel proposed in
> `counselor-session-keet-challenge.md` Model C.

---

## 1. The Problem with Traditional WebRTC

WebRTC is peer-to-peer for **media** but requires a **centralized server**
for signaling. This is the paradox everyone hits:

```
Traditional WebRTC — the "P2P" that needs 3 servers:

┌─────────┐                                      ┌─────────┐
│ Alice   │                                      │  Bob    │
│ browser │                                      │ browser │
└────┬────┘                                      └────┬────┘
     │                                                │
     │  1. "What's my public IP?"                     │
     ├──────────────► STUN Server ◄───────────────────┤
     │                (Google, Twilio)                 │
     │  2. SDP offer + ICE candidates                 │
     ├──────────────► Signal Server ──────────────────►│
     │                (YOUR server)                    │
     │  3. SDP answer + ICE candidates                │
     │◄────────────── Signal Server ◄──────────────────┤
     │                                                │
     │  4. Direct P2P (if NAT allows)                 │
     │◄═══════════════ media ════════════════════════►│
     │                                                │
     │  4b. TURN relay (if NAT blocks ~15% of cases)  │
     │◄══════════════► TURN Server ◄═════════════════►│
     │                (coturn, Twilio)                 │
     │                                                │

Three servers. Two you don't control (STUN, TURN).
One you must build and operate (Signal Server).
```

**What the signal server actually carries:**

| Message | Direction | Size | When |
|---------|-----------|------|------|
| SDP offer | caller → callee | 1-5 KB | Once, at start |
| SDP answer | callee → caller | 1-5 KB | Once, in response |
| ICE candidate | both directions | 100-300 bytes each | 5-20 per side, trickled |
| Call state | both directions | ~50 bytes | Ringing, active, ended |

**Total signaling data: 10-15 KB.** The signal server exists to relay
~15 KB of text between two peers who don't yet have a direct connection.
That's the entire job.

---

## 2. What We Already Have: Hyperswarm + Protomux

By the time vivief reaches Phase 20+, both peers have:

```
┌─── Anna's Device ──────────────────────────────┐
│                                                  │
│  Node.js sidecar                                 │
│  ├── Hyperswarm (peer discovery, NAT traversal)  │
│  ├── HyperDHT (DHT, hole-punching)              │
│  ├── Noise secret stream (E2E encrypted)          │
│  └── Protomux (multiplexed channels)              │
│      ├── hypercore/alpha ── datom feed sync       │
│      ├── loro-text/v1 ───── rich text CRDT        │
│      └── datom-app/v1 ───── queries, presence     │
│                                                  │
└──────────────────┬───────────────────────────────┘
                   │
        Noise-encrypted stream
       (already NAT-traversed!)
                   │
┌──────────────────┴───────────────────────────────┐
│                                                  │
│  Node.js sidecar                                 │
│  └── Protomux (same 3 channels)                  │
│                                                  │
└─── Erik's Device ────────────────────────────────┘
```

**The key insight: we already solved the hard parts.**

| WebRTC needs | What we already have | Status |
|--------------|---------------------|--------|
| Peer discovery | HyperDHT — find peers by topic | ✅ Done |
| NAT traversal | HyperDHT hole-punching + UDX | ✅ Done |
| Encrypted channel | Noise protocol (E2E) | ✅ Done |
| Reliable message delivery | Protomux channels | ✅ Done |
| Relay fallback | dht-relay (blind WebSocket relay) | ✅ Done |
| Signal server | **This is the gap** | ❌ Need to fill |

The signal server's job is to relay ~15 KB of text between two peers.
We have a Noise-encrypted, NAT-traversed, multiplexed channel between
them. **The signal server is already built. We just need to name a
channel for it.**

---

## 3. The Proposal: `media-signal/v1` Protomux Channel

```
┌─── Anna ──────────────────────┐     ┌─── Erik ──────────────────────┐
│                                │     │                                │
│  Tauri webview                 │     │  Tauri webview                 │
│  ├── getUserMedia() ► camera   │     │  ├── getUserMedia() ► camera   │
│  ├── RTCPeerConnection         │     │  ├── RTCPeerConnection         │
│  └── <video> element           │     │  └── <video> element           │
│       │                        │     │       ▲                        │
│       │ SDP + ICE              │     │       │ SDP + ICE              │
│       ▼                        │     │       │                        │
│  Node.js sidecar               │     │  Node.js sidecar               │
│  └── Protomux                  │     │  └── Protomux                  │
│      ├── hypercore/alpha       │     │      ├── hypercore/alpha       │
│      ├── loro-text/v1          │     │      ├── loro-text/v1          │
│      ├── datom-app/v1          │     │      ├── datom-app/v1          │
│      └── media-signal/v1  ◄────│─────│──────► media-signal/v1        │
│          NEW — carries:        │     │          NEW — carries:        │
│          • SDP offer/answer    │     │          • SDP offer/answer    │
│          • ICE candidates      │     │          • ICE candidates      │
│          • call state          │     │          • call state          │
│                                │     │                                │
└────────────────────────────────┘     └────────────────────────────────┘
         │                                        │
         │    Noise-encrypted Protomux stream      │
         │    (Hyperswarm, already connected)       │
         └────────────────────────────────────────┘
                          +
         ┌────────────────────────────────────────┐
         │    WebRTC P2P (DTLS-SRTP encrypted)     │
         │    video + audio direct between peers   │
         └────────────────────────────────────────┘
```

### 3.1 Channel Message Types

```javascript
const channel = mux.createChannel({
  protocol: 'media-signal/v1',
  id: sessionIdBuffer  // scoped to the vivief session
})

// Message types — compact-encoded
const callOffer = channel.addMessage({
  encoding: c.raw,   // or protobuf, or compact-encoding schema
  onmessage(buf) {
    const { sessionId, sdp } = decode(buf)
    peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: 'offer', sdp
    }))
  }
})

const callAnswer = channel.addMessage({ /* SDP answer */ })
const iceCandidate = channel.addMessage({ /* trickle ICE candidate */ })
const callState = channel.addMessage({ /* ringing | active | held | ended */ })
```

### 3.2 Message Flow

```
Time ──►

Anna (caller)                  Protomux                     Erik (callee)
     │                    media-signal/v1                         │
     │                                                            │
     │  createOffer()                                             │
     │  setLocalDescription(offer)                                │
     │                                                            │
     ├── call-offer { sdp } ──────────────────────────────────────►│
     │                                                            │
     │                           setRemoteDescription(offer)      │
     │                           createAnswer()                   │
     │                           setLocalDescription(answer)      │
     │                                                            │
     │◄─────────────────────────────────────── call-answer { sdp }─┤
     │                                                            │
     │  setRemoteDescription(answer)                              │
     │                                                            │
     │  ICE gathering starts                    ICE gathering starts
     │                                                            │
     ├── ice-candidate { candidate } ─────────────────────────────►│
     │◄───────────────────────────────── ice-candidate { candidate }┤
     ├── ice-candidate { candidate } ─────────────────────────────►│
     │◄───────────────────────────────── ice-candidate { candidate }┤
     │    ... trickle ICE continues ...                           │
     │                                                            │
     │  ICE connected ─────────── WebRTC P2P ─────── ICE connected│
     │                                                            │
     ├── call-state { active } ───────────────────────────────────►│
     │◄──────────────────────────────── call-state { active } ─────┤
     │                                                            │
     │◄═══════════════ video + audio (DTLS-SRTP) ════════════════►│
     │                    direct P2P                               │
```

**Total implementation: one `createChannel` call + four message types.**
The Protomux connection is already established. The encryption is already
there (Noise). The NAT traversal is already done (HyperDHT).

---

## 4. What Happens at Each NAT Scenario

### 4.1 Both Peers Have Open NAT (best case ~40%)

```
                    HyperDHT
                   (discovery)
Anna ──────────────────┼────────────────── Erik
  │                    │                     │
  │  1. Hyperswarm connects directly (UDX)   │
  │◄═════════════════════════════════════════►│
  │     Protomux: datom channels active       │
  │                                          │
  │  2. SDP + ICE over media-signal/v1       │
  │◄──────── Protomux messages ──────────────►│
  │                                          │
  │  3. WebRTC connects directly (new UDP)   │
  │◄═══════════════ media ══════════════════►│
  │     video flows P2P                       │

Servers used: 0
STUN used: only for candidate gathering (optional — host candidates work)
```

### 4.2 One or Both Behind Cone NAT (~45%)

```
Anna (behind NAT)              Erik (behind NAT)
  │                               │
  │  1. HyperDHT hole-punches    │
  │     (STUN-like discovery       │
  │      + port prediction)        │
  │◄═══════════ UDX ═════════════►│
  │     Protomux active            │
  │                               │
  │  2. SDP + ICE over Protomux   │
  │◄──── media-signal/v1 ────────►│
  │                               │
  │  3. WebRTC ICE also succeeds  │
  │     (same NAT type → same     │
  │      hole-punching works)     │
  │◄═══════════ media ═══════════►│

Servers used: 0 (HyperDHT bootstrap nodes assist but are not relays)
STUN used: for ICE candidate gathering (Google STUN or self-hosted)

Key insight: If HyperDHT hole-punching succeeded, WebRTC ICE
will almost certainly also succeed. The NAT that allowed one
UDP hole-punch will allow another.
```

### 4.3 Symmetric NAT (~15%)

```
Anna (symmetric NAT)          Erik (any NAT)
  │                               │
  │  1. HyperDHT tries hole-punch │
  │     ✗ Fails (symmetric NAT)   │
  │                               │
  │  2. Fallback: dht-relay       │
  │──── WebSocket ──► dht-relay ──── UDP ──►│
  │     Protomux active (via relay)          │
  │     Noise encryption preserved           │
  │                                          │
  │  3. SDP + ICE over Protomux              │
  │     (works — Protomux is connected)      │
  │◄──── media-signal/v1 ───────────────────►│
  │                                          │
  │  4. WebRTC ICE:                          │
  │     ✗ Direct fails (symmetric NAT)       │
  │     ✓ TURN relay needed for media        │
  │◄═══► TURN server ◄══════════════════════►│
  │      (coturn, self-hosted)               │
  │      only encrypted media bytes          │

Servers used: dht-relay (signaling transport), TURN (media relay)
Both are blind relays — see only encrypted bytes.
```

**The critical point**: even in the worst case, **signaling still works
through Protomux** (via dht-relay). The TURN server is only needed for
WebRTC's media transport, not for signaling. We never need a centralized
signal server.

---

## 5. Comparison: Traditional vs Protomux Signaling

### 5.1 Server Requirements

```
Traditional WebRTC              Protomux WebRTC
──────────────────              ─────────────────
┌─────────────────┐
│ Signal Server   │             (eliminated)
│ • Build it      │
│ • Host it       │
│ • Scale it      │
│ • Auth users    │
│ • Handle rooms  │
└─────────────────┘

┌─────────────────┐             ┌─────────────────┐
│ STUN Server     │             │ STUN Server     │
│ (Google/Twilio) │             │ (Google/self)    │
└─────────────────┘             └─────────────────┘

┌─────────────────┐             ┌─────────────────┐
│ TURN Server     │             │ TURN Server     │
│ (for ~15%)      │             │ (for ~15%)      │
└─────────────────┘             └─────────────────┘

                                ┌─────────────────┐
                                │ dht-relay       │
                                │ (already needed  │
                                │  for Hyperswarm) │
                                └─────────────────┘

Servers: 3                      Servers: 2 (+1 shared)
Custom code: Signal server      Custom code: 4 message types
```

### 5.2 Security Comparison

| Aspect | Traditional Signal Server | Protomux Signaling |
|--------|--------------------------|-------------------|
| **Who sees SDP?** | Your signal server (plain text) | Nobody — Noise-encrypted end-to-end |
| **Who sees ICE candidates?** | Your signal server | Nobody — Noise-encrypted |
| **Can server MITM the call?** | Yes — could swap SDP fingerprints | No — Noise authentication prevents MITM |
| **Auth mechanism** | Custom (JWT, session tokens, etc.) | Noise keypair — same as vivief identity |
| **Room/session scoping** | Custom (build room logic) | Protomux channel ID = session ID |

**Protomux signaling is more secure by default.** The SDP contains DTLS
fingerprints — if a signal server can modify them, it can MITM the media
stream. With Noise encryption on the signaling channel, this is
impossible.

### 5.3 Latency Comparison

```
Traditional: peer → signal server → peer
  Network hops: 2 (up to signal server, down to other peer)
  Typical latency: 50-200ms per message

Protomux: peer → peer (direct or via dht-relay)
  Direct: 1 hop — peer to peer
  Via relay: 2 hops — but dht-relay is already on the path
  Typical latency: 10-50ms direct, 50-150ms relayed

Signaling is faster because no detour through a central server.
```

---

## 6. Prior Art: This Pattern Is Proven

### 6.1 Keet Does This (Almost Certainly)

Keet is Holepunch's production app. It uses Hyperswarm for peer
discovery and Protomux for multiplexed channels. Keet's mobile builds
reference `keet-webrtc` as a dependency. The most likely architecture:

```
Keet's approach (inferred):
  Hyperswarm connects peers → Protomux channels
  Signaling for WebRTC flows over a Protomux channel
  WebRTC handles video/audio media
  No centralized signal server
```

This is the same pattern we're proposing — we just make it explicit.

### 6.2 libp2p Has a Formal Spec for This

libp2p defines `/webrtc-signaling/0.0.1` — a protocol for exchanging
WebRTC SDP and ICE candidates over an existing libp2p connection:

```
libp2p approach:
  1. Browser A connects to relay node (Circuit Relay v2)
  2. Relay opens a stream to Browser B
  3. Over this relayed stream, open a signaling sub-protocol
  4. Exchange SDP + ICE as protobuf messages
  5. WebRTC connects directly (or via TURN)
  6. Relay connection can be dropped

Our approach:
  1. Peer A connects via Hyperswarm (direct or dht-relay)
  2. Protomux multiplexes channels over this connection
  3. media-signal/v1 channel carries SDP + ICE
  4. WebRTC connects directly (or via TURN)
  5. Protomux connection stays (it carries datom data too)

Architecturally identical. Different protocol stack, same pattern.
```

### 6.3 Mafintosh Built webrtc-swarm

Mathias Buus (Holepunch founder) built `webrtc-swarm` — a swarm of
WebRTC connections with a signaling hub. He clearly understood the
signaling problem. With Hyperswarm, he solved it at the transport layer.

---

## 7. The NAT Traversal Double-Spend Question

The most subtle technical question: **if HyperDHT already traversed NAT,
why does WebRTC need to traverse it again?**

### 7.1 Why They Can't Share

```
HyperDHT connection:
  Local port 54321 (UDP) → NAT → Public 1.2.3.4:54321
  Connected to Erik's public address via UDX
  NAT mapping: local:54321 ↔ erik:remote_port

WebRTC connection:
  Local port 61234 (UDP) → NAT → Public 1.2.3.4:61234
  Needs its own DTLS-SRTP session
  NAT mapping: local:61234 ↔ erik:different_port

Different local ports → different NAT mappings.
The hole punched for UDX doesn't help WebRTC.
```

NAT mappings are typically per-socket (port-dependent). The UDX socket
that HyperDHT uses and the UDP socket that WebRTC's ICE agent uses are
different sockets with different local ports. The NAT creates independent
mappings for each.

### 7.2 Why This Doesn't Matter

```
Step 1: HyperDHT connects (NAT traversal succeeds)
        This tells us: "This NAT type allows UDP hole-punching"

Step 2: WebRTC ICE runs (NAT traversal also succeeds)
        Because: same NAT type → same hole-punching works

Time cost: ICE gathering takes 200-500ms
           ICE connectivity checks take 100-300ms
           Total: ~0.5-1 second
```

The NAT traversal is "spent" twice but the second time is fast and
reliable. If the first succeeded, the second will too (same NAT hardware,
same topology). The total overhead is under 1 second — invisible during
a "connecting call..." UI state.

### 7.3 The Exception: Symmetric NAT

```
Symmetric NAT assigns a DIFFERENT public port per destination.

HyperDHT:
  local:54321 → NAT → 1.2.3.4:10001 (to DHT bootstrap)
  local:54321 → NAT → 1.2.3.4:10002 (to Erik via UDX)

WebRTC:
  local:61234 → NAT → 1.2.3.4:?????  (unpredictable)

HyperDHT has advanced hole-punching (port prediction,
randomPunchInterval). WebRTC's standard ICE does not.

Result:
  HyperDHT: may succeed (advanced techniques)
  WebRTC: will fail → needs TURN relay

This is the ~15% case where TURN is required for media.
But signaling still works via Protomux (which is connected
either directly or via dht-relay).
```

**Bottom line:** the double NAT traversal is a non-issue in practice.
It adds <1 second in the common case. In the symmetric NAT case,
signaling still works — only media needs TURN.

---

## 8. Can We Go Further? Media Over Protomux (Skip WebRTC)

### 8.1 The Temptation

If Protomux already has a connection, why not pipe video/audio through it?
Keet's native clients appear to do exactly this (media over UDX, not
WebRTC). Could we do the same in a Tauri webview?

### 8.2 Why WebRTC Is Still Needed for Webview Media

```
The browser's media pipeline is a sealed system:

getUserMedia() ──► MediaStream ──► RTCPeerConnection ──► network
                                        │
                                   echo cancellation
                                   noise suppression
                                   adaptive bitrate
                                   jitter buffer
                                   hardware codec accel
                                   lip sync

You can't replace RTCPeerConnection with a custom transport
and keep all the above. The browser API doesn't expose it.
```

| Feature | WebRTC provides | DIY over Protomux |
|---------|----------------|-------------------|
| Echo cancellation | Built-in, tightly coupled to audio output | Must reimplement (hardest problem) |
| Noise suppression | Built-in via getUserMedia constraint | WASM library (RNNoise) — solvable |
| Adaptive bitrate | GCC (Google Congestion Control) | Must reimplement from scratch |
| Jitter buffer | Built-in, automatic | Must reimplement |
| Hardware codecs | VP8/VP9/H.264/AV1 via browser | WebCodecs API — works but manual |
| Lip sync | Automatic | Must manually sync audio/video timestamps |
| `<video>` element | Direct MediaStream attachment | Must use `<canvas>` + WebCodecs — works |

**Echo cancellation is the deal-breaker.** The browser's AEC (Acoustic
Echo Cancellation) is tightly integrated with the audio output pipeline —
it knows what sound is playing through speakers and subtracts it from
mic input. When you route audio through a custom pipeline instead of
RTCPeerConnection, **AEC breaks** (documented Chromium behavior). Without
AEC, any call without headphones produces unbearable echo.

### 8.3 Future Option: WebCodecs + WebTransport

The WebCodecs API (stable in all major browsers) provides low-level
codec access. Combined with a custom transport:

```
Future architecture (possible but premature):

Camera → getUserMedia() → VideoEncoder (WebCodecs)
  → encoded frames → Protomux channel → decode → <canvas>

Mic → getUserMedia() → AudioEncoder (WebCodecs)
  → encoded frames → Protomux channel → decode → AudioContext

Problems:
  ✗ No echo cancellation
  ✗ No adaptive bitrate (must build)
  ✗ No jitter buffer (must build)
  ✗ Audio/video sync is manual
  ✗ Much more code to maintain
```

This is a research track, not a production path. Revisit if/when browser
APIs expose AEC independently of RTCPeerConnection.

### 8.4 Verdict

**Use WebRTC for media. Use Protomux for signaling.** Each technology
does what it's best at. Don't try to replace WebRTC's media pipeline —
it's a decade of engineering in echo cancellation alone.

---

## 9. The TURN Question: Do We Still Need It?

### 9.1 Yes, But Less

```
Traditional WebRTC:
  Signal server: REQUIRED (custom, must build and host)
  STUN: REQUIRED (discovery, Google provides free ones)
  TURN: REQUIRED for ~15% (relay, expensive, must host)

Protomux WebRTC:
  Signal server: ELIMINATED (Protomux replaces it)
  STUN: REQUIRED (for WebRTC ICE candidate gathering)
  TURN: REQUIRED for ~15% (WebRTC's sealed stack needs it)
```

**We can't eliminate TURN** because the browser's WebRTC stack manages
its own UDP sockets. When ICE fails (symmetric NAT, corporate firewall),
the browser needs a TURN relay address to fall back to. The Protomux
connection can't be injected as a WebRTC transport — the API doesn't
allow it.

### 9.2 TURN Server Options

```
Option A: Self-hosted coturn
  ├── Open source, mature (RFC 8656)
  ├── Same server as dht-relay (colocated)
  ├── Cost: CPU + bandwidth for relayed media
  └── Only ~15% of calls use it

Option B: Managed TURN (Twilio, Cloudflare)
  ├── Pay-per-use, no ops burden
  ├── Global edge network (lower latency)
  └── Cost: $0.40-0.80/GB (mostly irrelevant at small scale)

Option C: coturn on the always-on server
  ├── vivief already has an always-on server (dht-relay + Hypercore)
  ├── Add coturn to the same process/machine
  ├── Zero additional infrastructure
  └── Recommended for Phase 25+
```

### 9.3 Can dht-relay Replace TURN?

```
dht-relay:
  • Relays HyperDHT protocol messages (28 message types)
  • Operates at the DHT abstraction level
  • Carries Protomux streams (which carry signaling)
  • CANNOT carry raw WebRTC media — wrong protocol layer

TURN:
  • Relays arbitrary UDP packets
  • Operates at the transport level
  • Browser's WebRTC stack generates TURN candidates natively
  • MUST be a TURN server — browser won't accept alternatives

Verdict: dht-relay and TURN serve different layers.
Both are needed. Both can run on the same machine.
```

### 9.4 STUN: Use Google's or Self-Host

STUN is lightweight — a single UDP request/response to discover public
IP:port. Google provides free STUN servers (`stun.l.google.com:19302`).
Self-hosting is trivial (coturn includes STUN). No meaningful cost or
complexity.

HyperDHT's bootstrap nodes effectively do STUN-like discovery for the
Hyperswarm connection, but WebRTC's ICE agent needs its own STUN
candidates. Sharing is not worth the complexity.

---

## 10. Platform Risk: WebRTC in Tauri Webviews

### 10.1 Platform Support Matrix

| Platform | Webview | getUserMedia | RTCPeerConnection | Production Ready |
|----------|---------|-------------|-------------------|-----------------|
| **macOS** | WKWebView | ✅ (needs Info.plist) | ✅ | ⚠ Permission prompt bugs |
| **Windows** | WebView2 (Chromium) | ✅ | ✅ | ✅ Best support |
| **Linux** | WebKitGTK | ❌ Stock packages | ❌ Stock packages | ❌ Blocker |
| **iOS** | WKWebView | ✅ (since 14.3) | ✅ | ⚠ H.264 only |
| **Android** | android.webkit | ✅ | ✅ | ✅ |

### 10.2 The Linux Problem

```
Stock WebKitGTK (shipped by distros):
  -DENABLE_MEDIA_STREAM=OFF    ← getUserMedia disabled
  -DENABLE_WEB_RTC=OFF         ← RTCPeerConnection disabled

Custom WebKitGTK build (proven by Tauri community):
  -DENABLE_MEDIA_STREAM=ON
  -DENABLE_WEB_RTC=ON
  + GStreamer plugins (gst-plugins-bad for webrtcbin)
  + X11 backend (Wayland has issues)

Problem: we can't ask Linux users to compile WebKitGTK.
```

**Mitigations for Linux:**

| Option | Feasibility | Impact |
|--------|-------------|--------|
| Ship a custom WebKitGTK with the app | Complex but possible (AppImage/Flatpak) | Full WebRTC support |
| Fallback to browser tab for video | Simple | Linux users open a browser tab for calls |
| Lobby WebKitGTK maintainers | Already happening (FOSDEM 2025/2026 talks) | May resolve in 2026-2027 |
| Use audio-only on Linux (no video) | Simple | Degraded experience but functional |

**Recommended:** Browser-tab fallback for Linux. The vivief SPA works in
Firefox/Chrome with full WebRTC. Only the Tauri webview has the
limitation. Detect platform at runtime and offer "Open video in browser"
for Linux users.

### 10.3 macOS Permission Handling

```
macOS 14+ permission flow:
  1. App-level permission prompt (first time)
  2. WKWebView permission prompt (per page load)

Tauri bug: both prompts may appear simultaneously.

Fix: tauri-plugin-macos-permissions
  → Pre-request camera/mic via native API
  → WKWebView then gets pre-authorized access
  → One prompt instead of two
```

### 10.4 Windows Minimize Issue

```
WebView2 issue: camera/mic access terminated when app minimized.

For a therapy session: counselor minimizes vivief to check
another app → camera drops → video freezes for the client.

Fix: keep the WebView2 process alive when minimized
  → Tauri window event handler prevents full suspension
  → Or: use PiP (Picture-in-Picture) API to keep video floating
```

---

## 11. Complete Architecture: Phase 25+

```
┌─── Anna (counselor, macOS desktop) ─────────────────────────────────────┐
│                                                                          │
│  Tauri Desktop                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ WKWebView                                                          │  │
│  │                                                                    │  │
│  │  ┌──────────────────────┐  ┌──────────────────────────────────┐   │  │
│  │  │ Session Notes (Loro) │  │ Video Panel                      │   │  │
│  │  │                      │  │ ┌──────────┐  ┌──────────┐      │   │  │
│  │  │ Erik reported        │  │ │ Erik     │  │ Anna     │      │   │  │
│  │  │ improved sleep...    │  │ │ (remote) │  │ (local)  │      │   │  │
│  │  │                      │  │ └──────────┘  └──────────┘      │   │  │
│  │  │ AI: Consider         │  │                                  │   │  │
│  │  │ following up on      │  │ getUserMedia() → RTCPeerConn     │   │  │
│  │  │ anxiety triggers     │  │        │                         │   │  │
│  │  │        trust: 0.85 ▲ │  │        │ SDP + ICE               │   │  │
│  │  └──────────────────────┘  └────────┼─────────────────────────┘   │  │
│  │                                      │                             │  │
│  │  Protomux client ◄───────────────────┘ (SDP/ICE via localhost)    │  │
│  └──────────┬─────────────────────────────────────────────────────────┘  │
│             │ localhost WebSocket or Tauri IPC                            │
│  ┌──────────┴─────────────────────────────────────────────────────────┐  │
│  │ Node.js Sidecar                                                    │  │
│  │                                                                    │  │
│  │  Hyperswarm ◄──── HyperDHT (peer discovery + NAT traversal)       │  │
│  │       │                                                            │  │
│  │  Noise-encrypted stream to Erik                                    │  │
│  │       │                                                            │  │
│  │  Protomux                                                          │  │
│  │  ├── hypercore/alpha ───── datom feed sync                         │  │
│  │  ├── loro-text/v1 ──────── session notes CRDT                      │  │
│  │  ├── datom-app/v1 ──────── queries, AI results, presence           │  │
│  │  └── media-signal/v1 ───── SDP offer/answer + ICE candidates       │  │
│  │                             │                                      │  │
│  │  Relays SDP/ICE between     │                                      │  │
│  │  webview ◄──────────────────┘                                      │  │
│  │  and Protomux channel                                              │  │
│  │                                                                    │  │
│  │  Hypercore 11 (full feed on disk)                                  │  │
│  │  d2ts (warm indexes)                                               │  │
│  │  XState (SessionActor)                                             │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
        │                                           │
        │  Protomux over Noise/Hyperswarm           │  WebRTC P2P (DTLS)
        │  4 channels: datoms, text,                │  video + audio
        │  queries, signaling                       │
        │                                           │
┌───────┴───────────────────────────────────────────┴──────────────────────┐
│  Erik (client, iPhone)                                                    │
│                                                                          │
│  Tauri Mobile (or server-relayed thin client)                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ WKWebView                                                          │  │
│  │ ├── Session view + homework                                        │  │
│  │ ├── Video: Anna's face + self-view                                 │  │
│  │ └── getUserMedia() → RTCPeerConnection                             │  │
│  └──────────┬─────────────────────────────────────────────────────────┘  │
│  ┌──────────┴─────────────────────────────────────────────────────────┐  │
│  │ Node.js Sidecar (if mobile sidecar works — see ADR-0049 spike)     │  │
│  │ ├── Hyperswarm + Protomux (same 4 channels)                        │  │
│  │ └── Hypercore 11 (sparse — only Erik's data)                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

Data paths:
─────  Protomux (Noise encrypted): datoms, rich text, queries, signaling
═════  WebRTC (DTLS encrypted): video + audio
```

---

## 12. The SDP/ICE Relay: Webview ↔ Sidecar ↔ Protomux

One implementation detail worth zooming in on: the SDP and ICE
candidates originate in the webview (where `RTCPeerConnection` lives)
but must reach the Protomux channel (in the Node.js sidecar). This
requires a relay within the app.

```
Webview                     Sidecar                      Remote peer
  │                           │                              │
  │  RTCPeerConnection        │                              │
  │  creates SDP offer        │                              │
  │                           │                              │
  │  ┌──────────────────┐     │                              │
  │  │ postMessage or   │     │                              │
  │  │ Tauri IPC:       │     │                              │
  │  │ { type: 'sdp',   ├────►│  media-signal/v1             │
  │  │   sdp: '...' }   │     │  channel.send(sdp) ─────────►│
  │  └──────────────────┘     │                              │
  │                           │                              │
  │                           │  receives answer              │
  │  ┌──────────────────┐     │  from channel ◄──────────────┤
  │  │ Tauri IPC:       │◄────┤                              │
  │  │ { type: 'sdp',   │     │                              │
  │  │   sdp: '...' }   │     │                              │
  │  └──────────────────┘     │                              │
  │                           │                              │
  │  setRemoteDescription()   │                              │
  │                           │                              │
  │  ICE candidates trickle   │  relay each one via          │
  │  onicecandidate ─────────►│  media-signal/v1 ───────────►│
  │  addIceCandidate() ◄──────│  ◄─────────────── candidates │
  │                           │                              │

Phase 1-19 (browser): postMessage or WebSocket to localhost
Phase 20+ (Tauri): tauri::ipc::Channel (typed, binary)
```

This relay is trivial — it's a message passthrough. The sidecar doesn't
interpret SDP or ICE candidates. It just moves bytes between the local
IPC channel and the remote Protomux channel.

---

## 13. What About Group Calls?

The brainstorm so far covers 1:1 calls (counselor + client). Group calls
introduce additional complexity:

```
1:1 call (our primary use case):
  Anna ◄──── Protomux signaling ────► Erik
  Anna ◄════ WebRTC P2P media ═══════► Erik
  Simple. One connection per direction.

Group call (e.g., family therapy session):
  Anna ◄──► Erik     (Protomux + WebRTC)
  Anna ◄──► Sara     (Protomux + WebRTC)
  Erik ◄──► Sara     (Protomux + WebRTC)
  Full mesh: N×(N-1)/2 connections

  3 people = 3 connections
  4 people = 6 connections
  5 people = 10 connections ← bandwidth limit (~5 people max)
```

**For vivief's use case** (counselor + 1-3 clients for family/couples
therapy), full-mesh WebRTC works fine up to ~5 participants. Beyond that
would need an SFU (Selective Forwarding Unit), which is a server. But
counseling sessions rarely exceed 4-5 people.

**Signaling for group calls** over Protomux:

```
Anna opens group call
  │
  ├── Protomux to Erik: call-offer { sessionId, sdp }
  ├── Protomux to Sara: call-offer { sessionId, sdp }
  │
  Erik: call-answer to Anna + call-offer to Sara
  Sara: call-answer to Anna + call-answer to Erik
  │
  Result: full-mesh WebRTC between all three
  Signaling: each pair uses their existing Protomux connection
  No central coordination needed
```

Each peer pair already has a Protomux connection (they're in the same
vivief workspace). Signaling is just messages on each existing connection.
No group-specific signaling server needed.

---

## 14. Implementation Complexity Assessment

### 14.1 What We Need to Build

| Component | Complexity | Lines of code (est.) |
|-----------|-----------|---------------------|
| `media-signal/v1` Protomux channel | Low | ~100 (4 message types) |
| Sidecar SDP/ICE relay (IPC ↔ Protomux) | Low | ~150 |
| WebRTC manager in webview | Medium | ~400 (offer/answer/ICE/tracks) |
| Video UI (local/remote video, mute, camera toggle) | Medium | ~600 (React components) |
| STUN/TURN configuration | Low | ~50 |
| Call state machine (XState) | Medium | ~300 (ringing/active/held/ended) |
| **Total** | **Medium** | **~1,600** |

### 14.2 What We DON'T Need to Build

| Component | Why not |
|-----------|---------|
| Signal server | Protomux replaces it |
| NAT traversal | HyperDHT + standard ICE handle it |
| Encryption | Noise (signaling) + DTLS (media) |
| Peer discovery | Hyperswarm |
| Authentication | Noise keypair = vivief identity |
| Room management | Session entity in datom store |
| Media pipeline | Browser's WebRTC stack |

---

## 15. Risks and Open Questions

### 15.1 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Linux WebKitGTK lacks WebRTC | High (Linux users) | Browser-tab fallback for video |
| macOS WKWebView permission bugs | Medium | `tauri-plugin-macos-permissions` |
| Windows WebView2 minimize kills camera | Medium | Window event handler + PiP API |
| TURN needed for ~15% (server dependency) | Low | coturn on always-on server |
| Group calls > 5 people need SFU | Low | Out of scope for counseling |

### 15.2 Open Questions

1. **Can the Protomux connection carry enough bandwidth for signaling
   during a video call?** Yes — signaling is ~15 KB total, and Protomux
   carries datom diffs + Loro text during the call anyway. Negligible
   additional load.

2. **What if the Protomux connection drops during a call?** The WebRTC
   media connection is independent — it survives Protomux drops. When
   Protomux reconnects (Hyperswarm auto-reconnect), signaling resumes.
   The call continues uninterrupted.

3. **Can we add screen sharing later?** Yes — `getDisplayMedia()` returns
   a MediaStream that can be added to the existing RTCPeerConnection via
   `addTrack()`. Signaling for renegotiation flows through the same
   `media-signal/v1` channel. No architectural change needed.

4. **What about recording?** MediaRecorder API in the webview can record
   local+remote streams. Recording datoms (timestamps, participants) are
   committed to Hypercore with trust metadata. The recording file is
   stored locally, not synced via Hypercore (too large).

---

## 16. Conclusion: Kill the Signal Server

**Can Protomux replace the WebRTC signal server?** Yes. Conclusively.

```
What we eliminate:
  ✗ Centralized signal server (custom code, hosting, scaling, auth)

What we keep:
  ✓ STUN server (lightweight, Google provides free ones, or self-host)
  ✓ TURN server (~15% fallback, coturn on always-on server)

What we gain:
  ✓ Signaling is E2E encrypted (Noise) — traditional signal servers see SDP
  ✓ No additional server for signaling — reuses Hyperswarm infrastructure
  ✓ Auth is free — Noise keypair = vivief identity
  ✓ Room scoping is free — Protomux channel ID = session ID
  ✓ Signaling latency is lower — no server detour
```

**The pattern is proven** — Keet does it (inferred), libp2p has a spec
for it, and the implementation is ~1,600 lines of code. The hardest part
is the video UI, not the signaling.

**Recommended spike** (Phase 25):

```
Spike: WebRTC signaling over Protomux
  1. Two Node.js processes, connected via Hyperswarm
  2. Add media-signal/v1 Protomux channel
  3. Browser (or Electron for testing) opens getUserMedia
  4. SDP + ICE exchanged over Protomux
  5. WebRTC connects, video flows P2P
  6. Measure: time to first frame, call setup latency, success rate
  7. Test behind NAT (cone, symmetric) to validate TURN fallback
```

---

## References

- [WebRTC Connectivity (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity) — ICE, STUN, TURN explained
- [libp2p WebRTC Signaling Spec](https://github.com/libp2p/specs/blob/master/webrtc/webrtc.md) — formal spec for P2P WebRTC signaling
- [hyperswarm-web (RangerMauve)](https://github.com/RangerMauve/hyperswarm-web) — Hyperswarm + WebRTC in browsers
- [Protomux](https://docs.holepunch.to/helpers/protomux) — channel multiplexing
- [HyperDHT](https://docs.holepunch.to/building-blocks/hyperdht) — peer discovery + NAT traversal
- [coturn](https://github.com/coturn/coturn) — open-source TURN/STUN server
- [Tauri WebRTC on Linux (Discussion #8426)](https://github.com/tauri-apps/tauri/discussions/8426) — proof of concept
- [Tauri wry WebRTC (Issue #85)](https://github.com/tauri-apps/wry/issues/85) — tracking issue
- [WebCodecs API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) — low-level codec access
- [TURN RFC 8656](https://www.rfc-editor.org/rfc/rfc8656.html)
- [Keet](https://keet.io/) — Holepunch's production app (WebRTC + Hyperswarm)
