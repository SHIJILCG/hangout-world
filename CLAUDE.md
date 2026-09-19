# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Hangout World" — a browser 3D multiplayer hangout: visitors join via a nickname/color screen and walk, run, and jump around a low-poly park together. Spec and per-phase implementation plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`. Phases 1 (world + movement) and 2 (multiplayer) are built; phases 3–5 (text chat, LiveKit proximity voice, models/deploy) are planned in the spec but not yet implemented.

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
The local player is NEVER rendered from server state — `main.ts` runs full local prediction (fixed 1/60 timestep, accumulator clamped to 0.25 s) and sends a `move` every 4th step (15 Hz). Remote players are rendered from Colyseus state callbacks and smoothed by `net/interpolation.ts` (`stepToward`: exponential smoothing, shortest-arc heading wrap, instant snap beyond 5 m). The server validates every move in `server/src/validation.ts`: bounds clamp, y clamp, and a per-message displacement cap scaled by wall-clock time since the previous message (`MAX_SPEED`), applied in `WorldRoom.onMessage('move')`.

### Movement/physics conventions
- Heading = `Math.atan2(dirX, dirZ)`; avatars face +z at heading 0, so `mesh.rotation.y = heading`. Task code in three places depends on this — don't flip the atan2 arguments.
- Collision is ground plane + AABB boxes with step-up (`STEP_HEIGHT` 0.35 m). Slopes don't exist; stairs are stacks of boxes with rise ≤ STEP_HEIGHT.
- In `world/map.ts`, every solid visual and its collision Box come from the single `solid()` helper with the same numbers — always add solids through it so visuals and physics can't drift. Tree canopies are deliberately non-colliding (trunk only).
- Avatar groups have their origin at the FEET (y=0 at ground), matching `PlayerState.y`.

### Server specifics that look wrong but are load-bearing
- `WorldRoom` sets `autoDispose = false`: the world is one persistent room; default disposal would deregister it and reset state whenever it empties. Do not remove.
- `server/vitest.config.ts` forces `pool: 'threads'`: `@colyseus/tools`' `listen()` calls `process.send('ready')`, which corrupts Vitest's default forks-pool IPC.
- `server/tsconfig.json` needs `experimentalDecorators: true` and `useDefineForClassFields: false` for `@colyseus/schema` decorators.
- Unconsented disconnects get a 15 s `allowReconnection` grace (the avatar freezes for others until it expires); consented leaves are removed immediately.

### Known deferred items (ruled, not forgotten)
- `joinOrCreate` can spin up a second world instance past 20 players instead of a "world full" message — deferred to Phase 5.
- The move-rate limiter uses wall-clock dt, so a legit client's catch-up burst after a frame hitch can be briefly clamped (transient remote-view rubber-banding); the planned fix is a token-bucket allowance, first hardening item of Phase 3.
- `serverUrl()` honors a build-time `VITE_SERVER_URL` (deployed builds); without it, falls back to `ws://<hostname>:2567` for local/LAN dev. Server deploys via `render.yaml` (Render free plan; `@colyseus/tools` honors Render's `PORT`); client deploys on Cloudflare Pages (root `client/`, build `npm run build`, output `dist`, env `VITE_SERVER_URL=wss://<render-url>`).

## Process conventions in this repo

Each phase follows: spec (`docs/superpowers/specs/`) → detailed plan (`docs/superpowers/plans/`, one per phase, written after the prior phase ships) → task-by-task implementation with TDD. Plans contain exact code and test content; when a plan's code conflicts with reality (e.g., library API drift), keep the plan's interfaces and semantics, adapt the call syntax, and record the deviation.
