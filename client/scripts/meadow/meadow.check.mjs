import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildMeadow, groundHeight, pathDistance, bridgePoint, SPEC } from './scene.mjs';
import { TERRAIN_SAMPLES, TERRAIN_SEGMENTS } from './terrain.mjs';
import { encodeGLB, decodeGLB } from './glb.mjs';
import { validateMeadow } from './validate.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function generate() {
  const scene = buildMeadow();
  try { return encodeGLB(scene); }
  finally { for (const mesh of scene.meshes) mesh.geometry.dispose(); }
}

test('saved standalone GLB meets geometric and technical constraints', async () => {
  const buffer = await readFile(new URL('../../public/models/fantasy-meadow.glb', import.meta.url));
  const report = validateMeadow(buffer);
  assert.ok(report.triangles < 90000);
  assert.equal(report.playableMeters, '240 x 240');
  assert.equal(report.emptyCenterRadiusMeters, 10);
  assert.equal(report.riverWidthMeters, 4);
  assert.equal(report.bridgeDeckMeters, 1);
  assert.equal(report.maxStepRiseMeters, 0.3);
});

test('terrain uses the 160-segment browser budget at expanded world size', () => {
  assert.equal(TERRAIN_SEGMENTS, 160);
  assert.equal(TERRAIN_SAMPLES ** 2, 25921);
  const scene = buildMeadow();
  try {
    const terrain = scene.meshes.find((mesh) => mesh.extras.role === 'terrain');
    assert.ok(terrain);
    assert.equal(terrain.geometry.getAttribute('position').count / 3, 51200);
  } finally {
    for (const mesh of scene.meshes) mesh.geometry.dispose();
  }
});

test('terrain has visible rolling relief while preserving the spawn plaza', () => {
  assert.equal(groundHeight(0, 8), 0);
  const hillHeights = [[-52, 31], [58, -75], [-62, 68]].map(([x, z]) => groundHeight(x, z));
  assert.ok(Math.max(...hillHeights) > 2.5, `Expected visible hills, got ${hillHeights}`);
  assert.ok(Math.max(...hillHeights) - groundHeight(0, 8) > 2.5);
});

test('backdrop has a layered mountain horizon outside the playable and collision area', () => {
  const scene = buildMeadow();
  try {
    const peaks = scene.meshes.filter((mesh) => /^Backdrop mountain \d+$/.test(mesh.name));
    const foothills = scene.meshes.filter((mesh) => /^Backdrop foothill \d+$/.test(mesh.name));
    assert.equal(peaks.length, 12);
    assert.equal(foothills.length, 18);
    for (const mesh of [...peaks, ...foothills]) {
      assert.equal(mesh.extras.role, 'backdrop');
      assert.equal(mesh.extras.visualOnly, true);
      mesh.geometry.computeBoundingSphere();
      assert.ok(Math.hypot(mesh.geometry.boundingSphere.center.x, mesh.geometry.boundingSphere.center.z) > 100);
    }
  } finally {
    for (const mesh of scene.meshes) mesh.geometry.dispose();
  }
});

test('paths reach the expanded edges and the relocated bridge', () => {
  for (const [x, z] of [[-120, 7], [5, -120], [110, 110], [120, -5], [30, 30]]) {
    assert.ok(pathDistance(x, z) < 0.01, `Missing path at ${x}, ${z}`);
  }
});

test('validator rejects old terrain dimensions instead of trusting metadata', () => {
  const scene = buildMeadow();
  try {
    const terrain = scene.meshes.find((mesh) => mesh.extras.role === 'terrain');
    terrain.geometry.scale(0.99, 1, 0.99);
    assert.throws(() => validateMeadow(encodeGLB(scene)), /Ground min/);
  } finally { for (const mesh of scene.meshes) mesh.geometry.dispose(); }
});

test('generator is reproducible and saved deliverable is current', async () => {
  const generated = generate();
  const saved = await readFile(new URL('../../public/models/fantasy-meadow.glb', import.meta.url));
  const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
  assert.equal(hash(generated), hash(saved));
  assert.equal(hash(generate()), hash(saved));
});

test('center terrain stays at zero over the entire 10m disk', () => {
  for (let x = -10; x <= 10; x += 0.25) {
    for (let z = -10; z <= 10; z += 0.25) {
      if (Math.hypot(x, z) <= 10) assert.equal(Math.abs(groundHeight(x, z)), 0);
    }
  }
});

test('saved asset loads through the game engine GLTFLoader', async () => {
  const bytes = await readFile(new URL('../../public/models/fantasy-meadow.glb', import.meta.url));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  assert.equal(gltf.animations.length, 0);
  let triangles = 0;
  gltf.scene.traverse((object) => {
    assert.ok(!object.isLight);
    if (!object.isMesh) return;
    assert.equal(object.material.transparent, false);
    assert.equal(object.material.vertexColors, true);
    triangles += object.geometry.attributes.position.count / 3;
    object.geometry.dispose();
    object.material.dispose();
  });
  assert.equal(triangles, validateMeadow(bytes).triangles);
});

