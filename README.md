# EchoVault

**Blockchain records what happened. EchoVault remembers what it felt like.**

EchoVault is a provenance-aware cinematic memory system built for the Visko Orbis challenge. A user supplies a verified Base or Base Sepolia transaction, directs how that moment should feel, then opens a continuous Visko Orbis world that can be steered live, recorded locally, downloaded, preserved and shared without confusing generated interpretation with blockchain truth.

## What makes it different

EchoVault has two deliberately separate layers:

- **Proof** — transaction hash, chain, block, addresses, value, receipt status, logs and event classification read from the blockchain.
- **Memory** — title, creative interpretation, cinematic direction, audio direction and Orbis-generated video.

Claude can help turn verified facts into stronger cinematic language, but its server prompt explicitly forbids invented blockchain facts. If Claude is not configured or is unavailable, EchoVault falls back to a deterministic local interpretation and prompt composer so the core product still works.

## Product flow

1. **Event Excavation** — choose Base Sepolia or Base and paste a transaction hash.
2. **Verified Evidence** — server-side JSON-RPC reads the transaction, receipt and block and classifies the event.
3. **Director Console** — choose mood, camera, world language, energy, custom direction, sound and an optional 16:9 reference image.
4. **Claude direction** — optional provenance-safe interpretation and prompt refinement.
5. **The Forge** — connect to `reactor/visko-orbis-stable`, stage resolution/seed/audio/image/prompt and start the live stream.
6. **Live steering** — send new `set_prompt` directions while the same shot continues.
7. **Preserve** — record the live media element in supported browsers using `MediaRecorder`, download WebM, export a poster and provenance JSON, or save the Echo and capture in IndexedDB.
8. **Share** — generate a portable `/echo?data=...` proof page that re-reads the source transaction when opened, then open a prefilled X share.
9. **Remix** — load a saved Echo back into the Director Console while preserving the same verified source event.

## Tech

- Next.js 16 + React 19 + TypeScript
- Reactor JavaScript SDK
- Visko Orbis Stable
- Base / Base Sepolia JSON-RPC
- Anthropic Messages API (optional, server-side)
- IndexedDB for local Echo/video preservation
- MediaRecorder + `HTMLMediaElement.captureStream()` for local live-stream capture on supported browsers
- Zero UI framework and zero animation library: the interface and motion system are custom CSS/React

## Environment

```bash
cp .env.example .env.local
```

Set:

```dotenv
REACTOR_API_KEY=your_reactor_api_key
CLAUDE_API_KEY=your_claude_api_key
CLAUDE_MODEL=claude-sonnet-5-5
```

`REACTOR_API_KEY` is required for generation. `CLAUDE_API_KEY` is optional but recommended. Both remain server-side.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For production verification:

```bash
npm run typecheck
npm run build
npm start
```

## Orbis integration

EchoVault preserves the starter's important Reactor safety model:

- Reactor API key stays server-side.
- `/api/token` mints a short-lived JWT scoped to Orbis Stable.
- The browser connects with `autoConnect: false`.
- Development sessions are registered and swept by the included cleanup wrapper.
- Page exit sends best-effort session cleanup.
- The video/audio receiver mounts as soon as Reactor is connected so it is ready before generation starts.
- `state.available_resolutions` is treated as the authoritative resolution list.
- A transaction-derived deterministic seed is staged before `start`.
- `set_audio_prompt` is kept separate from the visual prompt.
- Live steering uses `set_prompt` during an active generation.

Current model reference: https://www.reactor.inc/models/visko-orbis-stable/api

## Claude integration

EchoVault calls the Anthropic Messages API directly from a server route, so no additional client dependency is required. The default model is configurable through `CLAUDE_MODEL` and is currently set to `claude-sonnet-5-5` in `.env.example`.

Claude performs two optional jobs:

- produce a concise provenance-safe title/summary/significance plus an Orbis visual prompt and audio caption;
- refine the user's Director Console choices into a stronger continuous-shot prompt.

The chain facts themselves are never sourced from Claude.

## Video downloads

Orbis is a live WebRTC stream. EchoVault does not pretend that a server-rendered video file exists. Instead, on browsers that support `captureStream()` and `MediaRecorder`, the user can record a section of the live output and download the resulting WebM. A saved capture can also be stored in the browser's IndexedDB alongside its Echo metadata.

Chrome/Edge are the recommended browsers for this feature.

## Main files

- `components/echovault-app.tsx` — full product experience and orchestration
- `components/echo-player.tsx` — live Reactor view + recording/download
- `hooks/use-orbis-session.ts` — resilient Orbis command/session lifecycle
- `app/api/transaction/route.ts` — verified Base/Base Sepolia transaction reader
- `app/api/echo-intelligence/route.ts` — Claude + deterministic fallback intelligence
- `app/api/token/route.ts` — server-side Reactor JWT exchange
- `lib/echo.ts` — product data model, director logic and share encoding
- `lib/vault-storage.ts` — IndexedDB persistence
- `app/echo/page.tsx` — portable proof page
- `app/about/page.tsx` — product/technical documentation
- `app/styles.css` — complete EchoVault design and motion system

## Privacy and truth model

EchoVault does not upload saved Echoes or recorded clips to a database. The personal Vault is local to the browser. Portable proof links encode only Echo metadata in the URL and do not include the recorded video. When a shared page opens, it re-reads the source transaction from the selected Base network and compares the live result with the shared metadata before showing a fresh verification state. Users explicitly choose when to download or share media.

Generated cinematic content is an interpretation, not evidence of what happened onchain. The Proof interface makes that distinction visible at all times.
