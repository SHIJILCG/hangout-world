# Hangout World — Phase 1: World & Single-Player Movement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor opens the site and walks, runs, and jumps a capsule avatar around a low-poly park map with a third-person orbit camera — single player only.

**Architecture:** Pure-TypeScript game logic (input state, collision math, kinematic character controller, orbit-camera math) kept in small dependency-free modules that are unit-tested headlessly with Vitest. Three.js is confined to rendering modules (map meshes, avatar mesh, render loop). `main.ts` wires logic to rendering with a fixed-timestep update loop.

**Tech Stack:** TypeScript, Vite, Three.js, Vitest (+ happy-dom for the keyboard test).

**Spec:** `docs/superpowers/specs/2026-09-19-hangout-world-design.md`

## Global Constraints

- All code is TypeScript with `"strict": true`.
- Client must remain a purely static site (no server code in this phase).
- Target 60 fps on a mid-range laptop; desktop browsers only (Chrome/Firefox/Edge).
- Game logic modules (`input/`, `world/collision.ts`, `player/controller.ts`, `camera/orbit.ts`) must not import `three`. `collision.ts`, `controller.ts`, and `orbit.ts` are pure math and run under plain Node in Vitest; `input/keyboard.ts` uses DOM events only and is tested under happy-dom (per-file `@vitest-environment` pragma).
- Map uses only primitive geometry in this phase (free GLTF assets arrive in Phase 5 polish).
- Repo layout: client code under `client/`; the Colyseus server (Phase 2) will live under `server/`.
- Run all `npm` commands inside `client/`.

## File Structure

```
client/
  package.json          — deps & scripts (dev/build/test)
  tsconfig.json         — strict TS config
  index.html            — entry page, fullscreen canvas
  src/
    main.ts             — bootstrap + game loop wiring (Three.js allowed)
    input/keyboard.ts   — key state → InputState (pure, DOM events only)
    world/collision.ts  — CollisionWorld: ground + AABB boxes (pure math)
    player/controller.ts— kinematic character controller (pure math)
    camera/orbit.ts     — orbit camera math: yaw/pitch/zoom (pure math)
    world/map.ts        — park meshes + matching collision boxes (Three.js)
    player/avatar.ts    — capsule avatar mesh (Three.js)
  tests/
    keyboard.test.ts
    collision.test.ts
    controller.test.ts
    orbit.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/index.html`
