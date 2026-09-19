# Hangout World — Phase 2: Multiplayer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple visitors join the same world through a join screen (nickname + avatar color) and see each other's avatars move, run, and jump live, with floating name tags.

**Architecture:** A Colyseus game server (Node.js/TypeScript, `server/`) holds the authoritative room state: a map of players (name, color, x, y, z, heading). The Phase 1 client keeps full local prediction (its own movement is unchanged); it sends its pose to the server 15 times per second and renders every OTHER player from server state, smoothed by an exponential-interpolation helper. Pure logic (name sanitizing, movement validation, interpolation math) lives in dependency-free modules with Vitest tests; Colyseus room behavior is tested with @colyseus/testing.

**Tech Stack:** Colyseus 0.16 (server), colyseus.js 0.16 (client), @colyseus/schema 3.x, tsx (server dev runner), Vitest. Client stack unchanged (TypeScript, Vite, Three.js).

**Spec:** `docs/superpowers/specs/2026-09-19-hangout-world-design.md` (build phase 2: "Multiplayer: Colyseus room, join screen, see others move with interpolation, name tags")

## Global Constraints

- All code is TypeScript with `"strict": true` (both packages).
- `server/` is a separate npm package from `client/`; run each package's npm commands inside its own directory.
- Server listens on port 2567 (Colyseus default); client connects to `ws(s)://<location.hostname>:2567` so LAN testing works.
- Room name is `"world"`, `maxClients = 20`, reconnection grace 15 s.
- Client sends a `"move"` message ({x, y, z, heading}) every 4th fixed step (60 Hz / 4 = 15 Hz). The local player NEVER renders from server state — local prediction stays exactly as Phase 1 built it.
- Server validates every move: x/z clamped to ±WORLD_HALF, y clamped to [0, 10], horizontal displacement per message capped at MAX_STEP = 1.5 m (run speed 8 m/s ÷ 15 Hz ≈ 0.53 m, so 1.5 is generous), non-finite values rejected.
- Shared constants (WORLD_HALF = 30, SPAWN = {x:0, y:0, z:8}) are DUPLICATED in `server/src/constants.ts` with a "must match client" comment — no cross-package imports (keeps client statically buildable and server standalone). Any change must touch both.
- Nicknames: trimmed, inner whitespace collapsed, 2–16 chars, profanity-filtered against a word list; anything invalid becomes "Guest".
- Avatar colors: 6 presets, selected by index 0–5 (client owns the hex list; server stores only the index, clamped).
- Client game-logic modules still never import `three`; `net/interpolation.ts` is pure math (plain-Node Vitest); `net/connection.ts` imports only `colyseus.js`.
- **Ruling (spec deviation, deliberate):** the client uses `joinOrCreate("world")`. If 20 players are ever exceeded, Colyseus spins up a second world instance instead of showing the spec's "world is full, retrying…" message. Single-instance enforcement + the full-room UX is deferred to Phase 5 polish; at current scale this is unreachable.
- Colyseus API note for implementers: the exact 0.16 API surface (e.g. `getStateCallbacks`, `@colyseus/tools` config shape) should be confirmed against the INSTALLED package types if a call in this plan doesn't compile — keep the plan's interfaces and semantics, adapt the call syntax, and note the adaptation in your report.

## File Structure

```
server/
  package.json          — colyseus deps, dev/start/test/build scripts
  tsconfig.json         — strict, experimentalDecorators, useDefineForClassFields:false
  .gitignore            — node_modules/
  src/
    constants.ts        — WORLD_HALF, SPAWN, MAX_STEP, MAX_Y, COLOR_COUNT (mirrors client)
    validation.ts       — sanitizeName, clampColorIndex, validateMove (pure)
    schema.ts           — PlayerState, WorldState (@colyseus/schema)
    WorldRoom.ts        — join/leave/move handling
    app.config.ts       — @colyseus/tools config defining the "world" room
    index.ts            — listen(app)
  tests/
    validation.test.ts
    worldRoom.test.ts   — @colyseus/testing integration
client/src/
  net/interpolation.ts  — Pose, shortestAngleDelta, stepToward (pure math)
  net/connection.ts     — serverUrl(), joinWorld(name, colorIndex) → Room
  ui/joinScreen.ts      — DOM overlay: nickname, 6 color swatches, enter button
  player/nametag.ts     — canvas-texture THREE.Sprite name tag
  net/remotePlayers.ts  — roster of remote avatars, applies interpolation (Three.js)
  main.ts               — MODIFIED: join flow, send loop, remote player wiring
client/tests/
  interpolation.test.ts
  joinScreen.test.ts    — happy-dom
```

---