test('validator rejects an object inserted into the central clearing', () => {
  const scene = buildMeadow();
  try {
    const rock = scene.meshes.find((mesh) => mesh.extras.role === 'rock');
    rock.geometry.computeBoundingBox();
    const bounds = rock.geometry.boundingBox;
    rock.geometry.translate(-(bounds.min.x + bounds.max.x) / 2, 0, -(bounds.min.z + bounds.max.z) / 2);
    assert.throws(() => validateMeadow(encodeGLB(scene)), /empty center/);
  } finally { for (const mesh of scene.meshes) mesh.geometry.dispose(); }
});

test('validator rejects broken step height and transparency', () => {
  const scene = buildMeadow();
  try {
    const step = scene.meshes.find((mesh) => mesh.extras.role === 'ruin-step');
    step.geometry.scale(1, 2, 1);
    assert.throws(() => validateMeadow(encodeGLB(scene)), /step rise/);
  } finally { for (const mesh of scene.meshes) mesh.geometry.dispose(); }
  const buffer = generate();
  const { json } = decodeGLB(buffer);
  assert.equal(json.materials[0].alphaMode, 'OPAQUE');
  const altered = Buffer.from(buffer);
  const offset = altered.indexOf(Buffer.from('OPAQUE'));
  altered.write('BLEND ', offset);
  assert.throws(() => validateMeadow(altered), /OPAQUE/);
});

async function loadManifest() {
  const raw = await readFile(new URL('../../src/world/meadow-collision.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('collision manifest: grid matches terrain samples, spawn is flat, and heights stay bounded', async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.grid.heights.length, TERRAIN_SAMPLES ** 2);
  const { min, step, size, heights } = manifest.grid;
  assert.equal(size, TERRAIN_SAMPLES);
  assert.ok(Math.abs(step - (SPEC.playableHalf * 2) / TERRAIN_SEGMENTS) < 1e-9);
  const centerIndex = ((0 - min) / step) * size + (0 - min) / step;
  assert.equal(Math.abs(heights[centerIndex]), 0);
  for (const h of heights) assert.ok(Math.abs(h) <= 4.5, `height out of range: ${h}`);
});

test('terrain stays within the 12-degree traversal slope target', () => {
  const step = 0.25;
  let maximumSlope = 0;
  for (let z = -SPEC.playableHalf; z < SPEC.playableHalf; z += step) {
    for (let x = -SPEC.playableHalf; x < SPEC.playableHalf; x += step) {
      const height = groundHeight(x, z);
      const dx = (groundHeight(x + step, z) - height) / step;
      const dz = (groundHeight(x, z + step) - height) / step;
      maximumSlope = Math.max(maximumSlope, Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI);
    }
  }
  assert.ok(maximumSlope <= 12, `terrain slope exceeds 12 degrees: ${maximumSlope}`);
});

test('collision manifest: boxes stay inside the expanded edge walls', async () => {
  const manifest = await loadManifest();
  const LIMIT = SPEC.playableHalf + 1 + 1e-6;
  for (const b of manifest.boxes) {
    assert.ok(Math.abs(b.minX) <= LIMIT && Math.abs(b.maxX) <= LIMIT, `box exceeds +/-81 in X: ${JSON.stringify(b)}`);
    assert.ok(Math.abs(b.minZ) <= LIMIT && Math.abs(b.maxZ) <= LIMIT, `box exceeds +/-81 in Z: ${JSON.stringify(b)}`);
  }
  const isWallOnAxis = (b, axis) => Math.abs((b[`max${axis}`] - b[`min${axis}`]) - 1) < 1e-6
    && Math.abs(b.maxY - b.minY - 3) < 1e-6;
  const findWall = (axis, center) => manifest.boxes.find((b) => isWallOnAxis(b, axis)
    && Math.abs((b[`min${axis}`] + b[`max${axis}`]) / 2 - center) < 1e-6);
  const north = findWall('Z', SPEC.playableHalf);
  const south = findWall('Z', -SPEC.playableHalf);
  const east = findWall('X', SPEC.playableHalf);
  const west = findWall('X', -SPEC.playableHalf);
  for (const wall of [north, south, east, west]) {
    assert.ok(wall, 'missing border wall');
    assert.equal(wall.minY, 0);
    assert.equal(wall.maxY, 3);
  }
});

test('collision manifest: bridge route is climbable (max 0.3m rise per 0.4m step)', async () => {
  const manifest = await loadManifest();
  const supportAt = (x, z) => {
    let support = groundHeight(x, z);
    for (const b of manifest.boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) support = Math.max(support, b.maxY);
    }
    return support;
  };
  let previous = null;
  for (let v = -7; v <= 7 + 1e-9; v += 0.4) {
    const [x, z] = bridgePoint(v, 0);
    const support = supportAt(x, z);
    if (previous !== null) {
      assert.ok(Math.abs(support - previous) <= 0.3 + 1e-6, `bridge height changes too sharply at v=${v.toFixed(2)}: ${previous} -> ${support}`);
    }
    previous = support;
  }
  const [endX, endZ] = bridgePoint(3.2);
  const [middleX, middleZ] = bridgePoint(0);
  assert.ok(Math.abs(supportAt(endX, endZ) - SPEC.bridgeEndHeight) < 0.05);
  assert.ok(Math.abs(supportAt(middleX, middleZ) - SPEC.bridgeHeight) < 0.01);
});