- Create: `client/src/main.ts`
- Create: `client/.gitignore`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a building Vite + TypeScript + Three.js project; `npm run dev`, `npm run build`, `npm test` scripts that later tasks rely on.

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "hangout-world-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "^0.169.0"
  },
  "devDependencies": {
    "@types/three": "^0.169.0",
    "happy-dom": "^15.11.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Hangout World</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `client/src/main.ts` (scaffold smoke scene — replaced in Task 7)**

```ts
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1, 4);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial()
);
scene.add(cube);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
});
```

- [ ] **Step 5: Create `client/.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 6: Install and verify the build**

Run (from `client/`): `npm install && npm run build`
Expected: `tsc` passes with no errors, Vite reports `✓ built` and creates `client/dist/`.

- [ ] **Step 7: Commit**

```bash
git add client
git commit -m "feat: scaffold Vite + TypeScript + Three.js client"
```

### Task 2: Keyboard input module

**Files:**
- Create: `client/src/input/keyboard.ts`
- Test: `client/tests/keyboard.test.ts`

**Interfaces:**
- Consumes: DOM `keydown`/`keyup` events only.
- Produces:
  ```ts
  export interface InputState {
    moveX: number;  // -1 (A) .. +1 (D)
    moveZ: number;  // -1 (S) .. +1 (W = forward)
    run: boolean;   // Shift held
    jump: boolean;  // Space held
  }
  export class KeyboardInput {
    constructor(target?: EventTarget);   // defaults to window
    get state(): InputState;
    dispose(): void;
  }
  ```
  Task 7 reads `KeyboardInput#state` every frame.

- [ ] **Step 1: Write the failing test**

Create `client/tests/keyboard.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { KeyboardInput } from '../src/input/keyboard';

function press(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}
function release(code: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('KeyboardInput', () => {
  it('starts neutral', () => {
    const input = new KeyboardInput();
    expect(input.state).toEqual({ moveX: 0, moveZ: 0, run: false, jump: false });
    input.dispose();
  });

  it('maps WASD to axes', () => {
    const input = new KeyboardInput();
    press('KeyW');
    press('KeyD');
    expect(input.state.moveZ).toBe(1);
    expect(input.state.moveX).toBe(1);
    release('KeyW');
    press('KeyS');
    expect(input.state.moveZ).toBe(-1);
    input.dispose();
  });

  it('opposite keys cancel out', () => {
    const input = new KeyboardInput();
    press('KeyA');
    press('KeyD');
    expect(input.state.moveX).toBe(0);
    input.dispose();
  });

  it('maps Shift to run and Space to jump', () => {
    const input = new KeyboardInput();
    press('ShiftLeft');
    press('Space');
    expect(input.state.run).toBe(true);
    expect(input.state.jump).toBe(true);
    release('Space');
    expect(input.state.jump).toBe(false);
    input.dispose();
  });

  it('stops listening after dispose', () => {
    const input = new KeyboardInput();
    input.dispose();
    press('KeyW');
    expect(input.state.moveZ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `client/`): `npx vitest run tests/keyboard.test.ts`
Expected: FAIL — cannot resolve `../src/input/keyboard`.

- [ ] **Step 3: Write the implementation**

Create `client/src/input/keyboard.ts`:

```ts
export interface InputState {
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
}

export class KeyboardInput {
  private down = new Set<string>();
  private target: EventTarget;
  private onKeyDown = (e: Event) => this.down.add((e as KeyboardEvent).code);
  private onKeyUp = (e: Event) => this.down.delete((e as KeyboardEvent).code);

  constructor(target: EventTarget = window) {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  get state(): InputState {
    const has = (c: string) => this.down.has(c);
    return {
      moveX: (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0),
      moveZ: (has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0),
      run: has('ShiftLeft') || has('ShiftRight'),
      jump: has('Space'),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.down.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/keyboard.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/input/keyboard.ts client/tests/keyboard.test.ts
git commit -m "feat: keyboard input state module"
```

### Task 3: Collision world (ground + AABB boxes)

**Files:**
- Create: `client/src/world/collision.ts`
- Test: `client/tests/collision.test.ts`

**Interfaces:**
- Consumes: nothing (pure math, no imports).
- Produces:
  ```ts
  export interface Box {
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
  }
  export const STEP_HEIGHT = 0.35;   // max ledge the player auto-steps onto
  export class CollisionWorld {
    constructor(boxes: Box[], groundY?: number);          // groundY defaults 0
    supportHeightAt(x: number, z: number, footY: number, radius: number): number;
    resolveHorizontal(x: number, z: number, footY: number, radius: number, height: number): { x: number; z: number };
  }
  ```
  `supportHeightAt` returns the height of the surface the player can stand
  on at (x,z): the highest box top that overlaps the player's footprint
  circle and whose top is at or below `footY + STEP_HEIGHT`; the flat
  ground `groundY` otherwise. `resolveHorizontal` pushes a circle of
  `radius` out of every box that blocks the player's body (boxes whose
  vertical span intersects `(footY + STEP_HEIGHT, footY + height)`),
  along the axis of least penetration. Task 4 (controller) and Task 6
  (map) both use these exact signatures.

- [ ] **Step 1: Write the failing test**

Create `client/tests/collision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CollisionWorld, STEP_HEIGHT, type Box } from '../src/world/collision';

const R = 0.4;   // player radius used in tests
const H = 1.7;   // player height used in tests

const platform: Box = { minX: 2, minY: 0, minZ: -1, maxX: 4, maxY: 0.3, maxZ: 1 };  // steppable
const wall: Box     = { minX: 6, minY: 0, minZ: -2, maxX: 7, maxY: 2.0, maxZ: 2 };  // blocking

describe('supportHeightAt', () => {
  it('returns ground height on open ground', () => {
    const w = new CollisionWorld([platform, wall]);
    expect(w.supportHeightAt(0, 0, 0, R)).toBe(0);
  });

  it('returns platform top when standing over a steppable box', () => {
    const w = new CollisionWorld([platform]);
    expect(w.supportHeightAt(3, 0, 0, R)).toBe(0.3);
  });

  it('counts the box when only the footprint edge overlaps it', () => {
    const w = new CollisionWorld([platform]);
    // player center just left of minX=2, but circle of radius R overlaps
    expect(w.supportHeightAt(2 - R / 2, 0, 0, R)).toBe(0.3);
  });

  it('ignores tops higher than footY + STEP_HEIGHT', () => {
    const w = new CollisionWorld([wall]);
    expect(w.supportHeightAt(6.5, 0, 0, R)).toBe(0);
  });

  it('can stand on a tall box when already at its level', () => {
    const w = new CollisionWorld([wall]);
    expect(w.supportHeightAt(6.5, 0, 2.0, R)).toBe(2.0);
  });
});

describe('resolveHorizontal', () => {
  it('does nothing in open space', () => {
    const w = new CollisionWorld([wall]);
    expect(w.resolveHorizontal(0, 0, 0, R, H)).toEqual({ x: 0, z: 0 });
  });

  it('pushes the player out of a blocking wall along x', () => {
    const w = new CollisionWorld([wall]);
    // player center just inside the wall's -x face
    const out = w.resolveHorizontal(6.1, 0, 0, R, H);
    expect(out.x).toBeCloseTo(6 - R, 5);
    expect(out.z).toBe(0);
  });

  it('does not push out of a steppable platform', () => {
    const w = new CollisionWorld([platform]);
    // platform top (0.3) is below footY + STEP_HEIGHT, so it is a floor, not a wall
    expect(w.resolveHorizontal(3, 0, 0, R, H)).toEqual({ x: 3, z: 0 });
  });

  it('does not collide with boxes entirely above the player', () => {
    const overhead: Box = { minX: -1, minY: 5, minZ: -1, maxX: 1, maxY: 6, maxZ: 1 };
    const w = new CollisionWorld([overhead]);
    expect(w.resolveHorizontal(0, 0, 0, R, H)).toEqual({ x: 0, z: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/collision.test.ts`
Expected: FAIL — cannot resolve `../src/world/collision`.

- [ ] **Step 3: Write the implementation**

Create `client/src/world/collision.ts`:

```ts
export interface Box {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export const STEP_HEIGHT = 0.35;

function circleOverlapsBox(x: number, z: number, radius: number, b: Box): boolean {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

export class CollisionWorld {
  constructor(private boxes: Box[], private groundY = 0) {}

  supportHeightAt(x: number, z: number, footY: number, radius: number): number {
    let support = this.groundY;
    for (const b of this.boxes) {
      if (b.maxY <= footY + STEP_HEIGHT + 1e-6 &&
          b.maxY > support &&
          circleOverlapsBox(x, z, radius, b)) {
        support = b.maxY;
      }
    }
    return support;
  }

  resolveHorizontal(x: number, z: number, footY: number, radius: number, height: number): { x: number; z: number } {
    for (const b of this.boxes) {
      const blocksBody = b.maxY > footY + STEP_HEIGHT && b.minY < footY + height;
      if (!blocksBody || !circleOverlapsBox(x, z, radius, b)) continue;

      // Penetration depth on each axis for the circle's center vs the
      // box expanded by radius; push out along the shallower axis.
      const pushLeft = x - (b.minX - radius);
      const pushRight = (b.maxX + radius) - x;
      const pushBack = z - (b.minZ - radius);
      const pushFront = (b.maxZ + radius) - z;
      const px = Math.min(pushLeft, pushRight);
      const pz = Math.min(pushBack, pushFront);
      if (px <= pz) {
        x = pushLeft <= pushRight ? b.minX - radius : b.maxX + radius;
      } else {
        z = pushBack <= pushFront ? b.minZ - radius : b.maxZ + radius;
      }
    }
    return { x, z };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/collision.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/world/collision.ts client/tests/collision.test.ts
git commit -m "feat: AABB collision world with step-up support"
```

### Task 4: Kinematic character controller

**Files:**
- Create: `client/src/player/controller.ts`
- Test: `client/tests/controller.test.ts`

**Interfaces:**
- Consumes: `CollisionWorld` from Task 3 (`supportHeightAt`, `resolveHorizontal`).
- Produces:
  ```ts
  export interface PlayerState {
    x: number; y: number; z: number;   // y = foot height
    vy: number;                        // vertical velocity
    onGround: boolean;
    heading: number;                   // facing angle (radians), for avatar rotation
  }
  export interface MoveInput {
    dirX: number; dirZ: number;        // world-space move direction, length ≤ 1
    run: boolean;
    jump: boolean;
  }
  export const WALK_SPEED = 4;         // m/s
  export const RUN_SPEED = 8;          // m/s
  export const JUMP_SPEED = 7;         // m/s  (apex ≈ 1.2 m)
  export const GRAVITY = -20;          // m/s²
  export const PLAYER_RADIUS = 0.4;    // m
  export const PLAYER_HEIGHT = 1.7;    // m
  export function createPlayerState(x?: number, y?: number, z?: number): PlayerState;
  export function updatePlayer(s: PlayerState, input: MoveInput, dt: number, world: CollisionWorld): PlayerState;
  ```
  `updatePlayer` is pure: it returns a new state and never mutates `s`.
  Task 7 calls it at a fixed 60 Hz timestep. In Phase 2 the same
  `PlayerState` fields (x, y, z, heading) are what gets sent to the server.

- [ ] **Step 1: Write the failing test**

Create `client/tests/controller.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CollisionWorld, type Box } from '../src/world/collision';
import {
  createPlayerState, updatePlayer,
  WALK_SPEED, RUN_SPEED, JUMP_SPEED, GRAVITY,
  type MoveInput,
} from '../src/player/controller';

const flat = new CollisionWorld([]);
const DT = 1 / 60;
const idle: MoveInput = { dirX: 0, dirZ: 0, run: false, jump: false };

function simulate(world: CollisionWorld, input: MoveInput, steps: number, s = createPlayerState()) {
  for (let i = 0; i < steps; i++) s = updatePlayer(s, input, DT, world);
  return s;
}

describe('walking and running', () => {
  it('walks at WALK_SPEED', () => {
    const s = simulate(flat, { ...idle, dirX: 1 }, 60);   // 1 second
    expect(s.x).toBeCloseTo(WALK_SPEED, 1);
    expect(s.onGround).toBe(true);
  });

  it('runs at RUN_SPEED', () => {
    const s = simulate(flat, { ...idle, dirX: 1, run: true }, 60);
    expect(s.x).toBeCloseTo(RUN_SPEED, 1);
  });

  it('faces the direction of movement', () => {
    // heading = atan2(dirX, dirZ): moving +x must yield π/2 so that
    // avatar.rotation.y = heading turns the (+z-facing) avatar toward +x.
    const s = simulate(flat, { ...idle, dirX: 1, dirZ: 0 }, 5);
    expect(s.heading).toBeCloseTo(Math.atan2(1, 0), 5);
  });

  it('keeps heading when idle', () => {
    let s = simulate(flat, { ...idle, dirX: 1 }, 5);
    const heading = s.heading;
    s = simulate(flat, idle, 5, s);
    expect(s.heading).toBe(heading);
  });
});

describe('jumping and gravity', () => {
  it('jump launches upward and leaves the ground', () => {
    const s = updatePlayer(createPlayerState(), { ...idle, jump: true }, DT, flat);
    expect(s.vy).toBeGreaterThan(0);
    expect(s.onGround).toBe(false);
  });

  it('reaches roughly the analytic apex then lands back at 0', () => {
    let s = updatePlayer(createPlayerState(), { ...idle, jump: true }, DT, flat);
    let apex = 0;
    for (let i = 0; i < 120; i++) {          // 2 s: plenty for a full arc
      s = updatePlayer(s, idle, DT, flat);
      apex = Math.max(apex, s.y);
    }
    const analyticApex = (JUMP_SPEED * JUMP_SPEED) / (2 * -GRAVITY);  // ≈1.225
    expect(apex).toBeGreaterThan(analyticApex * 0.85);
    expect(apex).toBeLessThan(analyticApex * 1.1);
    expect(s.y).toBe(0);
    expect(s.onGround).toBe(true);
  });

  it('cannot jump while airborne', () => {
    let s = updatePlayer(createPlayerState(), { ...idle, jump: true }, DT, flat);
    const vyAfterFirst = s.vy;
    s = updatePlayer(s, { ...idle, jump: true }, DT, flat);
    expect(s.vy).toBeLessThan(vyAfterFirst);   // gravity only; no re-launch
  });
});

describe('interaction with boxes', () => {
  const platform: Box = { minX: 1, minY: 0, minZ: -1, maxX: 3, maxY: 0.3, maxZ: 1 };
  const wall: Box     = { minX: 1, minY: 0, minZ: -1, maxX: 3, maxY: 2.0, maxZ: 1 };

  it('steps up onto a low platform while walking', () => {
    const world = new CollisionWorld([platform]);
    // 30 steps = 0.5 s at WALK_SPEED 4 → x ≈ 2, the platform's center
    const s = simulate(world, { ...idle, dirX: 1 }, 30);
    expect(s.x).toBeCloseTo(2, 1);
    expect(s.y).toBeCloseTo(0.3, 5);
    expect(s.onGround).toBe(true);
  });

  it('is blocked by a tall wall', () => {
    const world = new CollisionWorld([wall]);
    const s = simulate(world, { ...idle, dirX: 1 }, 120);
    expect(s.x).toBeCloseTo(1 - 0.4, 3);       // wall face minus PLAYER_RADIUS
  });

  it('walking off a platform falls to the ground', () => {
    const world = new CollisionWorld([platform]);
    let s = createPlayerState(2, 0.3, 0);      // standing on the platform
    s = simulate(world, { ...idle, dirX: 1 }, 120, s);
    expect(s.x).toBeGreaterThan(3.4);          // walked past the edge
    expect(s.y).toBe(0);
    expect(s.onGround).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/controller.test.ts`
Expected: FAIL — cannot resolve `../src/player/controller`.

- [ ] **Step 3: Write the implementation**

Create `client/src/player/controller.ts`:

```ts
import { CollisionWorld } from '../world/collision';

export interface PlayerState {
  x: number; y: number; z: number;
  vy: number;
  onGround: boolean;
  heading: number;
}

export interface MoveInput {
  dirX: number; dirZ: number;
  run: boolean;
  jump: boolean;
}

export const WALK_SPEED = 4;
export const RUN_SPEED = 8;
export const JUMP_SPEED = 7;
export const GRAVITY = -20;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.7;

export function createPlayerState(x = 0, y = 0, z = 0): PlayerState {
  return { x, y, z, vy: 0, onGround: true, heading: 0 };
}

export function updatePlayer(s: PlayerState, input: MoveInput, dt: number, world: CollisionWorld): PlayerState {
  const next = { ...s };

  // Horizontal move
  const len = Math.hypot(input.dirX, input.dirZ);
  if (len > 1e-6) {
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    const nx = input.dirX / len;
    const nz = input.dirZ / len;
    next.x += nx * speed * dt;
    next.z += nz * speed * dt;
    next.heading = Math.atan2(nx, nz);
  }
  const resolved = world.resolveHorizontal(next.x, next.z, s.y, PLAYER_RADIUS, PLAYER_HEIGHT);
  next.x = resolved.x;
  next.z = resolved.z;

  // Jump (only from the ground)
  if (input.jump && s.onGround) {
    next.vy = JUMP_SPEED;
    next.onGround = false;
  }

  // Gravity + vertical move
  next.vy += GRAVITY * dt;
  next.y += next.vy * dt;

  // Land / snap to the supporting surface (step detection uses the
  // pre-move foot height so we can step up but not teleport up walls).
  const support = world.supportHeightAt(next.x, next.z, s.y, PLAYER_RADIUS);
  if (next.vy <= 0 && next.y <= support) {
    next.y = support;
    next.vy = 0;
    next.onGround = true;
  } else {
    next.onGround = false;
  }

  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/controller.test.ts`
Expected: PASS (10 tests). If the apex test is marginally off, check that
gravity is applied *before* the position update (semi-implicit Euler), not
after.

- [ ] **Step 5: Commit**

```bash
git add client/src/player/controller.ts client/tests/controller.test.ts
git commit -m "feat: kinematic character controller with jump and step-up"
```

### Task 5: Orbit camera math

**Files:**
- Create: `client/src/camera/orbit.ts`
- Test: `client/tests/orbit.test.ts`

**Interfaces:**
- Consumes: nothing (pure math).
- Produces:
  ```ts
  export class OrbitCamera {
    yaw: number;       // radians, 0 = camera behind player looking -z
    pitch: number;     // radians, clamped [MIN_PITCH, MAX_PITCH]
    distance: number;  // clamped [MIN_DIST, MAX_DIST]
    applyDrag(dx: number, dy: number): void;   // mouse-move deltas in px
    applyZoom(deltaY: number): void;           // wheel deltaY
    offset(): { x: number; y: number; z: number };  // camera pos relative to target
    forward(): { x: number; z: number };            // ground-plane view direction, unit length
    right(): { x: number; z: number };              // ground-plane right, unit length
  }
  export const MIN_PITCH = 0.05, MAX_PITCH = 1.2;
  export const MIN_DIST = 2, MAX_DIST = 10;
  ```
  Task 7 computes the world-space move direction as
  `dir = forward() * input.moveZ + right() * input.moveX` and places the
  Three.js camera at `player position + offset()`, looking at the player.

- [ ] **Step 1: Write the failing test**

Create `client/tests/orbit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { OrbitCamera, MIN_PITCH, MAX_PITCH, MIN_DIST, MAX_DIST } from '../src/camera/orbit';

describe('OrbitCamera', () => {
  it('at yaw 0 sits behind the player (+z) and looks toward -z', () => {
    const cam = new OrbitCamera();
    const off = cam.offset();
    expect(off.x).toBeCloseTo(0, 5);
    expect(off.z).toBeGreaterThan(0);
    expect(off.y).toBeGreaterThan(0);
    const fwd = cam.forward();
    expect(fwd.x).toBeCloseTo(0, 5);
    expect(fwd.z).toBeCloseTo(-1, 5);
  });

  it('forward and right are unit length and perpendicular', () => {
    const cam = new OrbitCamera();
    cam.applyDrag(123, 45);
    const f = cam.forward();
    const r = cam.right();
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(1, 5);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1, 5);
    expect(f.x * r.x + f.z * r.z).toBeCloseTo(0, 5);
  });

  it('at yaw 0, right points toward +x', () => {
    const cam = new OrbitCamera();
    const r = cam.right();
    expect(r.x).toBeCloseTo(1, 5);
    expect(r.z).toBeCloseTo(0, 5);
  });

  it('clamps pitch', () => {
    const cam = new OrbitCamera();
    cam.applyDrag(0, 100000);
    expect(cam.pitch).toBe(MAX_PITCH);
    cam.applyDrag(0, -200000);
    expect(cam.pitch).toBe(MIN_PITCH);
  });

  it('clamps zoom distance', () => {
    const cam = new OrbitCamera();
    cam.applyZoom(100000);
    expect(cam.distance).toBe(MAX_DIST);
    cam.applyZoom(-200000);
    expect(cam.distance).toBe(MIN_DIST);
  });

  it('offset length matches distance (ignoring the head-height lift)', () => {
    const cam = new OrbitCamera();
    cam.applyDrag(300, 80);
    const off = cam.offset();
    const len = Math.hypot(off.x, off.y - 1.5, off.z);   // 1.5 = HEAD_OFFSET
    expect(len).toBeCloseTo(cam.distance, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orbit.test.ts`
Expected: FAIL — cannot resolve `../src/camera/orbit`.

- [ ] **Step 3: Write the implementation**

Create `client/src/camera/orbit.ts`:

```ts
export const MIN_PITCH = 0.05;
export const MAX_PITCH = 1.2;
export const MIN_DIST = 2;
export const MAX_DIST = 10;

const DRAG_SENSITIVITY = 0.005;   // radians per px
const ZOOM_SENSITIVITY = 0.002;   // distance units per wheel deltaY
const HEAD_OFFSET = 1.5;          // aim above the feet, at head height

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export class OrbitCamera {
  yaw = 0;
  pitch = 0.4;
  distance = 6;

  applyDrag(dx: number, dy: number): void {
    this.yaw -= dx * DRAG_SENSITIVITY;
    this.pitch = clamp(this.pitch + dy * DRAG_SENSITIVITY, MIN_PITCH, MAX_PITCH);
  }

  applyZoom(deltaY: number): void {
    this.distance = clamp(this.distance + deltaY * ZOOM_SENSITIVITY, MIN_DIST, MAX_DIST);
  }

  offset(): { x: number; y: number; z: number } {
    const horiz = this.distance * Math.cos(this.pitch);
    return {
      x: Math.sin(this.yaw) * horiz,
      y: HEAD_OFFSET + this.distance * Math.sin(this.pitch),
      z: Math.cos(this.yaw) * horiz,
    };
  }

  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  right(): { x: number; z: number } {
    const f = this.forward();
    return { x: -f.z, z: f.x };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orbit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/camera/orbit.ts client/tests/orbit.test.ts
git commit -m "feat: orbit camera math with pitch and zoom clamps"
```

### Task 6: The park map (meshes + collision)

**Files:**
- Create: `client/src/world/map.ts`
- Test: `client/tests/map.test.ts`

**Interfaces:**
- Consumes: `Box`, `CollisionWorld`, `STEP_HEIGHT` from Task 3. Imports `three` (allowed here — this is a rendering module; the test only inspects data, it never renders).
- Produces:
  ```ts
  export const WORLD_HALF = 30;                 // playable area is 60 × 60 m
  export const SPAWN = { x: 0, y: 0, z: 8 };    // spawn point on the plaza edge
  export interface WorldMap {
    group: THREE.Group;          // add to the scene
    collision: CollisionWorld;   // matching physics
  }
  export function buildMap(): WorldMap;
  ```
  Task 7 adds `group` to the scene and passes `collision` to `updatePlayer`.

**Design rule for this task:** every solid visual (platforms, stair steps,
walls, benches) is built by one helper that creates the mesh AND its
collision `Box` from the same numbers, so visuals and physics can never
drift apart. Stairs are stacks of boxes with each step rise ≤ `STEP_HEIGHT`,
so the Task 4 controller climbs them without slope math. Decorative items
(trees) get a trunk-only collision box so players can jump near them freely.

- [ ] **Step 1: Write the failing test**

Create `client/tests/map.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMap, WORLD_HALF, SPAWN } from '../src/world/map';
import { PLAYER_RADIUS } from '../src/player/controller';

describe('buildMap', () => {
  const map = buildMap();

  it('returns a group with children and a collision world', () => {
    expect(map.group.children.length).toBeGreaterThan(5);
    expect(map.collision).toBeDefined();
  });

  it('spawn point is on open ground', () => {
    expect(map.collision.supportHeightAt(SPAWN.x, SPAWN.z, 0, PLAYER_RADIUS)).toBe(0);
    const r = map.collision.resolveHorizontal(SPAWN.x, SPAWN.z, 0, PLAYER_RADIUS, 1.7);
    expect(r).toEqual({ x: SPAWN.x, z: SPAWN.z });
  });

  it('border walls push a player leaning into them back inside', () => {
    // Player center 0.2 m from the wall's inner face → footprint circle
    // (radius 0.4) overlaps the wall and must be pushed back inward.
    const edge = WORLD_HALF - 0.2;
    for (const [x, z] of [[edge, 0], [-edge, 0], [0, edge], [0, -edge]] as const) {
      const r = map.collision.resolveHorizontal(x, z, 0, PLAYER_RADIUS, 1.7);
      expect(Math.abs(r.x)).toBeLessThanOrEqual(WORLD_HALF - PLAYER_RADIUS + 1e-6);
      expect(Math.abs(r.z)).toBeLessThanOrEqual(WORLD_HALF - PLAYER_RADIUS + 1e-6);
    }
  });

  it('has at least one climbable platform reachable by stairs', () => {
    // The stage platform top must be reachable: some support exists at
    // each stair-step height. We just verify a raised support exists.
    let raised = false;
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 0.5) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 0.5) {
        if (map.collision.supportHeightAt(x, z, 5, PLAYER_RADIUS) > 0.5) raised = true;
      }
    }
    expect(raised).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/map.test.ts`
Expected: FAIL — cannot resolve `../src/world/map`.

- [ ] **Step 3: Write the implementation**

Create `client/src/world/map.ts`:

```ts
import * as THREE from 'three';
import { CollisionWorld, STEP_HEIGHT, type Box } from './collision';

export const WORLD_HALF = 30;
export const SPAWN = { x: 0, y: 0, z: 8 };

export interface WorldMap {
  group: THREE.Group;
  collision: CollisionWorld;
}

export function buildMap(): WorldMap {
  const group = new THREE.Group();
  const boxes: Box[] = [];

  const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

  // Solid box: mesh + collision from the same numbers.
  function solid(cx: number, cz: number, w: number, h: number, d: number, color: number, baseY = 0): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(cx, baseY + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    boxes.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minY: baseY, maxY: baseY + h,
      minZ: cz - d / 2, maxZ: cz + d / 2,
    });
  }

  // Stairs along +z: each step rise ≤ STEP_HEIGHT so the controller climbs them.
  function stairs(cx: number, zStart: number, width: number, steps: number, rise: number, run: number, color: number): void {
    for (let i = 0; i < steps; i++) {
      solid(cx, zStart - i * run, width, rise * (i + 1), run, color);
    }
  }

  // --- Ground: grass with a stone plaza circle (visual only, both flat) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    mat(0x67a95c)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40), mat(0xb9b3a8));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;           // avoid z-fighting with the grass
  plaza.receiveShadow = true;
  group.add(plaza);

  // --- Central stage platform (1.5 m high) with stairs on its +z side ---
  // Stage occupies z ∈ [-17, -11]. The stairs descend AWAY from the stage
  // (+z direction): the tallest step (top 1.5 = stage height) sits flush
  // against the stage face at z = -11, the lowest step is nearest the
  // plaza. Steps must never overlap the stage footprint — the stage's
  // tall collision box would push the player off mid-climb.
  solid(0, -14, 10, 1.5, 6, 0x8a6f4d);
  const rise = STEP_HEIGHT - 0.05;   // 0.3 m per step, climbable without jumping
  stairs(0, -7.4, 4, 5, rise, 0.8, 0x9c8258);   // step 5 spans z ∈ [-11.0, -10.2]

  // --- Scattered jump platforms ---
  solid(12, 4, 3, 0.6, 3, 0x7f8c9b);
  solid(15.5, 1, 3, 1.2, 3, 0x7f8c9b);
  solid(-13, -3, 4, 0.9, 4, 0x7f8c9b);

  // --- Benches around the plaza (low, steppable — that's fine) ---
  solid(6, 6, 2.4, 0.5, 0.8, 0x6b4a2f);
  solid(-6, 6, 2.4, 0.5, 0.8, 0x6b4a2f);
  solid(0, 10.5, 2.4, 0.5, 0.8, 0x6b4a2f);

  // --- Trees: cone canopy + trunk; only the trunk collides ---
  const treeSpots: Array<[number, number]> = [
    [-20, 12], [-22, -8], [20, -12], [22, 14], [-10, 20], [14, 18],
  ];
  for (const [tx, tz] of treeSpots) {
    solid(tx, tz, 0.6, 2, 0.6, 0x5b3d26);                       // trunk
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 8), mat(0x3e7d3a));
    canopy.position.set(tx, 4, tz);
    canopy.castShadow = true;
    group.add(canopy);
  }

  // --- Border walls (tall, keep players inside) ---
  const wallH = 4;
  const wallT = 1;
  solid(0, -WORLD_HALF - wallT / 2, WORLD_HALF * 2 + 2, wallH, wallT, 0x9a9a9a);
  solid(0, WORLD_HALF + wallT / 2, WORLD_HALF * 2 + 2, wallH, wallT, 0x9a9a9a);
  solid(-WORLD_HALF - wallT / 2, 0, wallT, wallH, WORLD_HALF * 2 + 2, 0x9a9a9a);
  solid(WORLD_HALF + wallT / 2, 0, wallT, wallH, WORLD_HALF * 2 + 2, 0x9a9a9a);

  // --- Lighting ---
  group.add(new THREE.HemisphereLight(0xbfd9ff, 0x557744, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.mapSize.set(2048, 2048);
  group.add(sun);

  return { group, collision: new CollisionWorld(boxes) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/map.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/world/map.ts client/tests/map.test.ts
git commit -m "feat: park map with plaza, stage, stairs, platforms, and border walls"
```

### Task 7: Avatar mesh + game loop wiring

**Files:**
- Create: `client/src/player/avatar.ts`
- Modify: `client/src/main.ts` (replace the Task 1 smoke scene entirely)

**Interfaces:**
- Consumes:
  - `KeyboardInput` (Task 2), `updatePlayer` / `createPlayerState` / `PLAYER_HEIGHT` / `PLAYER_RADIUS` (Task 4), `OrbitCamera` (Task 5), `buildMap` / `SPAWN` (Task 6).
- Produces:
  ```ts
  // player/avatar.ts
  export function createAvatar(color?: number): THREE.Group;
  ```
  The avatar group's origin is at the FEET (y = 0 at ground level) so
  `group.position.set(state.x, state.y, state.z)` is all Task 7 needs.
  In Phase 2 the same `createAvatar` is reused for remote players.

- [ ] **Step 1: Create `client/src/player/avatar.ts`**

No unit test — pure Three.js construction, verified visually in Step 4.

```ts
import * as THREE from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './controller';

export function createAvatar(color = 0x4f8ef7): THREE.Group {
  const group = new THREE.Group();

  const bodyHeight = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, bodyHeight, 6, 16),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = PLAYER_HEIGHT / 2;   // capsule center → feet at y=0
  body.castShadow = true;
  group.add(body);

  // Nose: shows which way the avatar faces (avatar faces +z at heading 0,
  // matching controller.heading = atan2(dirX, dirZ)).
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  nose.position.set(0, PLAYER_HEIGHT * 0.75, PLAYER_RADIUS + 0.1);
  group.add(nose);

  return group;
}
```

- [ ] **Step 2: Replace `client/src/main.ts` with the game loop**

```ts
import * as THREE from 'three';
import { KeyboardInput } from './input/keyboard';
import { createPlayerState, updatePlayer, type MoveInput } from './player/controller';
import { createAvatar } from './player/avatar';
import { OrbitCamera } from './camera/orbit';
import { buildMap, SPAWN } from './world/map';

// --- Renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- World + player ---
const map = buildMap();
scene.add(map.group);

const avatar = createAvatar();
scene.add(avatar);

const input = new KeyboardInput();
const orbit = new OrbitCamera();
let player = createPlayerState(SPAWN.x, SPAWN.y, SPAWN.z);

// --- Mouse: drag to orbit, wheel to zoom ---
let dragging = false;
renderer.domElement.addEventListener('mousedown', () => { dragging = true; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (dragging) orbit.applyDrag(e.movementX, e.movementY);
});
window.addEventListener('wheel', (e) => orbit.applyZoom(e.deltaY), { passive: true });

// --- Fixed-timestep loop: logic at 60 Hz, render every animation frame ---
const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  accumulator += Math.min((now - last) / 1000, 0.25);  // clamp after tab-away
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
    accumulator -= STEP;
  }

  avatar.position.set(player.x, player.y, player.z);
  avatar.rotation.y = player.heading;

  const off = orbit.offset();
  camera.position.set(player.x + off.x, player.y + off.y, player.z + off.z);
  camera.lookAt(player.x, player.y + 1.5, player.z);

  renderer.render(scene, camera);
});
```

- [ ] **Step 3: Typecheck, test, and build**

Run (from `client/`): `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 4: Manual test checklist**

Run: `npm run dev`, open the printed URL in a browser, verify each item:

- [ ] Park loads: grass, stone plaza, stage with stairs, platforms, benches, trees, sky, shadows.
- [ ] WASD walks; avatar visibly turns to face the movement direction.
- [ ] Movement is camera-relative: after orbiting 180°, W still moves away from the camera.
- [ ] Shift makes it noticeably faster.
- [ ] Space jumps roughly 1.2 m; no double-jump in midair.
- [ ] Walking up the stairs reaches the stage top; walking off any edge falls to the ground.
- [ ] Low platforms/benches can be stepped or jumped onto; the 1.2 m platform needs a jump.
- [ ] Cannot walk through walls, the stage side, or out of the map border.
- [ ] Mouse drag orbits, wheel zooms within limits; camera never goes under the floor.
- [ ] Smooth (~60 fps) with no console errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/player/avatar.ts client/src/main.ts
git commit -m "feat: wire world, avatar, camera, and input into playable single-player scene"
```

---

## Phase 1 exit criteria

- `npm test` green (keyboard, collision, controller, orbit, map suites).
- `npm run build` clean.
- Manual checklist in Task 7 fully verified.

## What comes next (separate plans, written after this phase ships)

- **Phase 2:** Colyseus server in `server/`, join screen, remote players with interpolation, name tags. Reuses `PlayerState` (x, y, z, heading) as the sync payload and `createAvatar` for remote players.
- **Phase 3:** text chat panel + bubbles. **Phase 4:** LiveKit proximity voice. **Phase 5:** character models/animations + deploy.