### Task 1: Server scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.gitignore`
- Create: `server/src/constants.ts`
- Create: `server/src/index.ts` (placeholder — replaced properly in Task 3's app config step; here it just proves the toolchain runs)

**Interfaces:**
- Consumes: nothing.
- Produces: a compiling server package with `npm run build` (tsc --noEmit) and `npm test` (vitest) scripts; `server/src/constants.ts` exporting:
  ```ts
  export const WORLD_HALF = 30;
  export const SPAWN = { x: 0, y: 0, z: 8 };
  export const MAX_STEP = 1.5;
  export const MAX_Y = 10;
  export const COLOR_COUNT = 6;
  export const RECONNECT_GRACE_SECONDS = 15;
  export const MAX_CLIENTS = 20;
  ```

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "hangout-world-server",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@colyseus/schema": "^3.0.0",
    "@colyseus/tools": "^0.16.0",
    "colyseus": "^0.16.0"
  },
  "devDependencies": {
    "@colyseus/testing": "^0.16.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

`useDefineForClassFields: false` and `experimentalDecorators: true` are REQUIRED by @colyseus/schema decorators — do not omit them.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `server/.gitignore`**

```
node_modules/
```

- [ ] **Step 4: Create `server/src/constants.ts`**

```ts
// MUST MATCH client values:
//   WORLD_HALF  ↔ client/src/world/map.ts
//   SPAWN       ↔ client/src/world/map.ts
// Any change here must be mirrored there (and vice versa).
export const WORLD_HALF = 30;
export const SPAWN = { x: 0, y: 0, z: 8 };

// Server-only tuning:
export const MAX_STEP = 1.5;   // max horizontal metres per move message (15 Hz)
export const MAX_Y = 10;       // max plausible height (jump apex ≈ 1.2 + stage 1.5)
export const COLOR_COUNT = 6;  // client's AVATAR_COLORS length
export const RECONNECT_GRACE_SECONDS = 15;
export const MAX_CLIENTS = 20;
```

- [ ] **Step 5: Create placeholder `server/src/index.ts`**

```ts
// Placeholder entrypoint — replaced in Task 3 with the Colyseus app config.
console.log('hangout-world-server: scaffold OK');
```

- [ ] **Step 6: Install and verify**

Run (from `server/`): `npm install && npm run build && npx tsx src/index.ts`
Expected: install succeeds, tsc passes, the placeholder prints `hangout-world-server: scaffold OK`.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: scaffold Colyseus server package"
```

### Task 2: Server validation module

**Files:**
- Create: `server/src/validation.ts`
- Test: `server/tests/validation.test.ts`

**Interfaces:**
- Consumes: `server/src/constants.ts` (WORLD_HALF, MAX_STEP, MAX_Y, COLOR_COUNT).
- Produces (Task 3 uses these exact signatures):
  ```ts
  export function sanitizeName(raw: unknown): string;          // always returns a safe display name
  export function clampColorIndex(raw: unknown): number;       // integer 0..COLOR_COUNT-1
  export interface Pose { x: number; y: number; z: number; heading: number }
  export function validateMove(current: Pose, target: unknown): Pose;  // never throws, always returns a safe pose
  ```

- [ ] **Step 1: Write the failing test**

Create `server/tests/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeName, clampColorIndex, validateMove, type Pose } from '../src/validation';
import { WORLD_HALF, MAX_STEP, MAX_Y } from '../src/constants';

describe('sanitizeName', () => {
  it('accepts a normal name, trimmed', () => {
    expect(sanitizeName('  Alice  ')).toBe('Alice');
  });
  it('collapses inner whitespace', () => {
    expect(sanitizeName('Ann   Lee')).toBe('Ann Lee');
  });
  it('truncates to 16 chars', () => {
    expect(sanitizeName('abcdefghijklmnopqrstuvwx')).toBe('abcdefghijklmnop');
  });
  it('falls back to Guest for short, empty, or non-string input', () => {
    expect(sanitizeName('a')).toBe('Guest');
    expect(sanitizeName('')).toBe('Guest');
    expect(sanitizeName(undefined)).toBe('Guest');
    expect(sanitizeName(42)).toBe('Guest');
  });
  it('falls back to Guest for profane names, case-insensitively', () => {
    expect(sanitizeName('FuckYou')).toBe('Guest');
    expect(sanitizeName('sHiThead')).toBe('Guest');
  });
});

describe('clampColorIndex', () => {
  it('passes valid indexes through', () => {
    expect(clampColorIndex(0)).toBe(0);
    expect(clampColorIndex(5)).toBe(5);
  });
  it('clamps/repairs invalid input to 0', () => {
    expect(clampColorIndex(99)).toBe(0);
    expect(clampColorIndex(-1)).toBe(0);
    expect(clampColorIndex(2.7)).toBe(0);
    expect(clampColorIndex('3')).toBe(0);
    expect(clampColorIndex(undefined)).toBe(0);
  });
});

