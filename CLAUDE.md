# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Hangout World" — a browser 3D multiplayer hangout: visitors join via a nickname/color screen and walk, run, and jump around an 80×80 low-poly meadow together. Movement, multiplayer, proximity chat/bubbles, opt-in WebRTC voice, meadow collision, animated procedural explorers, player controls, full-room waiting, and reconnect UX are implemented. Voice uses only the active Colyseus session identity; it adds no accounts or persistent identity. Production deployment and target-device performance must be verified separately. Original spec and plans live in `docs/superpowers/`; current setup and verification instructions are in `docs/deployment.md`.

## Commands

Two independent npm packages; always run npm commands inside the package directory.

Client (`client/` — Vite + TypeScript + Three.js):
- `npm run dev` — dev server on :5173 (`npm run dev -- --host` to expose on LAN)
- `npm test` — Vitest, all suites
- `npx vitest run tests/controller.test.ts` — single test file
- `npm run build` — `tsc --noEmit && vite build` (typecheck is part of the build gate)

Server (`server/` — Colyseus 0.16 on Node, run with tsx):
- `npm run dev` — game server on :2567 (tsx watch)
- `npm test` / `npx vitest run tests/worldRoom.test.ts` — suites / single file
- `npm run build` — `tsc --noEmit`

Multiplayer needs both servers running. The client connects to `ws://<location.hostname>:2567` (see `client/src/net/connection.ts`), so LAN clients work automatically when Vite runs with `--host`.

## Architecture

### Two packages, one duplicated contract
`client/` and `server/` share no code. Constants that must agree are deliberately duplicated: `server/src/constants.ts` mirrors `WORLD_HALF` and `SPAWN` from `client/src/world/map.ts`, and `COLOR_COUNT` must equal `AVATAR_COLORS.length` in `client/src/net/connection.ts` (the server stores only a color index). Change one side and you must change the other. The wire contract: room name `"world"`, join options `{ name, colorIndex }`, message `"move"` `{x, y, z, heading}`, state `players: MapSchema<PlayerState{name, colorIndex, x, y, z, heading}>` keyed by sessionId.

