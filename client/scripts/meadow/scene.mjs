import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SPEC = Object.freeze({
  seed: 728194,
  playableHalf: 40,
  emptyRadius: 10,
  riverWidth: 4,
  bridgeCenter: 30,
  bridgeHeight: 1,
  bridgeRise: 0.25,
  ruinRise: 0.3,
  maxTriangles: 60000,
});

const palette = {
  grass: ['#79b94e', '#7bbb50', '#7ebd51', '#76b54b', '#81bf53'],
  dirt: ['#cda46d', '#d5ae78', '#c39b65'],
  stone: ['#929b92', '#aab1a3', '#bac0ae', '#828f89'],
  leaf: ['#518e42', '#66a347', '#78b54c', '#99c659'],
};
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
export const riverV = (x, z) => (x + z - 2 * SPEC.bridgeCenter) / Math.SQRT2;
export const bridgePoint = (v, u = 0) => [
  SPEC.bridgeCenter + (v + u) / Math.SQRT2,
  SPEC.bridgeCenter + (v - u) / Math.SQRT2,
];

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const hills = (0.35 + 0.28 * Math.sin(x * 0.18) * Math.cos(z * 0.2)
    + 0.18 * Math.sin(z * 0.29 + x * 0.1)) * smooth((r - 11.5) / 7);
  const ruinFlat = 1 - smooth(Math.max((Math.abs(x + 18) - 5.5) / 2, (Math.abs(z + 11) - 9) / 2));
  const cornerFlat = 1 - smooth((Math.abs(riverV(x, z)) - 7) / 3);
  const base = hills * (1 - Math.max(ruinFlat, cornerFlat));
  const bank = smooth((Math.abs(riverV(x, z)) - 2) / 1.3);
  return base * bank - 0.8 * (1 - bank);
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

const pathCurves = [
  [[-SPEC.playableHalf, 7], [-35, 6], [-30, 4], [-23, 3], [-16, 6], [-12, 9]],
  [[-9, -12], [-8, -21], [-3, -26], [3, -30], [7, -35], [5, -SPEC.playableHalf]],
  [[9, 12], [13, 13], [23, 23], bridgePoint(0), [35, 35], [38, SPEC.playableHalf]],
  [[13, -3], [21, -6], [26, -4], [30, -7], [35, -8], [SPEC.playableHalf, -5]],
].map((points) => new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)))
  .getPoints(90).map((p) => [p.x, p.z]));

export function pathDistance(x, z) {
  let distance = Math.abs(Math.hypot(x, z) - (13 + 0.5 * Math.sin(Math.atan2(z, x) * 3)));
  for (const points of pathCurves) {
    for (let i = 1; i < points.length; i++) {
      distance = Math.min(distance, segmentDistance(x, z, points[i - 1], points[i]));
    }
  }
  return distance;
}