describe('validateMove', () => {
  const at: Pose = { x: 0, y: 0, z: 8, heading: 0 };

  it('accepts a normal small step', () => {
    const next = validateMove(at, { x: 0.4, y: 0, z: 7.7, heading: 1.2 });
    expect(next).toEqual({ x: 0.4, y: 0, z: 7.7, heading: 1.2 });
  });
  it('returns current pose for garbage input', () => {
    expect(validateMove(at, null)).toEqual(at);
    expect(validateMove(at, 'x')).toEqual(at);
    expect(validateMove(at, { x: NaN, y: 0, z: 0, heading: 0 })).toEqual(at);
    expect(validateMove(at, { x: Infinity, y: 0, z: 0, heading: 0 })).toEqual(at);
    expect(validateMove(at, { x: 1, y: 0, z: 0 })).toEqual(at); // missing heading
  });
  it('clamps x/z to the world bounds', () => {
    const next = validateMove({ x: WORLD_HALF - 0.1, y: 0, z: 0, heading: 0 },
                              { x: WORLD_HALF + 50, y: 0, z: 0, heading: 0 });
    expect(next.x).toBe(WORLD_HALF);
  });
  it('clamps y to [0, MAX_Y]', () => {
    expect(validateMove(at, { x: 0, y: -5, z: 8, heading: 0 }).y).toBe(0);
    expect(validateMove(at, { x: 0, y: 99, z: 8, heading: 0 }).y).toBe(MAX_Y);
  });
  it('caps horizontal teleports at MAX_STEP toward the target', () => {
    const next = validateMove(at, { x: 10, y: 0, z: 8, heading: 0 });
    expect(next.x).toBeCloseTo(MAX_STEP, 5);   // moved MAX_STEP toward x=10
    expect(next.z).toBeCloseTo(8, 5);
  });
  it('allows a full-speed run step untouched', () => {
    // 8 m/s at 15 Hz = 0.533 m
    const next = validateMove(at, { x: 0.53, y: 0, z: 8, heading: 0 });
    expect(next.x).toBeCloseTo(0.53, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `server/`): `npx vitest run tests/validation.test.ts`
Expected: FAIL — cannot resolve `../src/validation`.

- [ ] **Step 3: Write the implementation**

Create `server/src/validation.ts`:

```ts
import { WORLD_HALF, MAX_STEP, MAX_Y, COLOR_COUNT } from './constants';

const BANNED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'asshole',
  'dick', 'pussy', 'whore', 'slut', 'hitler', 'nazi', 'rape',
];

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Guest';
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 16);
  if (name.length < 2) return 'Guest';
  const lower = name.toLowerCase();
  if (BANNED_WORDS.some((w) => lower.includes(w))) return 'Guest';
  return name;
}

export function clampColorIndex(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return 0;
  return raw >= 0 && raw < COLOR_COUNT ? raw : 0;
}

export interface Pose { x: number; y: number; z: number; heading: number }

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function validateMove(current: Pose, target: unknown): Pose {
  if (typeof target !== 'object' || target === null) return { ...current };
  const t = target as Record<string, unknown>;
  const nums = [t.x, t.y, t.z, t.heading];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { ...current };
  }
  let x = clamp(t.x as number, -WORLD_HALF, WORLD_HALF);
  let z = clamp(t.z as number, -WORLD_HALF, WORLD_HALF);
  const y = clamp(t.y as number, 0, MAX_Y);
  const heading = t.heading as number;

  // Cap horizontal displacement at MAX_STEP toward the target.
  const dx = x - current.x;
  const dz = z - current.z;
  const dist = Math.hypot(dx, dz);
  if (dist > MAX_STEP) {
    const s = MAX_STEP / dist;
    x = current.x + dx * s;
    z = current.z + dz * s;
  }
  return { x, y, z, heading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/validation.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/validation.ts server/tests/validation.test.ts
git commit -m "feat: server-side name sanitizing and movement validation"
```

### Task 3: World room (schema + join/leave/move)

**Files:**
- Create: `server/src/schema.ts`
- Create: `server/src/WorldRoom.ts`
- Create: `server/src/app.config.ts`
- Modify: `server/src/index.ts` (replace the Task 1 placeholder)
- Test: `server/tests/worldRoom.test.ts`

**Interfaces:**
- Consumes: `sanitizeName`, `clampColorIndex`, `validateMove` (Task 2); constants (Task 1).
- Produces: room `"world"` on port 2567. State shape the CLIENT (Tasks 5–7) relies on:
  ```
  state.players: MapSchema<PlayerState> keyed by sessionId
  PlayerState: { name: string; colorIndex: uint8; x, y, z, heading: float32 }
  ```
  Client → server message: `room.send("move", { x, y, z, heading })`.
  Join options: `{ name: string; colorIndex: number }`.

- [ ] **Step 1: Write the schema**

Create `server/src/schema.ts`:

```ts
import { Schema, MapSchema, type } from '@colyseus/schema';
import { SPAWN } from './constants';

export class PlayerState extends Schema {
  @type('string') name = 'Guest';
  @type('uint8') colorIndex = 0;
  @type('float32') x = SPAWN.x;
  @type('float32') y = SPAWN.y;
  @type('float32') z = SPAWN.z;
  @type('float32') heading = 0;
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
```

- [ ] **Step 2: Write the failing room test**

Create `server/tests/worldRoom.test.ts`. (If the installed @colyseus/testing API differs in details — e.g. `boot` signature — adapt the harness calls, keep the assertions.)

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import appConfig from '../src/app.config';
import { WORLD_HALF, MAX_STEP, SPAWN } from '../src/constants';

describe('WorldRoom', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => { colyseus = await boot(appConfig); });
  afterAll(async () => { await colyseus.shutdown(); });
  beforeEach(async () => { await colyseus.cleanup(); });

  it('spawns a joining player at SPAWN with sanitized name and color', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: '  Alice  ', colorIndex: 3 });
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.name).toBe('Alice');
    expect(p.colorIndex).toBe(3);
    expect(p.x).toBe(SPAWN.x);
    expect(p.z).toBe(SPAWN.z);
  });

  it('replaces a bad nickname with Guest', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'shithead', colorIndex: 0 });
    await room.waitForNextPatch();
    expect(room.state.players.get(client.sessionId)!.name).toBe('Guest');
  });

  it('applies a valid move message', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: 1, y: 0, z: 7.5, heading: 0.5 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(1, 4);
    expect(p.z).toBeCloseTo(7.5, 4);
    expect(p.heading).toBeCloseTo(0.5, 4);
  });

  it('clamps a teleport move to MAX_STEP', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: SPAWN.x + 30, y: 0, z: SPAWN.z, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBeCloseTo(SPAWN.x + MAX_STEP, 4);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(WORLD_HALF);
  });

  it('ignores malformed move payloads', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    client.send('move', { x: NaN, y: 0, z: 0, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    const p = room.state.players.get(client.sessionId)!;
    expect(p.x).toBe(SPAWN.x);
    expect(p.z).toBe(SPAWN.z);
  });

  it('removes the player on consented leave', async () => {
    const room = await colyseus.createRoom('world', {});
    const client = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 0 });
    await room.waitForNextPatch();
    const id = client.sessionId;
    await client.leave(true);
    await room.waitForNextPatch();
    expect(room.state.players.get(id)).toBeUndefined();
  });

  it('tracks two players independently', async () => {
    const room = await colyseus.createRoom('world', {});
    const a = await colyseus.connectTo(room, { name: 'Alice', colorIndex: 1 });
    const b = await colyseus.connectTo(room, { name: 'Bob', colorIndex: 2 });
    a.send('move', { x: 1, y: 0, z: 8, heading: 0 });
    await room.waitForMessage('move');
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get(a.sessionId)!.x).toBeCloseTo(1, 4);
    expect(room.state.players.get(b.sessionId)!.x).toBe(SPAWN.x);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `server/`): `npx vitest run tests/worldRoom.test.ts`
