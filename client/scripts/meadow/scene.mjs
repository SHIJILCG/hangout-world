import { vehicleRoutes, vehicleRouteDistance } from '../../../shared/vehicleRoutes.mjs';
import world from '../../../shared/world.json' with { type: 'json' };
import { forestAt } from './biomes.mjs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight, TERRAIN_SEGMENTS } from './terrain.mjs';
export { groundHeight };

export const SPEC = Object.freeze({
  seed: 728194,
  playableHalf: world.half,
  emptyRadius: 10,
  spawnPoints: world.spawnPoints.map(p=>[p.x,p.z]),
  zones: ['village', 'park', 'activity-meadow', 'stable', 'ruins', 'forest', 'countryside'],
  riverWidth: 4,
  bridgeCenter: 30,
  bridgeHeight: 1,
  bridgeEndHeight: 1,
  bridgeRise: 0.25,
  ruinRise: 0.3,
  maxTriangles: 2 * (world.half * 2 / world.terrainSpacing) ** 2 + 45000,
});

const palette = {
  grass: ['#79b94e', '#7bbb50', '#7ebd51', '#76b54b', '#81bf53'],
  dirt: ['#9b754e'],
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

export const pathCurves = [
  ...vehicleRoutes.routes,
  // Main roads connect the plaza to every edge and remain curved rather than
  // becoming a grid when the playable square expands.
  [[-SPEC.playableHalf, 7], [-100, 7], [-78, 7], [-55, 7], [-39, 5], [-23, 3], [-12, 9]],
  [[-9, -12], [-8, -21], [-3, -30], [3, -39], [7, -55], [5, -78], [5, -100], [5, -SPEC.playableHalf]],
  [[9, 12], [14, 13], [23, 20], bridgePoint(0), [40, 40], [57, 57], [78, 78], [100, 100], [SPEC.playableHalf, SPEC.playableHalf]],
  [[13, -3], [21, -6], [30, -7], [39, -10], [55, -8], [78, -5], [100, -5], [SPEC.playableHalf, -5]],
  // Secondary lanes serve the village, paddock, park, and countryside.
  [[-42, 25], [-34, 22], [-27, 17], [-19, 13], [-12, 9]],
  [[12, 9], [20, 5], [29, 1], [38, 2], [47, 12]],
  [[-7, -13], [3, -19], [15, -24], [25, -29], [36, -36]],
  // Regional loop and branches, kept outside the existing central village.
  [[-world.half+35,7],[-world.half+35,-world.half+35],[0,-world.half+35],[world.half-35,-world.half+35],[world.half-35,0],[world.half-35,world.half-35],[0,world.half-35],[-world.half+35,world.half-35],[-world.half+35,7]],
  [[-100,7],[-world.half+35,7],[-world.half+35,32]],
  [[5,-100],[0,-world.half+35]],
  [[100,100],[world.half-35,world.half-35]],
  [[-30,100],[-30,world.half-35]],
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

function nearestRoadDetails(x, z) {
  let bestDistance = Infinity;
  let bestOffset = 0;
  for (const points of pathCurves) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const lengthSquared = dx * dx + dz * dz;
      const length = Math.sqrt(lengthSquared);
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared, 0, 1);
      const offsetX = x - a[0] - t * dx;
      const offsetZ = z - a[1] - t * dz;
      const distance = Math.hypot(offsetX, offsetZ);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOffset = (offsetX * -dz + offsetZ * dx) / length;
      }
    }
  }
  return { distance: bestDistance, offset: bestOffset };
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
    if (extras.role !== 'terrain') {
      flat.deleteAttribute('normal');
      flat.computeVertexNormals();
    }
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

  const terrainPositions = [], terrainColors = [], terrainIndices = [];
  const terrainSpacing = (half * 2) / TERRAIN_SEGMENTS;
  const grassBase = new THREE.Color().setRGB(0.19, 0.36, 0.12);
  const grassTop = new THREE.Color('#cfdf8b');
  const roadBase = new THREE.Color('#98734f');
  const roadRut = new THREE.Color('#745438');
  const roadCenter = new THREE.Color('#a17d56');
  for (let iz = 0; iz <= TERRAIN_SEGMENTS; iz++) {
    const z = -half + iz * terrainSpacing;
    for (let ix = 0; ix <= TERRAIN_SEGMENTS; ix++) {
      const x = -half + ix * terrainSpacing;
      const height = groundHeight(x, z);
      terrainPositions.push(x, height, z);
      const variation = 0.9 + 0.08 * Math.sin(x * 0.31) * Math.cos(z * 0.27)
        + 0.04 * Math.sin((x + z) * 0.69);
      let color = Math.abs(riverV(x, z)) < 2
        ? new THREE.Color('#abac75')
        : grassBase.clone().lerp(grassTop, smooth((height + 0.6) / 5.2)).multiplyScalar(variation);
      const biome=forestAt(x,z);
      if(biome.weight>0&&Math.max(Math.abs(x),Math.abs(z))>120&&Math.abs(riverV(x,z))>3) {
        const floor=biome.zone.kind==='pine'?'#77764b':biome.zone.kind==='birch'?'#8da76b':'#557249';
        color.lerp(new THREE.Color(floor).multiplyScalar(variation),biome.weight*0.82);
      }
      if (Math.abs(riverV(x, z)) >= 2 && Math.hypot(x, z) > 12) {
        const { distance, offset } = nearestRoadDetails(x, z);
        const vehicleDistance = vehicleRouteDistance(x,z);
        const roadBlend = Math.max(1 - smooth((distance - 1.35) / 1.45),1 - smooth((vehicleDistance - vehicleRoutes.halfWidth + .6) / 1.2));
        if (roadBlend > 0) {
          const grain = 0.94 + 0.045 * Math.sin(x * 1.63 + z * 0.71) * Math.cos(z * 1.31 - x * 0.47);
          const roadColor = roadBase.clone().multiplyScalar(grain);
          const ruts = Math.exp(-(((Math.abs(offset) - 0.82) / 0.48) ** 2));
          const wornCenter = Math.exp(-((offset / 0.48) ** 2));
          roadColor.lerp(roadRut, ruts * 0.24);
          roadColor.lerp(roadCenter, wornCenter * 0.09);
          color.lerp(roadColor, roadBlend);
        }
      }
      terrainColors.push(color.r, color.g, color.b);
    }
  }
  const rowLength = TERRAIN_SEGMENTS + 1;
  for (let iz = 0; iz < TERRAIN_SEGMENTS; iz++) {
    for (let ix = 0; ix < TERRAIN_SEGMENTS; ix++) {
      const a = iz * rowLength + ix;
      const b = a + 1;
      const c = a + rowLength;
      const d = c + 1;
      if ((ix + iz) % 2) terrainIndices.push(a, c, b, b, c, d);
      else terrainIndices.push(a, c, d, a, d, b);
    }
  }
  const terrain = new THREE.BufferGeometry();
  terrain.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3));
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
  terrain.setIndex(terrainIndices);
  terrain.computeVertexNormals();
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
  box('Bridge deck',30,30,6.4,.22,6,'#937047',.78,bridgeRotation,
    {role:'bridge-deck',walkable:true,top:1});
  for(const side of [-1,1]) {
    for(let i=0;i<4;i++) {
      const outer=11-i*1.95, inner=outer-1.95, top=(i+1)*.25;
      const [x,z]=bridgePoint(side*(outer+inner)/2);
      const geometry=new THREE.BoxGeometry(1.95,.15,6);
      const positions=geometry.attributes.position;
      for(let j=0;j<positions.count;j++)positions.setY(j,positions.getY(j)-side*positions.getX(j)*(.25/1.95));
      add('Bridge '+(side<0?'west':'east')+' step '+(i+1),geometry,'#98734f',
        [x,top-.125-.075,z],[1,1,1],bridgeRotation,
        {role:'bridge-step',route:'bridge-'+side,step:i+1,top,rise:.25,run:1.95,walkable:true});
    }
    for(let i=0;i<9;i++) {
      const [x,z]=bridgePoint(-3.2+i*.8,side*3.12);
      box('Bridge parapet '+side+' '+i,x,z,.16,1.1,.16,'#65492f',.95,bridgeRotation,{role:'bridge-parapet'});
    }
    const [x,z]=bridgePoint(0,side*3.12);
    for(const y of [1.4,1.9])box('Bridge rail '+side+' '+y,x,z,6.6,.12,.12,'#80603f',y,bridgeRotation,{role:'bridge-structure'});
  }

  const archX = -18, archZ = -16;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      box(`Ruin pier ${side} ${i}`, archX + side * 1.8, archZ, 0.6, 0.3125, 1.3,
        choose(palette.stone), i * 0.3125, 0, { role: 'ruin', zone: 'ruins' });
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
      choose(palette.stone), [archX, 0, archZ - 0.65], undefined, 0, { role: 'ruin', zone: 'ruins' });
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
    '#9da691', [archX, 0, archZ - 0.62], undefined, 0, { role: 'ruin', zone: 'ruins' });
  box('Ruin climbable crown', archX, archZ, 5.5, 0.25, 2.15, '#bdc1ad', 3.35, 0,
    { role: 'ruin-crown', zone: 'ruins', walkable: true, top: 3.6 });
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
      { role: 'ruin-step', zone: 'ruins', route: 'ruin', step: i + 1, top, rise: 0.3, run: 0.85, walkable: true });
  }
  for (let i = 0; i < 9; i++) {
    const x = -22.2 - random() * 1.3, z = -7 - random() * 10;
    box(`Ruin scattered rubble ${i}`, x, z, 0.5 + random() * 0.5, 0.2 + random() * 0.4, 0.5 + random() * 0.4,
      choose(palette.stone), groundHeight(x, z), random() * 3, { role: 'ruin-rubble', zone: 'ruins' });
  }
  for (const [x, z, height] of [[-14, -19, 1.2], [-23, -19, 1.8], [-13.5, -15.5, 0.6]]) {
    box(`Broken column footing ${x}`, x, z, 1.4, 0.25, 1.4, '#9da691', 0, 0, { role: 'ruin', zone: 'ruins' });
    add(`Broken column ${x}`, new THREE.CylinderGeometry(0.45, 0.55, height, 7, 1), '#b6bca8',
      [x, height / 2 + 0.25, z], undefined, 0, { role: 'ruin', zone: 'ruins' });
  }

  // Landmark buildings are deliberately simple: only the wall footprint is
  // semantic collision, while roofs and trim stay visual-only.
  function house(label, x, z, rotation = 0) {
    const y = groundHeight(x, z);
    box(`${label} walls`, x, z, 5.2, 2.4, 4.2, '#c69c6b', y, rotation,
      { role: 'building', zone: 'village' });
    add(`${label} roof`, new THREE.ConeGeometry(3.7, 2.1, 4), '#8f5d52',
      [x, y + 3.45, z], [1, 1, 0.8], Math.PI / 4 + rotation,
      { role: 'building-roof', zone: 'village' });
    box(`${label} door`, x + Math.sin(rotation) * 2.12, z + Math.cos(rotation) * 2.12,
      0.8, 1.3, 0.1, '#654939', y, rotation, { role: 'furniture', zone: 'village' });
  }
  house('Village cottage west', -31, 16, -0.2);
  house('Village cottage east', -24, 20, 0.25);
  house('Village hall', -35, 25, 0.1);

  // Keep the town edge dense while leaving the central spawn plaza open.
  box('Town hall walls', -15, 8, 5.5, 2.5, 4.5, '#b88b5c', groundHeight(-15, 8), 0,
    { role: 'building', zone: 'town' });
  add('Town hall roof', new THREE.ConeGeometry(3.8, 2.2, 4), '#7f5148',
    [-15, groundHeight(-15, 8) + 3.7, 8], [1, 1, 0.8], Math.PI / 4,
    { role: 'building-roof', zone: 'town' });
  for (const [x, z] of [[13, 4], [20, 5]]) {
    box(`Town market stall ${x} ${z}`, x, z, 3, 1.5, 2, '#a9794d', groundHeight(x, z), 0,
      { role: 'building', zone: 'town' });
    add(`Town market canopy ${x} ${z}`, new THREE.ConeGeometry(2.1, 1.2, 4), '#b94f46',
      [x, groundHeight(x, z) + 2.1, z], [1, 1, 0.7], Math.PI / 4,
      { role: 'building-roof', zone: 'town' });
  }

  // Pond/lake water is a visual surface; the heightfield remains the only
  // walkable ground there, so players can wade out just like the river.
  const pondX = 26, pondZ = -23, pondY = groundHeight(pondX, pondZ) - 0.12;
  add('Park pond shore', new THREE.CylinderGeometry(1, 1, 0.18, 16), '#8ba982',
    [pondX, pondY, pondZ], [7, 1, 5], 0.15, { role: 'pond-shore', zone: 'park' });
  add('Park pond water', new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), '#4d9ea7',
    [pondX, pondY + 0.04, pondZ], [6.5, 1, 4.5], 0.15, { role: 'pond', zone: 'park' });

  function fence(points, label, zone = 'countryside') {
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i], base = groundHeight(x, z);
      box(`Fence ${label} post ${i}`, x, z, 0.18, 1.05, 0.18, '#795434', base, 0, { role: 'fence', zone });
      if (i === 0) continue;
      const [px, pz] = points[i - 1], previousY = groundHeight(px, pz);
      for (const h of [0.4, 0.8]) {
        const start = new THREE.Vector3(px, previousY + h, pz), end = new THREE.Vector3(x, base + h, z);
        const direction = end.clone().sub(start);
        const geometry = new THREE.BoxGeometry(direction.length(), 0.13, 0.11);
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize()));
        add(`Fence ${label} rail ${i} ${h}`, geometry, '#a07948', start.add(end).multiplyScalar(0.5).toArray(),
          undefined, 0, { role: 'fence', zone });
      }
    }
  }

  // Stable and paddock beside the secondary road.
  box('Stable walls', 30, -34, 7, 2.8, 5, '#a9784c', groundHeight(30, -34), 0,
    { role: 'building', zone: 'stable' });
  box('Stable roof', 30, -34, 7.8, 0.2, 5.8, '#714d43', groundHeight(30, -34) + 2.9, 0,
    { role: 'building-roof', zone: 'stable' });
  fence([[18, -40], [29, -42], [42, -39], [43, -28], [23, -27]], 'stable paddock', 'stable');
  for (const [x, z] of [[42, -4], [48, -1], [40, 12]]) {
    box(`Countryside hay bale ${x}`, x, z, 1.2, 0.9, 1.2, '#d6b35e', groundHeight(x, z), 0.2,
      { role: 'countryside-detail', zone: 'countryside' });
  }

  const trees = [
    [-52, 34], [-47, 43], [-40, 51], [-31, 43], [-22, 50],
    [33, -48], [42, -42], [51, -34], [45, -24], [54, -14],
    [-48, -10], [-43, 4], [42, 6], [52, 18], [-15, 43],
    [6, 48], [19, 52], [-4, -44], [12, -50], [32, 42],
    [-53, -44], [-23, -49], [48, 34], [35, 28], [-45, 28],
    [-105, -84], [-93, -96], [-76, -105], [-46, -105], [-18, -106], [12, -108], [42, -107], [75, -100], [100, -87],
    [106, -54], [108, -22], [107, 12], [108, 44], [103, 76], [86, 103], [55, 108], [23, 107], [-10, 108], [-43, 106],
    [-77, 103], [-103, 84], [-108, 51], [-107, 19], [-108, -15], [-107, -48],
    [-97, -70], [-86, -42], [-101, -8], [-87, 28], [-94, 59], [-76, 82],
    [-59, 96], [-28, 101], [2, 97], [30, 103], [62, 96], [91, 89],
    [98, 61], [94, 31], [100, 0], [95, -31], [103, -61], [81, -89],
    [55, -96], [24, -101], [-7, -97], [-37, -102], [-67, -94], [-92, -91],
  ];
  for (let i = 0; i < trees.length; i++) {
    const [x, z] = trees[i], y = groundHeight(x, z), height = 4.5 + random() * 1.5;
    const zone = (x < -38 || z > 40 || z < -40) ? 'forest' : 'countryside';
    add(`Tree ${i + 1} trunk`, new THREE.CylinderGeometry(0.22, 0.38, height * 0.62, 5), '#795539',
      [x, y + height * 0.31, z], undefined, 0, { role: 'tree-trunk', tree: i + 1, zone });
    if (i % 3 === 0) {
      for (let j = 0; j < 3; j++) {
        add(`Tree ${i + 1} conifer tier ${j}`, new THREE.ConeGeometry(2 - j * 0.42, 2.4, 7),
          choose(palette.leaf), [x, y + 2.5 + j * 1.05, z], undefined, i, { role: 'tree-canopy', tree: i + 1, zone });
      }
    } else {
      add(`Tree ${i + 1} faceted crown`, new THREE.IcosahedronGeometry(1, 1),
        choose(palette.leaf), [x, y + height * 0.78, z], [2.4, 2.1, 2.15], i, { role: 'tree-canopy', tree: i + 1, zone });
      add(`Tree ${i + 1} crown lobe`, new THREE.IcosahedronGeometry(1, 0),
        choose(palette.leaf), [x + 1.2, y + height * 0.69, z + 0.5], [1.55, 1.55, 1.5], i, { role: 'tree-canopy', tree: i + 1, zone });
    }
  }
  fence([[-28, 6.6], [-25.5, 6], [-23, 6], [-20.5, 6.5]], 'west path', 'village');
  fence([[18, -8.7], [20.5, -8.9], [23, -8.2], [25.5, -6.9]], 'east path', 'park');
  fence([[-6.4, -19], [-5.5, -21.5], [-4, -23.5]], 'north path', 'ruins');

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

  // Separate visual-only scenery beyond the expanded playable border.
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    const radius = world.half * Math.SQRT2 + 50 + random() * 9, height = 25 + random() * 22, width = 18 + random() * 8;
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
  // A nearer, lower foothill ring gives the valley a layered mountain horizon
  // instead of a single row of isolated peaks. These remain visual-only.
  for (let i = 0; i < 18; i++) {
    const angle = (i + 0.5) * Math.PI * 2 / 18;
    const radius = world.half * Math.SQRT2 + 20 + random() * 8;
    const height = 14 + random() * 10;
    const width = 10 + random() * 5;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const snowHeight = i % 4 === 0 ? height * 0.18 : 0;
    const ridgeHeight = height - snowHeight;
    add(`Backdrop foothill ${i + 1}`, new THREE.CylinderGeometry(width * 0.28, width, ridgeHeight, 6),
      ['#557c70', '#668777', '#748f7b'][i % 3], [x, ridgeHeight / 2 - 2, z], undefined, angle,
      { role: 'backdrop', visualOnly: true });
    if (snowHeight > 0) {
      add(`Backdrop foothill snow ${i + 1}`, new THREE.ConeGeometry(width * 0.28, snowHeight, 6),
        '#d9e7dd', [x, ridgeHeight + snowHeight / 2 - 2, z], undefined, angle,
        { role: 'backdrop', visualOnly: true });
    }
  }
  add('Backdrop castle plateau', new THREE.CylinderGeometry(15, 21, 16, 7), '#81a477',
    [-world.half-37, 6, -world.half-31], undefined, 0, { role: 'backdrop', visualOnly: true });
  box('Backdrop castle keep', -world.half-37, -world.half-31, 10, 10, 7, '#d4d8bc', 14, 0, { role: 'backdrop', visualOnly: true });
  for (const [dx, dz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) {
    add(`Backdrop castle tower ${dx} ${dz}`, new THREE.CylinderGeometry(1.8, 2, 14, 6), '#e0e1c8',
      [-world.half-37 + dx, 21, -world.half-31 + dz], undefined, 0, { role: 'backdrop', visualOnly: true });
    add(`Backdrop castle roof ${dx} ${dz}`, new THREE.ConeGeometry(2.5, 5, 6), '#638a91',
      [-world.half-37 + dx, 30.5, -world.half-31 + dz], undefined, 0, { role: 'backdrop', visualOnly: true });
  }
  for (let i = 0; i < 6; i++) {
    box(`Backdrop castle merlon ${i}`, -world.half-41.5 + i * 1.8, -world.half-27.5, 0.9, 1, 0.9, '#e4e2c9', 24, 0,
      { role: 'backdrop', visualOnly: true });
  }
  add('Backdrop lake shore', new THREE.CylinderGeometry(1, 1, 0.5, 13), '#8ba982',
    [world.half+53, -1.1, -world.half-11], [30, 1, 17], 0.2, { role: 'backdrop', visualOnly: true });
  add('Backdrop blue lake', new THREE.CircleGeometry(1, 13).rotateX(-Math.PI / 2), '#529fa9',
    [world.half+53, -0.8, -world.half-11], [28, 1, 15], 0.2, { role: 'backdrop', visualOnly: true });

  const clearable=new Set(['fence','rock','tree-trunk','tree-canopy']);
  const kept=meshes.filter(mesh=>{
    if(!clearable.has(mesh.extras.role))return true;
    mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox;
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    if(vehicleRouteDistance(center.x,center.z)>vehicleRoutes.clearance+Math.hypot(size.x,size.z)/2)return true;
    mesh.geometry.dispose();return false;
  });
  return { meshes:kept, spec: SPEC };
}