export function buildMeadow() {
  const random = randomSource(SPEC.seed);
  const half = SPEC.playableHalf;
  const meshes = [];
  const choose = (colors) => colors[Math.floor(random() * colors.length)];

  function add(name, geometry, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = 0, extras = {}) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    flat.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(...scale),
    ));
    flat.deleteAttribute('normal');
    flat.computeVertexNormals();
    if (!flat.getAttribute('color')) {
      const colors = [];
      const base = new THREE.Color(color);
      for (let i = 0; i < flat.getAttribute('position').count; i += 3) {
        const shade = 0.94 + random() * 0.12;
        for (let j = 0; j < 3; j++) colors.push(Math.min(1, base.r * shade), Math.min(1, base.g * shade), Math.min(1, base.b * shade));
      }
      flat.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    meshes.push({ name, geometry: flat, extras });
    return meshes.at(-1);
  }

  function box(name, x, z, w, h, d, color, bottom = groundHeight(x, z), rotation = 0, extras = {}) {
    return add(name, new THREE.BoxGeometry(w, h, d), color, [x, bottom + h / 2, z], [1, 1, 1], rotation, extras);
  }

  const terrainPositions = [], terrainColors = [];
  for (let z = -half; z < half; z++) {
    for (let x = -half; x < half; x++) {
      const corners = [[x, z], [x, z + 1], [x + 1, z + 1], [x + 1, z]];
      const triangles = (x + z) % 2 ? [[0, 1, 3], [1, 2, 3]] : [[0, 1, 2], [0, 2, 3]];
      for (const triangle of triangles) {
        const cx = triangle.reduce((sum, i) => sum + corners[i][0], 0) / 3;
        const cz = triangle.reduce((sum, i) => sum + corners[i][1], 0) / 3;
        const inRiver = Math.abs(riverV(cx, cz)) < 3;
        const color = new THREE.Color(inRiver ? '#abac75' : choose(pathDistance(cx, cz) < 1.05 ? palette.dirt : palette.grass));
        for (const i of triangle) {
          const [px, pz] = corners[i];
          terrainPositions.push(px, groundHeight(px, pz), pz);
          terrainColors.push(color.r, color.g, color.b);
        }
      }
    }
  }
  const terrain = new THREE.BufferGeometry();
  terrain.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3));
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  add(`Meadow terrain - ${half * 2}m square`, terrain, '#ffffff', undefined, undefined, 0, { role: 'terrain', walkable: true });

  // Clip the diagonal river strip to the playable square rather than extending water beyond it.
  let river = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (const sign of [-1, 1]) {
    const clipped = [];
    for (let i = 0; i < river.length; i++) {
      const a = river[i], b = river[(i + 1) % river.length];
      const da = sign * riverV(...a) - 2, db = sign * riverV(...b) - 2;
      if (da <= 0) clipped.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const t = da / (da - db);
        clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    river = clipped;
  }
  const waterPositions = [];
  for (let i = 1; i < river.length - 1; i++) {
    for (const p of [river[0], river[i + 1], river[i]]) waterPositions.push(p[0], -0.16, p[1]);
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
  add('River - opaque turquoise', water, '#369faa', undefined, undefined, 0, { role: 'river', width: 4 });
  for (let i = 0; i < 26; i++) {
    const u = -10 + random() * 20, v = -1.7 + random() * 3.4;
    if (Math.abs(u) < 2) continue;
    const [x, z] = bridgePoint(v, u);
    box(`River ripple ${i}`, x, z, 0.06, 0.006, 0.3 + random() * 0.8, '#74c6bf', -0.152, -Math.PI / 4, { role: 'river-detail' });
  }

  const bridgeRotation = -Math.PI / 4;
  box('Bridge deck', SPEC.bridgeCenter, SPEC.bridgeCenter, 6.4, 0.22, 3.2, '#b6b8a2', 0.78, bridgeRotation,
    { role: 'bridge-deck', walkable: true, top: 1 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const top = (i + 1) * 0.25;
      const [x, z] = bridgePoint(side * (6 - i * 0.8));
      box(`Bridge ${side < 0 ? 'west' : 'east'} step ${i + 1}`, x, z, 0.8, top, 3.2,
        choose(palette.stone), 0, bridgeRotation,
        { role: 'bridge-step', route: `bridge-${side}`, step: i + 1, top, rise: 0.25, run: 0.8, walkable: true });
    }
    const sideShape = new THREE.Shape();
    sideShape.moveTo(-3.2, -0.65);
    sideShape.lineTo(-3.2, 0.8);
    sideShape.lineTo(3.2, 0.8);
    sideShape.lineTo(3.2, -0.65);
    sideShape.lineTo(2.7, -0.65);
    for (let i = 0; i <= 12; i++) {
      const a = i * Math.PI / 12;
      sideShape.lineTo(2.7 * Math.cos(a), -0.55 + 1.18 * Math.sin(a));
    }
    sideShape.lineTo(-3.2, -0.65);
    const [sx, sz] = bridgePoint(0, side * 1.32);
    add(`Bridge arched stone wall ${side}`, new THREE.ExtrudeGeometry(sideShape, { depth: 0.3, bevelEnabled: false }),
      '#969f93', [sx, 0, sz], [1, 1, 1], bridgeRotation, { role: 'bridge-structure' });
    for (let i = 0; i < 8; i++) {
      const [x, z] = bridgePoint(-2.8 + i * 0.8, side * 1.42);
      box(`Bridge parapet ${side} ${i}`, x, z, 0.77, 0.5, 0.32,
        choose(palette.stone), 1, bridgeRotation, { role: 'bridge-parapet' });
    }
  }

  const archX = -18, archZ = -16;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      box(`Ruin pier ${side} ${i}`, archX + side * 1.8, archZ, 0.6, 0.3125, 1.3,
        choose(palette.stone), i * 0.3125, 0, { role: 'ruin' });
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = i * Math.PI / 9 + 0.008, b = (i + 1) * Math.PI / 9 - 0.008;
    const shape = new THREE.Shape();
    shape.moveTo(1.5 * Math.cos(a), 1.25 + 1.5 * Math.sin(a));
    shape.lineTo(2.1 * Math.cos(a), 1.25 + 2.1 * Math.sin(a));
    shape.lineTo(2.1 * Math.cos(b), 1.25 + 2.1 * Math.sin(b));
    shape.lineTo(1.5 * Math.cos(b), 1.25 + 1.5 * Math.sin(b));
    shape.closePath();
    add(`Ruin arch voussoir ${i + 1}`, new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: false }),
      choose(palette.stone), [archX, 0, archZ - 0.65], undefined, 0, { role: 'ruin' });
  }
  const spandrel = new THREE.Shape();
  spandrel.moveTo(2.1, 1.25);
  spandrel.lineTo(2.1, 3.35);
  spandrel.lineTo(-2.1, 3.35);
  for (let i = 9; i >= 0; i--) {
    const angle = i * Math.PI / 9;
    spandrel.lineTo(2.1 * Math.cos(angle), 1.25 + 2.1 * Math.sin(angle));
  }
  spandrel.closePath();
  add('Ruin stonework above arch', new THREE.ExtrudeGeometry(spandrel, { depth: 1.24, bevelEnabled: false }),
    '#9da691', [archX, 0, archZ - 0.62], undefined, 0, { role: 'ruin' });
  box('Ruin climbable crown', archX, archZ, 5.5, 0.25, 2.15, '#bdc1ad', 3.35, 0,
    { role: 'ruin-crown', walkable: true, top: 3.6 });
  for (let i = 0; i < 12; i++) {
    const top = (i + 1) * 0.3;
    const blocks = [];
    for (let layer = 0; layer <= i; layer++) {
      const width = layer === i ? 1.7 : 1.5 + random() * 0.2;
      const gap = layer === 0 ? 0 : 0.012;
      blocks.push(new THREE.BoxGeometry(width, 0.3 - gap, 0.85)
        .translate(0, layer * 0.3 + (0.3 + gap) / 2, 0));
    }
    const pile = mergeGeometries(blocks);
    for (const block of blocks) block.dispose();
    if (!pile) throw new Error('Could not merge ruin blocks');
    add(`Ruin fallen block step ${i + 1}`, pile, choose(palette.stone), [-20.1, 0, -5.15 - i * 0.85], undefined, 0,
      { role: 'ruin-step', route: 'ruin', step: i + 1, top, rise: 0.3, run: 0.85, walkable: true });
  }
  for (let i = 0; i < 9; i++) {
    const x = -22.2 - random() * 1.3, z = -7 - random() * 10;
    box(`Ruin scattered rubble ${i}`, x, z, 0.5 + random() * 0.5, 0.2 + random() * 0.4, 0.5 + random() * 0.4,
      choose(palette.stone), groundHeight(x, z), random() * 3, { role: 'ruin-rubble' });
  }
  for (const [x, z, height] of [[-14, -19, 1.2], [-23, -19, 1.8], [-13.5, -15.5, 0.6]]) {
    box(`Broken column footing ${x}`, x, z, 1.4, 0.25, 1.4, '#9da691', 0, 0, { role: 'ruin' });
    add(`Broken column ${x}`, new THREE.CylinderGeometry(0.45, 0.55, height, 7, 1), '#b6bca8',
      [x, height / 2 + 0.25, z], undefined, 0, { role: 'ruin' });
  }

  const trees = [[-34, 18], [-29, -34], [-8, -25], [17, -34], [35, -17], [32, 4], [9, 35], [-12, 33], [-33, -5], [-23, 25]];
  for (let i = 0; i < trees.length; i++) {
    const [x, z] = trees[i], y = groundHeight(x, z), height = 4.5 + random() * 1.5;
    add(`Tree ${i + 1} trunk`, new THREE.CylinderGeometry(0.22, 0.38, height * 0.62, 5), '#795539',
      [x, y + height * 0.31, z], undefined, 0, { role: 'tree-trunk', tree: i + 1 });
    if (i % 3 === 0) {
      for (let j = 0; j < 3; j++) {
        add(`Tree ${i + 1} conifer tier ${j}`, new THREE.ConeGeometry(2 - j * 0.42, 2.4, 7),
          choose(palette.leaf), [x, y + 2.5 + j * 1.05, z], undefined, i, { role: 'tree-canopy', tree: i + 1 });
      }
    } else {
      add(`Tree ${i + 1} faceted crown`, new THREE.IcosahedronGeometry(1, 1),
        choose(palette.leaf), [x, y + height * 0.78, z], [2.4, 2.1, 2.15], i, { role: 'tree-canopy', tree: i + 1 });
      add(`Tree ${i + 1} crown lobe`, new THREE.IcosahedronGeometry(1, 0),
        choose(palette.leaf), [x + 1.2, y + height * 0.69, z + 0.5], [1.55, 1.55, 1.5], i, { role: 'tree-canopy', tree: i + 1 });
    }
  }

  function fence(points, label) {
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i], base = groundHeight(x, z);
      box(`Fence ${label} post ${i}`, x, z, 0.18, 1.05, 0.18, '#795434', base, 0, { role: 'fence' });
      if (i === 0) continue;
      const [px, pz] = points[i - 1], previousY = groundHeight(px, pz);
      for (const h of [0.4, 0.8]) {
        const start = new THREE.Vector3(px, previousY + h, pz), end = new THREE.Vector3(x, base + h, z);
        const direction = end.clone().sub(start);
        const geometry = new THREE.BoxGeometry(direction.length(), 0.13, 0.11);
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize()));
        add(`Fence ${label} rail ${i} ${h}`, geometry, '#a07948', start.add(end).multiplyScalar(0.5).toArray(),
          undefined, 0, { role: 'fence' });
      }
    }
  }
  fence([[-28, 6.6], [-25.5, 6], [-23, 6], [-20.5, 6.5]], 'west path');
  fence([[18, -8.7], [20.5, -8.9], [23, -8.2], [25.5, -6.9]], 'east path');
  fence([[-6.4, -19], [-5.5, -21.5], [-4, -23.5]], 'north path');

  const rocks = [
    [-26, 9], [-24, 10], [18, -15], [20, -16], [-5, 19], [-3, 20], [10, -20], [28, -2], [-27, -15], [6, 22],
    [-35, -23], [-30, 30], [24, -33], [3, 35],
  ];
  rocks.forEach(([x, z], i) => {
    add(`Low meadow rock ${i + 1}`, new THREE.IcosahedronGeometry(1, 0), choose(palette.stone),
      [x, groundHeight(x, z) + 0.2, z], [0.7 + random() * 0.6, 0.4 + random() * 0.3, 0.7 + random() * 0.4],
      random() * 6, { role: 'rock' });
  });

  const flowerGeometries = { white: [], yellow: [], stems: [] };
  function flowerPart(bucket, geometry, position, rotation = 0) {
    geometry.rotateY(rotation);
    geometry.translate(...position);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flowerGeometries[bucket].push(...flat.getAttribute('position').array);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  const patches = [
    [-16, 12], [-11, 20], [0, 23], [12, -18], [19, 7], [-5, -19], [-26, -10], [4, -25], [-24, 19], [12, 6],
    [-34, -15], [-29, 32], [21, -33], [2, 34],
  ];
  for (const [px, pz] of patches) {
    for (let i = 0; i < 40; i++) {
      const x = px + (random() - 0.5) * 5, z = pz + (random() - 0.5) * 4;
      if (Math.hypot(x, z) < 11 || pathDistance(x, z) < 1.7 || Math.abs(riverV(x, z)) < 7) continue;
      const y = groundHeight(x, z), h = 0.16 + random() * 0.18;
      flowerPart('stems', new THREE.CylinderGeometry(0.018, 0.018, h, 3), [x, y + h / 2, z]);
      const kind = random() > 0.42 ? 'white' : 'yellow';
      flowerPart(kind, new THREE.CylinderGeometry(0.09, 0.055, 0.045, 5), [x, y + h, z], random() * 6);
      if (kind === 'white') flowerPart('yellow', new THREE.CylinderGeometry(0.033, 0.033, 0.012, 5), [x, y + h + 0.029, z]);
    }
  }
  for (const [kind, vertices] of Object.entries(flowerGeometries)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    add(`Wildflower patches ${kind}`, geometry, { white: '#fff5da', yellow: '#f7cd48', stems: '#548b39' }[kind],
      undefined, undefined, 0, { role: 'flowers', kind });
  }

  // Separate visual-only islands keep every backdrop vertex 100–200 m from the origin.
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    const radius = 151 + random() * 9, height = 25 + random() * 22, width = 15 + random() * 8;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    // Split mountain sides at a shared snowline, retaining angular, low-detail ridges.
    const snowHeight = height * 0.3, lowerHeight = height - snowHeight;
    add(`Backdrop mountain ${i + 1}`, new THREE.CylinderGeometry(width * 0.3, width, lowerHeight, 7),
      i % 2 ? '#678f89' : '#759893', [x, lowerHeight / 2 - 2, z], undefined, angle,
      { role: 'backdrop', visualOnly: true });
    add(`Backdrop snowcap ${i + 1}`, new THREE.ConeGeometry(width * 0.3, snowHeight, 7),
      '#e3eee4', [x, lowerHeight + snowHeight / 2 - 2, z], undefined, angle,
      { role: 'backdrop', visualOnly: true });
  }
  add('Backdrop castle plateau', new THREE.CylinderGeometry(15, 21, 16, 7), '#81a477',
    [-80, 6, -105], undefined, 0, { role: 'backdrop', visualOnly: true });
  box('Backdrop castle keep', -80, -105, 10, 10, 7, '#d4d8bc', 14, 0, { role: 'backdrop', visualOnly: true });
  for (const [dx, dz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) {
    add(`Backdrop castle tower ${dx} ${dz}`, new THREE.CylinderGeometry(1.8, 2, 14, 6), '#e0e1c8',
      [-80 + dx, 21, -105 + dz], undefined, 0, { role: 'backdrop', visualOnly: true });
    add(`Backdrop castle roof ${dx} ${dz}`, new THREE.ConeGeometry(2.5, 5, 6), '#638a91',
      [-80 + dx, 30.5, -105 + dz], undefined, 0, { role: 'backdrop', visualOnly: true });
  }
  for (let i = 0; i < 6; i++) {
    box(`Backdrop castle merlon ${i}`, -84.5 + i * 1.8, -101.5, 0.9, 1, 0.9, '#e4e2c9', 24, 0,
      { role: 'backdrop', visualOnly: true });
  }
  add('Backdrop lake shore', new THREE.CylinderGeometry(1, 1, 0.5, 13), '#8ba982',
    [91, -1.1, -83], [24, 1, 13], 0.2, { role: 'backdrop', visualOnly: true });
  add('Backdrop blue lake', new THREE.CircleGeometry(1, 13).rotateX(-Math.PI / 2), '#529fa9',
    [91, -0.8, -83], [22, 1, 11], 0.2, { role: 'backdrop', visualOnly: true });

  return { meshes, spec: SPEC };
}