Expected: FAIL — cannot resolve `../src/app.config` (and WorldRoom does not exist yet).

- [ ] **Step 4: Write the room, app config, and entrypoint**

Create `server/src/WorldRoom.ts`:

```ts
import { Room, type Client } from 'colyseus';
import { WorldState, PlayerState } from './schema';
import { sanitizeName, clampColorIndex, validateMove } from './validation';
import { SPAWN, MAX_CLIENTS, RECONNECT_GRACE_SECONDS } from './constants';

interface JoinOptions { name?: unknown; colorIndex?: unknown }

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_CLIENTS;
  state = new WorldState();

  onCreate(): void {
    this.onMessage('move', (client, message: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const next = validateMove({ x: p.x, y: p.y, z: p.z, heading: p.heading }, message);
      p.x = next.x;
      p.y = next.y;
      p.z = next.z;
      p.heading = next.heading;
    });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const p = new PlayerState();
    p.name = sanitizeName(options?.name);
    p.colorIndex = clampColorIndex(options?.colorIndex);
    p.x = SPAWN.x;
    p.y = SPAWN.y;
    p.z = SPAWN.z;
    this.state.players.set(client.sessionId, p);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    if (!consented) {
      try {
        // Keep the player in the world during brief disconnects.
        await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
        return;
      } catch {
        // grace expired — fall through to removal
      }
    }
    this.state.players.delete(client.sessionId);
  }
}
```

Create `server/src/app.config.ts`:

```ts
import config from '@colyseus/tools';
import { WorldRoom } from './WorldRoom';

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define('world', WorldRoom);
  },
});
```

Replace `server/src/index.ts`:

```ts
import { listen } from '@colyseus/tools';
import app from './app.config';

// Listens on process.env.PORT || 2567
listen(app);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/worldRoom.test.ts`
Expected: PASS (7 tests). Common trip-ups if it fails: missing `experimentalDecorators`/`useDefineForClassFields:false` in tsconfig; @colyseus/testing `boot` needing the config object exactly as `app.config.ts` exports it.

- [ ] **Step 6: Full server suite, typecheck, and a real boot**

Run: `npm test && npm run build`
Then: `npx tsx src/index.ts` briefly — expected: Colyseus prints its listening banner on port 2567 (Ctrl+C / kill after confirming).

- [ ] **Step 7: Commit**

```bash
git add server/src server/tests
git commit -m "feat: world room with join/leave, validated movement, and reconnection grace"
```

### Task 4: Client interpolation math + connection module

**Files:**
- Create: `client/src/net/interpolation.ts`
- Create: `client/src/net/connection.ts`
- Modify: `client/package.json` (add `colyseus.js`)
- Test: `client/tests/interpolation.test.ts`

**Interfaces:**
- Consumes: nothing (interpolation is pure math; connection wraps colyseus.js).
- Produces (Tasks 6–7 use these exact signatures):
  ```ts
  // interpolation.ts (pure — no imports, plain-Node Vitest)
  export interface Pose { x: number; y: number; z: number; heading: number }
  export const SNAP_DISTANCE = 5;      // teleport threshold (m)
  export const SMOOTHING = 12;         // exponential smoothing rate (1/s)
  export function shortestAngleDelta(from: number, to: number): number; // in (-π, π]
  export function stepToward(current: Pose, target: Pose, dt: number): Pose;

  // connection.ts
  export const AVATAR_COLORS = [0x4f8ef7, 0xf25f5c, 0x59cd90, 0xffe066, 0x9b5de5, 0xf58a4b];
  export function serverUrl(): string;  // ws(s)://<location.hostname>:2567
  export function joinWorld(name: string, colorIndex: number): Promise<Room>;
  ```

