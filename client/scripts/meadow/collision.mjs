// Derives the collision manifest (heightfield grid + AABB boxes) consumed by
// client/src/world/collision.ts from the same generator source of truth as
// the GLB (buildMeadow's meshes/extras + scene.mjs's exported helpers).
import { buildMeadow, SPEC, groundHeight, bridgePoint } from './scene.mjs';

const round3 = (n) => Math.round(n * 1000) / 1000;

// SKIP: no collision volume at all.
const SKIP_ROLES = new Set(['flowers', 'river', 'river-detail', 'tree-canopy', 'terrain', 'backdrop']);
// WHOLE-MESH AABB blockers.
const BLOCKER_ROLES = new Set(['fence', 'rock', 'ruin', 'ruin-rubble', 'tree-trunk', 'bridge-parapet', 'bridge-structure']);
// WALKABLE axis-aligned: whole-mesh AABB in X/Z, but forced Y range.
const AXIS_WALKABLE_ROLES = new Set(['ruin-step', 'ruin-crown']);

// The arch voussoirs and the stonework above them share role 'ruin' with the
// (blocking) piers/columns, but must stay open so the arch passage is walkable.
const RULED_RUIN_NAMES = new Set([
  ...Array.from({ length: 9 }, (_, i) => `Ruin arch voussoir ${i + 1}`),
  'Ruin stonework above arch',
]);

function meshAABB(mesh) {
  mesh.geometry.computeBoundingBox();
  const b = mesh.geometry.boundingBox;
  return { minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z };
}

function buildGrid(half) {
  const size = half * 2 + 1;
  const heights = new Array(size * size);
  for (let zi = 0; zi < size; zi++) {
    for (let xi = 0; xi < size; xi++) {
      heights[zi * size + xi] = round3(groundHeight(-half + xi, -half + zi));
    }
  }
  return { min: -half, step: 1, size, heights };
}

function borderWalls(half) {
  const halfThickness = 0.5, height = 3, extend = half + 1;
  return [
    // North (+z) and south (-z) walls span the full extended X range so their
    // ends overlap the east/west walls at the corners.
    { minX: -extend, maxX: extend, minZ: half - halfThickness, maxZ: half + halfThickness, minY: 0, maxY: height },
    { minX: -extend, maxX: extend, minZ: -half - halfThickness, maxZ: -half + halfThickness, minY: 0, maxY: height },
    // East (+x) and west (-x) walls span the full extended Z range likewise.
    { minX: half - halfThickness, maxX: half + halfThickness, minZ: -extend, maxZ: extend, minY: 0, maxY: height },
    { minX: -half - halfThickness, maxX: -half + halfThickness, minZ: -extend, maxZ: extend, minY: 0, maxY: height },
  ];
}

// Splits [min, max] into <=step-wide ranges (a shorter final range if the
// span isn't an exact multiple of step).
function span(min, max, step) {
  const ranges = [];
  for (let v = min; v < max - 1e-9; v += step) ranges.push([v, Math.min(v + step, max)]);
  return ranges;
}

// Rotated (45 deg) walkable surfaces must not use mesh vertices: cells are
// built directly from bridgePoint(v, u) corners so the AABBs hug the actual
// rotated footprint instead of a much larger axis-aligned bound.
function cellsFromCorners(vRanges, uRanges, minY, maxY) {
  const boxes = [];
  for (const [v0, v1] of vRanges) {
    for (const [u0, u1] of uRanges) {
      const corners = [bridgePoint(v0, u0), bridgePoint(v0, u1), bridgePoint(v1, u0), bridgePoint(v1, u1)];
      const xs = corners.map((c) => c[0]);
      const zs = corners.map((c) => c[1]);
      boxes.push({
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minZ: Math.min(...zs), maxZ: Math.max(...zs),
        minY, maxY,
      });
    }
  }
  return boxes;
}

function bridgeDeckBoxes() {
  return cellsFromCorners(span(-3.2, 3.2, 0.5), span(-1.6, 1.6, 0.5), 0.6, 1.0);
}

function bridgeStepBoxes(mesh) {
  const { step, top, route } = mesh.extras;
  const side = route === 'bridge--1' ? -1 : 1;
  const center = side * (6 - 0.8 * (step - 1));
  return cellsFromCorners([[center - 0.4, center + 0.4]], span(-1.6, 1.6, 0.5), 0, top);
}

export function buildCollisionManifest() {
  const half = SPEC.playableHalf;
  const scene = buildMeadow();
  const boxes = [];
  try {
    for (const mesh of scene.meshes) {
      const role = mesh.extras.role;
      if (SKIP_ROLES.has(role) || mesh.extras.visualOnly) continue;
      if (role === 'ruin' && RULED_RUIN_NAMES.has(mesh.name)) continue;
      if (BLOCKER_ROLES.has(role)) { boxes.push(meshAABB(mesh)); continue; }
      if (AXIS_WALKABLE_ROLES.has(role)) {
        const aabb = meshAABB(mesh);
        boxes.push({ ...aabb, minY: 0, maxY: mesh.extras.top });
        continue;
      }
      if (role === 'bridge-deck') { boxes.push(...bridgeDeckBoxes()); continue; }
      if (role === 'bridge-step') { boxes.push(...bridgeStepBoxes(mesh)); continue; }
      throw new Error(`Unhandled collision role "${role}" for mesh "${mesh.name}"`);
    }
  } finally {
    for (const mesh of scene.meshes) mesh.geometry.dispose();
  }
  boxes.push(...borderWalls(half));
  return { half, grid: buildGrid(half), boxes };
}
