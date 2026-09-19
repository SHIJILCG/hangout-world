import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { decodeGLB, readAttribute } from './glb.mjs';

const EPS = 0.00002;
const near = (a, b, message) => assert.ok(Math.abs(a - b) < EPS, `${message}: ${a} != ${b}`);

function segmentRadius(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dz) / length));
  return Math.hypot(a[0] + t * dx, a[1] + t * dz);
}

function triangleRadius(points) {
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const signs = points.map((a, i) => cross(a, points[(i + 1) % 3]));
  const area = Math.abs(signs.reduce((a, b) => a + b, 0));
  if (area > EPS && (signs.every((s) => s >= 0) || signs.every((s) => s <= 0))) return 0;
  return Math.min(...points.map((a, i) => segmentRadius(a, points[(i + 1) % 3])));
}

export function validateMeadow(buffer) {
  const document = decodeGLB(buffer);
  const { json, binary } = document;
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.asset.extras.units, 'meters');
  assert.equal(json.asset.extras.upAxis, 'Y');
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].byteLength, binary.length);
  assert.ok(!json.buffers[0].uri, 'GLB must be self-contained');
  assert.equal(json.scenes.length, 1);
  assert.equal(json.scenes[0].extras.playableHalf, 40);
  assert.equal(json.scenes[0].extras.bridgeCenter, 30);
  assert.equal(json.materials.length, 1);
  assert.equal(json.materials[0].alphaMode, 'OPAQUE');
  for (const key of ['animations', 'skins', 'images', 'textures', 'cameras', 'extensions', 'extensionsUsed', 'extensionsRequired']) {
    assert.ok(!json[key]?.length && !Object.keys(json[key] ?? {}).length, `${key} must be absent`);
  }
  for (const view of json.bufferViews) {
    assert.equal(view.byteOffset % 4, 0);
    assert.ok(view.byteOffset + view.byteLength <= binary.length, 'Buffer view out of bounds');
  }
  const nodes = [];
  let triangles = 0, backdropTriangles = 0;
  for (const node of json.nodes) {
    assert.ok(!node.matrix && !node.translation && !node.rotation && !node.scale && !node.extensions,
      'Positions must be baked in world space, with no light extensions');
    const mesh = json.meshes[node.mesh];
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert.equal(primitive.mode, 4);
    assert.equal(primitive.material, 0);
    assert.equal(primitive.indices, undefined);
    const positions = readAttribute(document, primitive.attributes.POSITION);
    const normals = readAttribute(document, primitive.attributes.NORMAL);
    const colors = readAttribute(document, primitive.attributes.COLOR_0);
    assert.equal(positions.length % 9, 0);
    assert.equal(normals.length, positions.length);
    assert.equal(colors.length, positions.length);
    assert.ok(positions.every(Number.isFinite) && normals.every(Number.isFinite), `Non-finite geometry: ${node.name}`);
    assert.ok(colors.every((c) => Number.isFinite(c) && c >= 0 && c <= 1), `Invalid color: ${node.name}`);
    triangles += positions.length / 9;
    if (node.extras.role === 'backdrop') backdropTriangles += positions.length / 9;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positions[i + axis]);
        max[axis] = Math.max(max[axis], positions[i + axis]);
      }
      near(Math.hypot(...normals.slice(i, i + 3)), 1, `Unit normal in ${node.name}`);
      if (node.extras.role !== 'backdrop') {
        assert.ok(Math.abs(positions[i]) <= 40 + EPS && Math.abs(positions[i + 2]) <= 40 + EPS,
          `Playable mesh outside 80m square: ${node.name}`);
      } else {
        assert.equal(node.extras.visualOnly, true);
        assert.ok(Math.hypot(positions[i], positions[i + 2]) <= 200 + EPS, `Backdrop beyond 200m: ${node.name}`);
      }
    }
    for (let i = 0; i < positions.length; i += 9) {
      const points = [0, 3, 6].map((offset) => [positions[i + offset], positions[i + offset + 2]]);
      const distance = triangleRadius(points);
      if (node.extras.role === 'backdrop') {
        assert.ok(distance >= 100 - EPS, `Backdrop nearer than 100m: ${node.name}`);
      } else if (node.extras.role !== 'terrain') {
        assert.ok(distance >= 10 - EPS, `Object intrudes into empty center: ${node.name}`);
      } else if (distance <= 10 + EPS) {
        for (const offset of [1, 4, 7]) near(positions[i + offset], 0, 'Central circle must be flat at y=0');
        for (const offset of [0, 3, 6]) {
          assert.ok(colors[i + offset + 1] > colors[i + offset] && colors[i + offset + 1] > colors[i + offset + 2],
            'Central circle must be green meadow, without dirt paths');
        }
      }
      for (let axis = 0; axis < 3; axis++) {
        near(normals[i + axis], normals[i + 3 + axis], 'Flat face normal');
        near(normals[i + axis], normals[i + 6 + axis], 'Flat face normal');
      }
    }
    const accessor = json.accessors[primitive.attributes.POSITION];
    assert.deepEqual(accessor.min, min);
    assert.deepEqual(accessor.max, max);
    nodes.push({ ...node, min, max, positions });
  }
  assert.ok(triangles < 60000, `Triangle budget exceeded: ${triangles}`);
  assert.ok(backdropTriangles < 2000, `Backdrop must remain low detail: ${backdropTriangles}`);
  const terrain = nodes.find((n) => n.extras.role === 'terrain');
  assert.ok(terrain);
  for (const axis of [0, 2]) { near(terrain.min[axis], -40, 'Ground min'); near(terrain.max[axis], 40, 'Ground max'); }
  const river = nodes.find((n) => n.extras.role === 'river');
  assert.ok(river);
  const riverV = [];
  for (let i = 0; i < river.positions.length; i += 3) {
    riverV.push((river.positions[i] + river.positions[i + 2] - 60) / Math.SQRT2);
    near(river.positions[i + 1], -0.16, 'Water below banks');
  }
  near(Math.max(...riverV) - Math.min(...riverV), 4, 'River width');
  near((Math.max(...riverV) + Math.min(...riverV)) / 2, 0, 'River stays in the expanded corner');
  near(river.max[0], 40, 'River reaches east boundary');
  near(river.max[2], 40, 'River reaches south boundary');
  const deck = nodes.find((n) => n.extras.role === 'bridge-deck');
  const crown = nodes.find((n) => n.extras.role === 'ruin-crown');
  assert.ok(deck && crown);
  for (const axis of [0, 2]) near((deck.min[axis] + deck.max[axis]) / 2, 30, 'Bridge center');
  const deckV = [], deckU = [];
  for (let i = 0; i < deck.positions.length; i += 3) {
    deckV.push((deck.positions[i] + deck.positions[i + 2] - 60) / Math.SQRT2);
    deckU.push((deck.positions[i] - deck.positions[i + 2]) / Math.SQRT2);
  }
  near(Math.max(...deckV) - Math.min(...deckV), 6.4, 'Unscaled bridge deck length');
  near(Math.max(...deckU) - Math.min(...deckU), 3.2, 'Unscaled bridge deck width');
  near(deck.max[1], 1, 'Bridge deck height');
  near(crown.max[1], 3.6, 'Ruin crown height');

  function route(name, count, rise, target) {
    const steps = nodes.filter((n) => n.extras.route === name).sort((a, b) => a.extras.step - b.extras.step);
    assert.equal(steps.length, count);
    let previous = 0;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      near(step.min[1], 0, 'Steps start on bank/ground');
      near(step.max[1] - previous, rise, 'Measured step rise');
      assert.ok(step.max[1] - previous <= 0.3 + EPS);
      assert.equal(step.extras.walkable, true);
      if (name === 'ruin') {
        near(step.max[0] - step.min[0], 1.7, 'Ruin stair width');
        if (i > 0) near(step.max[2], steps[i - 1].min[2], 'Ruin steps connect');
      } else {
        const localV = [];
        const localU = [];
        for (let j = 0; j < step.positions.length; j += 3) {
          localV.push((step.positions[j] + step.positions[j + 2] - 60) / Math.SQRT2);
          localU.push((step.positions[j] - step.positions[j + 2]) / Math.SQRT2);
        }
        const side = name === 'bridge--1' ? -1 : 1;
        const distance = localV.map((v) => v * side);
        near(Math.min(...distance), 5.6 - i * 0.8, 'Bridge stair inner edge');
        near(Math.max(...distance), 6.4 - i * 0.8, 'Bridge stair outer edge');
        near(Math.max(...localU) - Math.min(...localU), 3.2, 'Bridge stair width');
      }
      previous = step.max[1];
    }
    near(previous, target.max[1], 'Route meets destination height');
    if (name === 'ruin') near(steps.at(-1).min[2], target.max[2], 'Ruin steps meet crown');
  }
  route('bridge--1', 4, 0.25, deck);
  route('bridge-1', 4, 0.25, deck);
  route('ruin', 12, 0.3, crown);
  const treeCount = nodes.filter((n) => n.extras.role === 'tree-trunk').length;
  assert.ok(treeCount >= 8 && treeCount <= 10);
  for (const kind of ['white', 'yellow']) assert.ok(nodes.some((n) => n.extras.role === 'flowers' && n.extras.kind === kind));
  for (const role of ['fence', 'rock', 'ruin', 'bridge-structure']) assert.ok(nodes.some((n) => n.extras.role === role));
  return {
    triangles, backdropTriangles, meshes: nodes.length, bytes: buffer.length,
    trees: treeCount, playableMeters: '80 x 80', emptyCenterRadiusMeters: 10,
    riverWidthMeters: 4, bridgeDeckMeters: 1, maxStepRiseMeters: 0.3,
    materials: 1, textures: 0, animations: 0, embeddedLights: 0, transparency: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const buffer = await readFile(new URL('../../public/models/fantasy-meadow.glb', import.meta.url));
  console.log(JSON.stringify(validateMeadow(buffer), null, 2));
}