test('collision manifest: ruin route climbs in 0.3m steps to a crown that touches the last step', async () => {
  const manifest = await loadManifest();
  const scene = buildMeadow();
  try {
    const stepMeshes = scene.meshes.filter((m) => m.extras.role === 'ruin-step').sort((a, b) => a.extras.step - b.extras.step);
    const crownMesh = scene.meshes.find((m) => m.extras.role === 'ruin-crown');
    assert.equal(stepMeshes.length, 12);
    const footprint = (mesh) => {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox;
      return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
    };
    const findBox = (fp) => manifest.boxes.find((b) => Math.abs(b.minX - fp.minX) < 0.01 && Math.abs(b.maxX - fp.maxX) < 0.01
      && Math.abs(b.minZ - fp.minZ) < 0.01 && Math.abs(b.maxZ - fp.maxZ) < 0.01);
    let previousTop = 0;
    let lastBox;
    for (const mesh of stepMeshes) {
      const box = findBox(footprint(mesh));
      assert.ok(box, `missing collision box for ${mesh.name}`);
      assert.equal(box.minY, 0);
      assert.ok(Math.abs((box.maxY - previousTop) - 0.3) < 1e-6, `step rise not 0.3 at ${mesh.name}: ${previousTop} -> ${box.maxY}`);
      previousTop = box.maxY;
      lastBox = box;
    }
    assert.ok(Math.abs(previousTop - 3.6) < 1e-6);
    const crownBox = findBox(footprint(crownMesh));
    assert.ok(crownBox, 'missing collision box for ruin crown');
    const touches = lastBox.minX <= crownBox.maxX + 1e-6 && lastBox.maxX >= crownBox.minX - 1e-6
      && lastBox.minZ <= crownBox.maxZ + 1e-6 && lastBox.maxZ >= crownBox.minZ - 1e-6;
    assert.ok(touches, 'crown does not touch/overlap last step footprint');
  } finally {
    for (const mesh of scene.meshes) mesh.geometry.dispose();
  }
});

test('collision manifest: ruin crown box keeps its elevated bottom (arch passage stays open)', async () => {
  const manifest = await loadManifest();
  const scene = buildMeadow();
  try {
    const crownMesh = scene.meshes.find((m) => m.extras.role === 'ruin-crown');
    crownMesh.geometry.computeBoundingBox();
    const b = crownMesh.geometry.boundingBox;
    const fp = { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
    const crownBox = manifest.boxes.find((box) => Math.abs(box.minX - fp.minX) < 0.01 && Math.abs(box.maxX - fp.maxX) < 0.01
      && Math.abs(box.minZ - fp.minZ) < 0.01 && Math.abs(box.maxZ - fp.maxZ) < 0.01);
    assert.ok(crownBox, 'missing collision box for ruin crown');
    // Guards this regression class: an elevated walkable (real geometry bottom
    // ~3.35) must never be forced down to ground level, which would turn it
    // into a solid pillar blocking the walk-through passage underneath.
    assert.ok(crownBox.minY > 2, `ruin-crown box minY too low, would block the arch passage: ${crownBox.minY}`);
    assert.equal(crownBox.maxY, 3.6);
  } finally {
    for (const mesh of scene.meshes) mesh.geometry.dispose();
  }
});

test('collision manifest: spawn clearing at (0,8) r=1 is free of boxes and flat', async () => {
  const manifest = await loadManifest();
  const cx = 0, cz = 8, radius = 1;
  for (const b of manifest.boxes) {
    const nx = Math.max(b.minX, Math.min(cx, b.maxX));
    const nz = Math.max(b.minZ, Math.min(cz, b.maxZ));
    const dx = cx - nx, dz = cz - nz;
    assert.ok(dx * dx + dz * dz >= radius * radius, `box overlaps spawn circle: ${JSON.stringify(b)}`);
  }
  assert.equal(groundHeight(cx, cz), 0);
});

test('collision manifest: all ten plaza spawn pads are flat and clear', async () => {
  const manifest = await loadManifest();
  assert.equal(SPEC.spawnPoints.length, 10);
  for (const [cx, cz] of SPEC.spawnPoints) {
    for (const b of manifest.boxes) {
      const nx = Math.max(b.minX, Math.min(cx, b.maxX));
      const nz = Math.max(b.minZ, Math.min(cz, b.maxZ));
      assert.ok((cx - nx) ** 2 + (cz - nz) ** 2 >= 1, `box overlaps spawn pad: ${JSON.stringify(b)}`);
    }
    assert.equal(groundHeight(cx, cz), 0);
  }
});