### Client: pure math vs rendering split
Game logic modules must NOT import `three` and are unit-tested headlessly under plain Node: `input/keyboard.ts` (DOM events only; its test uses a per-file `// @vitest-environment happy-dom` pragma — the project's Vitest default env is node), `world/collision.ts`, `player/controller.ts`, `camera/orbit.ts`, `net/interpolation.ts`. Rendering modules may import `three`: `world/map.ts`, `player/avatar.ts`, `player/nametag.ts`, `net/remotePlayers.ts`, `main.ts`. Keep new logic on the pure side of this line so it stays testable.

### Networking model (client authoritative-ish with server validation)
The local player uses local prediction (fixed 1/60 timestep, accumulator clamped to 0.25 s) and sends a `move` every 4th step (15 Hz). Only a successful reconnect restores the local pose from server state once. Remote players are rendered from Colyseus state callbacks and smoothed by `net/interpolation.ts` (`stepToward`: exponential smoothing, shortest-arc heading wrap, instant snap beyond 5 m). Movement uses a distance token bucket on the server (3 m burst, refilled at `MAX_SPEED`) plus bounds/y validation.

### Text chat, voice, and player controls
- Proximity chat and WebRTC signaling use Colyseus. The server owns all recipient/proximity decisions; audio remains peer-to-peer. `PROXIMITY` is server-centralized (horizontal metres). STUN defaults locally; server-only `WEBRTC_TURN_*` settings configure production TURN fallback.
- Player preferences are stored by room ID + session ID in localStorage (max 200). Block hides text/bubbles and mute affects only incoming voice. With no accounts, preferences cannot follow a player who returns with a new session ID.
- `player/animation.ts` contains pure idle/walk/run/jump pose math; `player/avatar.ts` blends those poses on locally generated explorer rigs. Runtime sky/clouds/valley floor are separate from the unchanged environment GLB and have no collision.

### Movement/physics conventions
- Heading = `Math.atan2(dirX, dirZ)`; avatars face +z at heading 0, so `mesh.rotation.y = heading`. Task code in three places depends on this — don't flip the atan2 arguments.
- Collision is a heightfield ground (hills, riverbed) plus AABB boxes with step-up (`STEP_HEIGHT` 0.35 m), resolved by `CollisionWorld`. Slopes are approximated by the heightfield grid; stairs (e.g. the ruin) are stacks of boxes with rise ≤ STEP_HEIGHT.
- The world is a generated meadow (80×80, `WORLD_HALF` 40 — must match on client `world/map.ts` and server `constants.ts`): a GLB model (`client/public/models/fantasy-meadow.glb`) plus a collision manifest (`client/src/world/meadow-collision.json`, a heightfield grid + boxes) produced together by `npm run generate:meadow` (from `client/scripts/meadow/generate.mjs`) — regenerate both whenever the meadow layout changes, then run `npm run validate:meadow` and `npm run test:meadow` to check the manifest (bridge/ruin climbability, spawn clearing, border walls) before committing. `MIN_Y` is −1 so wading in the river (knee-deep, comes back out) is ruled in, not a bug. The ruin's crown box deliberately keeps an elevated bottom face open — that's the arch passage, not a ceiling; don't "fix" it flat. There is no hand-authored `solid()` helper anymore — all meadow geometry and collision come from the generator/manifest pair, so edit the generator, not `map.ts`, to change the layout.
- Avatar groups have their origin at the FEET (y=0 at ground), matching `PlayerState.y`.

### Server specifics that look wrong but are load-bearing
- `WorldRoom` sets `autoDispose = false`: the world is one persistent room; default disposal would deregister it and reset state whenever it empties. Do not remove.
- `server/vitest.config.ts` forces `pool: 'threads'`: `@colyseus/tools`' `listen()` calls `process.send('ready')`, which corrupts Vitest's default forks-pool IPC.
- `server/tsconfig.json` needs `experimentalDecorators: true` and `useDefineForClassFields: false` for `@colyseus/schema` decorators.
- Unconsented disconnects get a 15 s `allowReconnection` grace (the avatar freezes for others until it expires); consented leaves are removed immediately.
- **Colyseus kicks clients on unregistered message types in production** (verified in @colyseus/core Room.js `__no_message_handler`). Coordinate client/server deploys when removing handlers and reload old clients; gate newly added message types on an advertised capability.

### Deployment constraints and remaining verification
- `WorldRoom` enforces one persistent room per server process. A second room creation throws code 4210; the join screen retries every five seconds and offers cancellation. Deploy exactly one server process/instance; horizontal scaling needs distributed singleton coordination.
- The client freezes movement on game disconnect. It attempts session reconnection within the 15 s grace, rebuilding subscriptions without a second renderer. Expiry/server restart shows a return-to-join action.
- Production hosting and the 60 fps target require manual verification. The basic nickname substring filter and absence of a transport-level message flood limiter remain hardening follow-ups, not comprehensive moderation.
- `serverUrl()` honors a build-time `VITE_SERVER_URL` (deployed builds); without it, falls back to `ws://<hostname>:2567` for local/LAN dev. Server deploys via `render.yaml` (Render free plan; `@colyseus/tools` honors Render's `PORT`); client deploys on Cloudflare Pages (root `client/`, build `npm run build`, output `dist`, env `VITE_SERVER_URL=wss://<render-url>`).

## Process conventions in this repo

Each phase follows: spec (`docs/superpowers/specs/`) → detailed plan (`docs/superpowers/plans/`, one per phase, written after the prior phase ships) → task-by-task implementation with TDD. Plans contain exact code and test content; when a plan's code conflicts with reality (e.g., library API drift), keep the plan's interfaces and semantics, adapt the call syntax, and record the deviation.
