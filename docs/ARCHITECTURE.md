# Architecture

Agent Bridge is a UI frontend for a separate Java-based agentic backend.
The two halves run as independent processes that communicate over a
WebSocket; neither owns the lifecycle of the other.

## Topology

```
+──────────────────────────+                +──────────────────────────+
│  Agent system            │                │  UI                      │
│  (your Java backend)     │ ◀───── WS ────▶│  (static HTML/JS/CSS)    │
│                          │                │                          │
│  implements AgentSystem  │                │  Safari / Chrome / etc.  │
│  pushes notifications    │                │  loaded via file:// or   │
│  via UI callback         │                │  any static web host     │
+──────────────────────────+                +──────────────────────────+
        port 9876                                  (no server runtime)
```

The UI is a **static site**, not a bundled application and not a
server-rendered page. After build, the entire frontend is plain HTML,
JS, and CSS files in `out/` — packed into
`agent-bridge-ui-<version>.tar.gz`. To run it, extract the tarball and
open `index.html` in a browser; no Node runtime, no Electron shell, no
install step.

The Java backend is the runtime. It owns conversation state, agents,
files, scheduling, and any actual AI work. The UI is a viewport.

## Components

### Java module (`java/`)

Maven project. Three packages:

- **`ai.agentbridge.api`** — the surface a real Java backend implements.
  Two interfaces (`AgentSystem`, `UI`), one factory
  (`AgentSystemFactory`), and a set of record DTOs (`AgentInfo`,
  `MessageRecord`, `MessageReplacement`, `FileRef`, `GroupInfo`,
  `GroupSummary`, plus enums `AgentState` and `TargetKind`).
- **`ai.agentbridge.bridge`** — JSON-RPC 2.0 dispatcher and WebSocket
  server. Translates inbound UI requests into `AgentSystem` method calls,
  and outbound `UI` interface calls into JSON-RPC notification frames.
- **`ai.agentbridge.shim`** — `ElizaShim`, a stand-in for development.
  Three personas in one therapy group. Exercises every feature of the
  API: messaging, streaming via append, anchored replace, status
  changes, file pushing (`/image`, `/pdf`), markdown rendering,
  thinking sections (`<details class="thinking">`).

### UI (`src/`)

Next.js + React 19 + TypeScript + Tailwind v4, exported as a fully
static site.

- **`src/types/api.ts`** — TypeScript mirror of the Java DTOs and the
  JSON-RPC notification shapes.
- **`src/lib/rpc/client.ts`** — JSON-RPC 2.0 client over a single
  WebSocket with 5s auto-reconnect and ping-style keepalive.
- **`src/stores/agent-bridge-store.ts`** — Zustand store mirroring the
  agent system state (agents, groups, messages by conversation).
- **`src/stores/file-registry-store.ts`** — in-memory `Blob` + object-URL
  cache for `bridge://file/<id>` URLs.
- **`src/components/bridge/`** — UI components (fleet sidebar,
  conversation pane, status pill, settings, theme provider).
- **`src/components/Markdown/MarkdownRenderer.tsx`** — markdown renderer
  with KaTeX math (`$inline$` / `$$display$$`), Shiki Nord-theme code
  highlighting, custom `<details class="thinking">` collapse/preview,
  and `bridge://file/<id>` resolution for `<img>` / `<iframe>` /
  `<embed>`.

## Wire protocol

JSON-RPC 2.0 over a single WebSocket. Request/response and notification
messages share the same socket.

**UI → Java requests (with `id`, expect a response):**

- `listAgents()`, `listGroups()`
- `getHistory(conversationId, limit, beforeId)`
- `sendMessage(conversationId, text)`
- `sendDirective(targetId, kind, cmd, args)`

**Java → UI notifications (no `id`):**

- `onMessage(msg)` — new message into a conversation
- `onMessageAppend(msg)` — append delta to an existing message (streaming)
- `onMessageReplace(replacement)` — splice text into an existing message,
  optionally anchored between two substrings
- `onStatusChange(agentId, state, reason)` — `WORKING`, `LISTENING`,
  `ANSWERING`, `PAUSED`, `WAITING`, `BLOCKED`, `IDLE`, `ERROR_STATE`
- `onInputNeeded(conversationId, agentId, prompt)`
- `onAgentAdded(agent)`, `onAgentRemoved(agentId)`,
  `onGroupUpdate(groupId, summary)`
- `onFileAvailable(file)` — push a binary blob into the UI's file
  registry

See `java/src/main/java/ai/agentbridge/api/UI.java` for the canonical
interface definition.

## File registry

When the agent has a binary asset to share (image, PDF, generated chart),
it pushes the bytes via `onFileAvailable(FileRef)`. The file is keyed by
a stable id; messages then reference it via `bridge://file/<id>` URLs.
The MarkdownRenderer intercepts these URLs and resolves them to `Blob`
object URLs.

Examples:

- `![chart](bridge://file/q1-revenue)` → inline image
- `<iframe src="bridge://file/brief.pdf"></iframe>` → embedded PDF
- `<embed src="bridge://file/something" type="application/pdf">` → embed

Files live in memory for the lifetime of the page (no persistence, no
explicit eviction). On reload, the agent re-pushes them — typically
inside the `getHistory` handler before returning the message list. The
WebSocket guarantees frame ordering, so `onFileAvailable` notifications
sent before the `getHistory` response always reach the UI's registry
before the messages that reference them are rendered.

## Auto-scroll and focus

Both behaviors are designed to be race-free by construction; see
`src/components/bridge/conversation-pane.tsx` for the implementation
notes.

- **Auto-scroll**: a `following` flag is updated by two writers in
  *opposite directions* under disjoint conditions — user-input handlers
  (wheel up, PageUp, Home, ArrowUp) only set it to `false`; the scroll
  event handler only sets it to `true` when the position lands at the
  bottom (within 4px subpixel tolerance). A `ResizeObserver` reads the
  flag whenever content size changes and re-anchors to the bottom iff
  `following` is true. Late-firing scroll events from our own
  programmatic scrolls always observe `distance ≈ 0` and set the flag
  to `true`, which it already is — idempotent.
- **Focus**: the textarea owns focus unless something interactive
  explicitly takes it. A synchronous `onBlur` handler checks
  `e.relatedTarget`: if non-null (user clicked a button, link, sidebar
  entry), focus passes through unchanged; if null (browser-internal
  blur during image decode, layout shift), a `queueMicrotask` defers
  the restore one tick so any pending user click can land first.

## Static export rationale

The UI is built with `output: "export"` in `next.config.ts` plus
`AGENT_BRIDGE_STATIC=true` (which makes asset paths relative so
`file://` works in Safari). The result is purely static files — no Node
server at runtime, no Electron shell, no install step.

This is intentional:

- The Java backend is the source of all dynamic content; the UI doesn't
  need a server to fetch anything.
- "Open `index.html`" is the only deployment step.
- The UI tarball can be hosted on any static web server, opened from
  disk, dropped on a thumbdrive — any way you'd ship a folder of HTML.

If you ever need server-side concerns (SSR, ISR, edge functions, API
routes, etc.) that's a sign something has moved into the wrong half of
the system; it should live in Java.

## See also

- [BUILD.md](./BUILD.md) — how to build and release
- `java/src/main/java/ai/agentbridge/api/UI.java` — canonical API
- `dist/README.md` — integration cheat sheet for downstream Java
  projects