- [ ] **Step 1: Add the client dependency**

In `client/package.json` dependencies, add `"colyseus.js": "^0.16.0"`, then run `npm install` (from `client/`).

- [ ] **Step 2: Write the failing interpolation test**

Create `client/tests/interpolation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stepToward, shortestAngleDelta, SNAP_DISTANCE, type Pose } from '../src/net/interpolation';

const at = (x: number, z: number, heading = 0): Pose => ({ x, y: 0, z, heading });

describe('shortestAngleDelta', () => {
  it('returns the direct difference for small angles', () => {
    expect(shortestAngleDelta(0.2, 0.5)).toBeCloseTo(0.3, 5);
    expect(shortestAngleDelta(0.5, 0.2)).toBeCloseTo(-0.3, 5);
  });
  it('wraps across the ±π seam', () => {
    // from 3.0 to -3.0 the short way is +0.283 (through π), not -6.0
    expect(shortestAngleDelta(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6.0, 5);
    expect(shortestAngleDelta(-3.0, 3.0)).toBeCloseTo(-(2 * Math.PI - 6.0), 5);
  });
});

describe('stepToward', () => {
  it('moves toward the target without overshooting', () => {
    const next = stepToward(at(0, 0), at(1, 0), 1 / 60);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(1);
  });
  it('converges to the target within a second', () => {
    let p = at(0, 0);
    const target = at(2, -1, 1.0);
    for (let i = 0; i < 60; i++) p = stepToward(p, target, 1 / 60);
    expect(p.x).toBeCloseTo(2, 1);
    expect(p.z).toBeCloseTo(-1, 1);
    expect(p.heading).toBeCloseTo(1.0, 1);
  });
  it('snaps instantly when the target is far (teleport)', () => {
    const next = stepToward(at(0, 0), at(SNAP_DISTANCE + 1, 0), 1 / 60);
    expect(next.x).toBe(SNAP_DISTANCE + 1);
  });
  it('interpolates heading across the ±π seam the short way', () => {
    const next = stepToward(at(0, 0, 3.1), at(0, 0, -3.1), 1 / 60);
    // must move toward +π (increasing), not down through 0
    expect(next.heading).toBeGreaterThan(3.1);
  });
  it('is stable at the target (no drift)', () => {
    const p = at(1, 1, 0.5);
    const next = stepToward(p, at(1, 1, 0.5), 1 / 60);
    expect(next).toEqual(p);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `client/`): `npx vitest run tests/interpolation.test.ts`
Expected: FAIL — cannot resolve `../src/net/interpolation`.

- [ ] **Step 4: Write the interpolation implementation**

Create `client/src/net/interpolation.ts`:

```ts
export interface Pose { x: number; y: number; z: number; heading: number }

export const SNAP_DISTANCE = 5;
export const SMOOTHING = 12;

export function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export function stepToward(current: Pose, target: Pose, dt: number): Pose {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  if (Math.hypot(dx, dz) > SNAP_DISTANCE) return { ...target };

  const k = 1 - Math.exp(-SMOOTHING * dt);
  return {
    x: current.x + dx * k,
    y: current.y + (target.y - current.y) * k,
    z: current.z + dz * k,
    heading: current.heading + shortestAngleDelta(current.heading, target.heading) * k,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/interpolation.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the connection module**

Create `client/src/net/connection.ts` (thin wrapper — verified via the room test on the server side and the Task 7 manual check; no unit test):

```ts
import { Client, type Room } from 'colyseus.js';

// Index positions must stay stable — the server stores only the index.
export const AVATAR_COLORS = [0x4f8ef7, 0xf25f5c, 0x59cd90, 0xffe066, 0x9b5de5, 0xf58a4b];

export function serverUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:2567`;
}

export function joinWorld(name: string, colorIndex: number): Promise<Room> {
  const client = new Client(serverUrl());
  return client.joinOrCreate('world', { name, colorIndex });
}
```

- [ ] **Step 7: Full client suite and typecheck**

Run: `npm test && npm run build`
Expected: all suites pass (35 + 7 new), build clean.

- [ ] **Step 8: Commit**

```bash
git add client/src/net client/tests/interpolation.test.ts client/package.json client/package-lock.json
git commit -m "feat: remote-pose interpolation math and Colyseus connection module"
```

### Task 5: Join screen UI

**Files:**
- Create: `client/src/ui/joinScreen.ts`
- Test: `client/tests/joinScreen.test.ts`

**Interfaces:**
- Consumes: `AVATAR_COLORS` from `net/connection.ts`.
- Produces (Task 7 uses this exact signature):
  ```ts
  // Shows a fullscreen overlay. Resolves the overlay away only after
  // onJoin resolves; if onJoin rejects, shows the error and lets the
  // user try again.
  export function showJoinScreen(
    onJoin: (name: string, colorIndex: number) => Promise<void>
  ): void;
  ```
  DOM contract (for tests and styling): overlay root `#join-screen`, name input `#join-name`, color swatch buttons `.join-swatch` (6, `data-index` 0–5, selected one has class `selected`), submit button `#join-btn`, error line `#join-error`.

- [ ] **Step 1: Write the failing test**

Create `client/tests/joinScreen.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showJoinScreen } from '../src/ui/joinScreen';

function el<T extends HTMLElement>(sel: string): T {
  const found = document.querySelector<T>(sel);
  if (!found) throw new Error(`missing ${sel}`);
  return found;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('showJoinScreen', () => {
  it('renders name input, 6 swatches, and a join button', () => {
    showJoinScreen(async () => {});
    expect(el('#join-screen')).toBeTruthy();
    expect(el('#join-name')).toBeTruthy();
    expect(document.querySelectorAll('.join-swatch').length).toBe(6);
    expect(el('#join-btn')).toBeTruthy();
  });

  it('selecting a swatch marks it selected', () => {
    showJoinScreen(async () => {});
    const swatches = document.querySelectorAll<HTMLButtonElement>('.join-swatch');
    swatches[4].click();
    expect(swatches[4].classList.contains('selected')).toBe(true);
    expect(swatches[0].classList.contains('selected')).toBe(false);
  });

  it('calls onJoin with trimmed name and selected color, then removes the overlay', async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    showJoinScreen(onJoin);
    el<HTMLInputElement>('#join-name').value = '  Alice ';
    document.querySelectorAll<HTMLButtonElement>('.join-swatch')[2].click();
    el<HTMLButtonElement>('#join-btn').click();
    await vi.waitFor(() => expect(onJoin).toHaveBeenCalledWith('Alice', 2));
    await vi.waitFor(() => expect(document.querySelector('#join-screen')).toBeNull());
  });

  it('does not call onJoin for an empty or too-short name', () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    showJoinScreen(onJoin);
    el<HTMLInputElement>('#join-name').value = ' a ';
    el<HTMLButtonElement>('#join-btn').click();
    expect(onJoin).not.toHaveBeenCalled();
    expect(el('#join-error').textContent).not.toBe('');
  });

  it('shows an error and keeps the overlay when onJoin rejects', async () => {
    const onJoin = vi.fn().mockRejectedValue(new Error('server down'));
    showJoinScreen(onJoin);
    el<HTMLInputElement>('#join-name').value = 'Alice';
    el<HTMLButtonElement>('#join-btn').click();
    await vi.waitFor(() => expect(el('#join-error').textContent).toContain('server down'));
    expect(document.querySelector('#join-screen')).toBeTruthy();
    expect(el<HTMLButtonElement>('#join-btn').disabled).toBe(false); // can retry
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npx vitest run tests/joinScreen.test.ts`
Expected: FAIL — cannot resolve `../src/ui/joinScreen`.

- [ ] **Step 3: Write the implementation**

Create `client/src/ui/joinScreen.ts`:

```ts
import { AVATAR_COLORS } from '../net/connection';

const CSS = `
#join-screen { position: fixed; inset: 0; display: flex; align-items: center;
  justify-content: center; background: rgba(15, 23, 42, 0.85); z-index: 10;
  font-family: system-ui, sans-serif; }
#join-card { background: #ffffff; border-radius: 12px; padding: 28px;
  width: 320px; display: flex; flex-direction: column; gap: 14px; }
#join-card h1 { margin: 0; font-size: 22px; color: #0f172a; }
#join-name { padding: 10px; font-size: 16px; border: 1px solid #cbd5e1;
  border-radius: 8px; }
#join-swatches { display: flex; gap: 10px; }
.join-swatch { width: 34px; height: 34px; border-radius: 50%; border: 3px solid
  transparent; cursor: pointer; }
.join-swatch.selected { border-color: #0f172a; }
#join-btn { padding: 12px; font-size: 16px; font-weight: 600; color: #fff;
  background: #2563eb; border: 0; border-radius: 8px; cursor: pointer; }
#join-btn:disabled { opacity: 0.6; cursor: wait; }
#join-error { color: #dc2626; font-size: 14px; min-height: 18px; margin: 0; }
`;

export function showJoinScreen(
  onJoin: (name: string, colorIndex: number) => Promise<void>
): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'join-screen';
  overlay.innerHTML = `
    <div id="join-card">
      <h1>Hangout World</h1>
      <input id="join-name" maxlength="16" placeholder="Your nickname" />
      <div id="join-swatches"></div>
      <p id="join-error"></p>
      <button id="join-btn">Enter world</button>
    </div>`;
  document.body.appendChild(overlay);

  const swatchRow = overlay.querySelector('#join-swatches')!;
  let colorIndex = 0;
  AVATAR_COLORS.forEach((color, i) => {
    const b = document.createElement('button');
    b.className = 'join-swatch' + (i === 0 ? ' selected' : '');
    b.dataset.index = String(i);
    b.style.background = '#' + color.toString(16).padStart(6, '0');
    b.addEventListener('click', () => {
      colorIndex = i;
      swatchRow.querySelectorAll('.join-swatch').forEach((s, j) =>
        s.classList.toggle('selected', j === i)
      );
    });
    swatchRow.appendChild(b);
  });

  const nameInput = overlay.querySelector<HTMLInputElement>('#join-name')!;
  const button = overlay.querySelector<HTMLButtonElement>('#join-btn')!;
  const error = overlay.querySelector<HTMLParagraphElement>('#join-error')!;

  const submit = async () => {
    const name = nameInput.value.trim();
    if (name.length < 2) {
      error.textContent = 'Please enter a nickname (at least 2 characters).';
      return;
    }
    error.textContent = '';
    button.disabled = true;
    try {
      await onJoin(name, colorIndex);
      overlay.remove();
      style.remove();
    } catch (e) {
      error.textContent = `Could not join: ${e instanceof Error ? e.message : 'unknown error'}`;
      button.disabled = false;
    }
  };

  button.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  nameInput.focus();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/joinScreen.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/ui client/tests/joinScreen.test.ts
git commit -m "feat: join screen with nickname and avatar color picker"
```

### Task 6: Name tags + remote player roster (rendering)

**Files:**
- Create: `client/src/player/nametag.ts`
- Create: `client/src/net/remotePlayers.ts`

**Interfaces:**
- Consumes: `createAvatar` (Phase 1), `AVATAR_COLORS` (Task 4), `stepToward`/`Pose` (Task 4), `PLAYER_HEIGHT` (Phase 1 controller).
- Produces (Task 7 uses these exact signatures):
  ```ts
  // nametag.ts (Three.js allowed)
  export function createNameTag(name: string): THREE.Sprite;  // positioned by caller

  // remotePlayers.ts (Three.js allowed)
  export interface RemoteInfo { name: string; colorIndex: number; x: number; y: number; z: number; heading: number }
  export class RemotePlayers {
    readonly group: THREE.Group;                      // add to the scene once
    add(sessionId: string, info: RemoteInfo): void;   // creates avatar + name tag
    updateTarget(sessionId: string, pose: Pose): void;
    remove(sessionId: string): void;
    tick(dt: number): void;                           // interpolates every remote toward its target
  }
  ```
  No unit tests — thin Three.js composition over already-tested interpolation math; verified in Task 7's manual checklist.

- [ ] **Step 1: Create `client/src/player/nametag.ts`**

```ts
import * as THREE from 'three';

export function createNameTag(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 64, 16);
  ctx.fill();
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 128, 34, 236);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: true })
  );
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}
```

- [ ] **Step 2: Create `client/src/net/remotePlayers.ts`**

```ts
import * as THREE from 'three';
import { createAvatar } from '../player/avatar';
import { createNameTag } from '../player/nametag';
import { PLAYER_HEIGHT } from '../player/controller';
import { AVATAR_COLORS } from './connection';
import { stepToward, type Pose } from './interpolation';

export interface RemoteInfo {
  name: string;
  colorIndex: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface Entry {
  root: THREE.Group;
  pose: Pose;     // rendered (smoothed) pose
  target: Pose;   // latest server pose
}

export class RemotePlayers {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();

  add(sessionId: string, info: RemoteInfo): void {
    if (this.entries.has(sessionId)) this.remove(sessionId);
    const color = AVATAR_COLORS[info.colorIndex] ?? AVATAR_COLORS[0];
    const root = createAvatar(color);
    const tag = createNameTag(info.name);
    tag.position.set(0, PLAYER_HEIGHT + 0.45, 0);
    root.add(tag);

    const pose: Pose = { x: info.x, y: info.y, z: info.z, heading: info.heading };
    root.position.set(pose.x, pose.y, pose.z);
    root.rotation.y = pose.heading;

    this.group.add(root);
    this.entries.set(sessionId, { root, pose, target: { ...pose } });
  }

  updateTarget(sessionId: string, pose: Pose): void {
    const entry = this.entries.get(sessionId);
    if (entry) entry.target = { ...pose };
  }

  remove(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.group.remove(entry.root);
    this.entries.delete(sessionId);
  }

  tick(dt: number): void {
    for (const entry of this.entries.values()) {
      entry.pose = stepToward(entry.pose, entry.target, dt);
      entry.root.position.set(entry.pose.x, entry.pose.y, entry.pose.z);
      entry.root.rotation.y = entry.pose.heading;
    }
  }
}
```

- [ ] **Step 3: Typecheck and full suite**

Run (from `client/`): `npm test && npm run build`
Expected: all green (no new tests; nothing broken).

- [ ] **Step 4: Commit**

```bash
git add client/src/player/nametag.ts client/src/net/remotePlayers.ts
git commit -m "feat: name tag sprites and interpolated remote player roster"
```

### Task 7: Wire the join flow and network loop into main.ts

**Files:**
- Modify: `client/src/main.ts`

**Interfaces:**
- Consumes: everything — `showJoinScreen` (Task 5), `joinWorld`/`AVATAR_COLORS` (Task 4), `RemotePlayers` (Task 6), `createNameTag` (Task 6), plus all Phase 1 modules (unchanged).
- Produces: the playable multiplayer client.

**Design:** wrap the Phase 1 scene setup in a `start(room, name, colorIndex)` function invoked after joining. The local player's own name tag is added to the local avatar. Every 4th fixed step, send `move`. Remote roster driven by Colyseus state callbacks — skip our own sessionId. Use `getStateCallbacks(room)` from colyseus.js 0.16 (if the installed colyseus.js exposes state callbacks differently, adapt while keeping behavior; note it in the report).

- [ ] **Step 1: Rewrite `client/src/main.ts`**

```ts
import * as THREE from 'three';
import { getStateCallbacks, type Room } from 'colyseus.js';
import { KeyboardInput } from './input/keyboard';
import { createPlayerState, updatePlayer, PLAYER_HEIGHT, type MoveInput } from './player/controller';
import { createAvatar } from './player/avatar';
import { createNameTag } from './player/nametag';
import { OrbitCamera } from './camera/orbit';
import { buildMap, SPAWN } from './world/map';
import { showJoinScreen } from './ui/joinScreen';
import { joinWorld, AVATAR_COLORS } from './net/connection';
import { RemotePlayers } from './net/remotePlayers';

const SEND_EVERY_N_STEPS = 4; // 60 Hz / 4 = 15 Hz

showJoinScreen(async (name, colorIndex) => {
  const room = await joinWorld(name, colorIndex);
  start(room, name, colorIndex);
});

function start(room: Room, name: string, colorIndex: number): void {
  // --- Renderer / scene ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 90);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- World + local player ---
  const map = buildMap();
  scene.add(map.group);

  const avatar = createAvatar(AVATAR_COLORS[colorIndex] ?? AVATAR_COLORS[0]);
  const myTag = createNameTag(name);
  myTag.position.set(0, PLAYER_HEIGHT + 0.45, 0);
  avatar.add(myTag);
  scene.add(avatar);

  const input = new KeyboardInput();
  const orbit = new OrbitCamera();
  let player = createPlayerState(SPAWN.x, SPAWN.y, SPAWN.z);

  // --- Remote players ---
  const remotes = new RemotePlayers();
  scene.add(remotes.group);

  const $ = getStateCallbacks(room);
  $(room.state).players.onAdd((p: any, sessionId: string) => {
    if (sessionId === room.sessionId) return; // local player is predicted locally
    remotes.add(sessionId, {
      name: p.name, colorIndex: p.colorIndex,
      x: p.x, y: p.y, z: p.z, heading: p.heading,
    });
    $(p).onChange(() => {
      remotes.updateTarget(sessionId, { x: p.x, y: p.y, z: p.z, heading: p.heading });
    });
  });
  $(room.state).players.onRemove((_p: any, sessionId: string) => {
    remotes.remove(sessionId);
  });

  room.onLeave(() => {
    // Reload back to the join screen on disconnect — simplest reliable recovery.
    location.reload();
  });

  // --- Mouse: drag to orbit, wheel to zoom ---
  let dragging = false;
  renderer.domElement.addEventListener('mousedown', () => { dragging = true; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (dragging) orbit.applyDrag(e.movementX, e.movementY);
  });
  window.addEventListener('wheel', (e) => orbit.applyZoom(e.deltaY), { passive: true });

  // --- Fixed-timestep loop ---
  const STEP = 1 / 60;
  let accumulator = 0;
  let last = performance.now();
  let stepCount = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    accumulator += Math.min((now - last) / 1000, 0.25);
    last = now;

    while (accumulator >= STEP) {
      const k = input.state;
      const f = orbit.forward();
      const r = orbit.right();
      const move: MoveInput = {
        dirX: f.x * k.moveZ + r.x * k.moveX,
        dirZ: f.z * k.moveZ + r.z * k.moveX,
        run: k.run,
        jump: k.jump,
      };
      player = updatePlayer(player, move, STEP, map.collision);
      remotes.tick(STEP);

      stepCount++;
      if (stepCount % SEND_EVERY_N_STEPS === 0) {
        room.send('move', { x: player.x, y: player.y, z: player.z, heading: player.heading });
      }
      accumulator -= STEP;
    }

    avatar.position.set(player.x, player.y, player.z);
    avatar.rotation.y = player.heading;

    const off = orbit.offset();
    camera.position.set(player.x + off.x, player.y + off.y, player.z + off.z);
    camera.lookAt(player.x, player.y + 1.5, player.z);

    renderer.render(scene, camera);
  });
}
```

- [ ] **Step 2: Typecheck, tests, build**

Run (from `client/`): `npm test && npm run build`
Expected: all suites pass, build clean.

- [ ] **Step 3: Manual two-window checklist (requires a human OR a scriptable browser — if you are an agent without a browser, run both servers, confirm they boot and the client connects [server logs a join], then mark the rest pending human verification)**

Start the server: `cd server && npm run dev` — expect the Colyseus banner on 2567.
Start the client: `cd client && npm run dev -- --host`.
Open TWO browser windows at the printed URL:

- [ ] Both windows show the join screen; entering a nickname + color spawns into the park.
- [ ] Each window sees the OTHER player's avatar in their chosen color with their nickname floating above.
- [ ] Moving/running/jumping in one window animates smoothly (no teleporting/stutter) in the other within ~a quarter second.
- [ ] The remote avatar faces its movement direction.
- [ ] Closing one window makes its avatar disappear in the other (within the 15 s grace on hard disconnect, immediately on tab close).
- [ ] A profane nickname shows as "Guest".
- [ ] Refreshing a window returns it to the join screen and rejoining works.
- [ ] No console errors in either window; server log shows joins/leaves.

- [ ] **Step 4: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: multiplayer join flow, pose broadcasting, and remote player rendering"
```

---

## Phase 2 exit criteria

- `npm test` green in BOTH `client/` (47 tests: 35 + 7 interpolation + 5 join screen) and `server/` (20 tests: 13 validation + 7 room).
- `npm run build` clean in both packages.
- Manual two-window checklist verified.

## What comes next (separate plans)

- **Phase 3:** text chat (panel + bubbles) over the same room. **Phase 4:** LiveKit proximity voice. **Phase 5:** character models/animations, full-room UX, deploy.

