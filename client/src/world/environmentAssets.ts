import world from '../../../shared/world.json';
import roadsJson from './roads.json';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CollisionWorld } from './collision';
import { createGrass } from './grass';

const ASSETS = {
  pine: '/environment-demo-prototype/PT_Pine_Tree_03_green.glb',
  bridge: '/environment-demo-prototype/PT_Wooden_Bridge_02.glb',
  fence: '/environment-demo-prototype/PT_Modular_Fence_Wood_02.glb',
  riverRock: '/environment-demo-prototype/PT_River_Rock_Pile_02.glb',
  shrub: '/environment-prototype/PT_Generic_Shrub_01_green.glb',
  grass: '/environment-prototype/PT_Grass_01.glb',
  appleTree: '/environment-library/apple_tree.glb',
  gnarledTree: '/environment-library/gnarled_tree.glb',
  ruinedWall: '/environment-library/stone_arch.glb',
  flagstones: '/environment-library/flagstone_patch.glb',
  stoneCottage: '/environment-library/stone_cottage_batched.glb',
  cottageLow: '/environment-library/stone_cottage_low_batched.glb',
} as const;

type AssetName = keyof typeof ASSETS;

const FLAT_COLORED_ASSETS = new Set<AssetName>([
  'pine', 'bridge', 'fence', 'riverRock', 'shrub', 'grass',
]);

interface Placement {
  x: number;
  z: number;
  scale: number;
  scaleY?: number;
  rotation: number;
  yOffset?: number;
}

const TREE_SPOTS: readonly [number, number][] = [
  [-70, -62], [-61, -47], [-68, -30], [-65, -10],
  [-70, 12], [-66, 34], [-61, 53], [-48, 68],
  [-29, -68], [-8, -70], [14, -67], [37, -68],
  [58, -64], [71, -45], [69, -21], [72, 2],
  [68, 24], [61, 46], [43, 69], [20, 71],
  [-3, 71], [-25, 68], [-49, 65], [49, 57],
  [-108, -91], [-89, -108], [-61, -111], [-31, -109], [0, -111], [31, -109], [61, -111], [91, -104], [109, -83],
  [111, -54], [109, -25], [111, 6], [109, 37], [110, 68], [101, 95], [82, 110], [52, 111], [21, 109], [-10, 111],
  [-41, 109], [-72, 108], [-99, 94], [-111, 64], [-109, 33], [-111, 2], [-109, -29], [-110, -60],
  [-94, -71], [-81, -44], [-98, -13], [-83, 24], [-93, 57], [-72, 84],
  [-55, 94], [-25, 99], [6, 92], [36, 100], [68, 91], [96, 82],
  [101, 54], [91, 25], [99, -5], [89, -35], [96, -66], [75, -91],
  [49, -97], [18, -99], [-12, -92], [-42, -98], [-71, -90], [-93, -91],
];

const GRASS_PATCH_CENTERS: readonly [number, number][] = [
  [-12, -18], [12, -18], [18, -25],
  [-50, -45], [-40, -42], [-49, -29], [-38, -25], [-51, -11],
  [-40, 0], [37, 45], [-49, 15], [-36, 24], [-46, 36],
  [-32, 43], [48, 35], [48, 12], [44, -12], [39, -45],
  [14, -29], [35, -27],
  [-68, -58], [-67, -43], [-71, 4], [-68, 22], [-61, 58],
  [-43, 67], [-23, 70], [2, -70], [26, -68], [47, -70],
  [67, -53], [72, -36], [70, -8], [68, 17], [66, 60],
  [46, 69], [25, 72], [2, 69], [-25, 68], [-49, 67],
  [-106, -100], [-90, -96], [-74, -108], [-52, -97], [-31, -106], [-10, -95], [12, -108], [34, -97], [57, -106], [78, -95], [100, -106],
  [107, -80], [95, -62], [108, -42], [96, -21], [107, 1], [95, 22], [109, 43], [96, 64], [108, 85], [88, 103],
  [65, 96], [45, 108], [23, 95], [1, 108], [-21, 96], [-43, 108], [-65, 96], [-86, 108], [-105, 84], [-96, 61],
  [-108, 39], [-96, 17], [-108, -5], [-96, -27], [-108, -49], [-96, -71],
  [-92, -82], [-78, -67], [-85, -49], [-96, -35], [-82, -13], [-97, 7], [-82, 28], [-98, 48], [-82, 72], [-66, 88],
  [-45, 79], [-27, 91], [-5, 82], [17, 92], [39, 80], [61, 91], [82, 77], [97, 91],
  [84, 55], [100, 36], [84, 13], [99, -9], [82, -30], [99, -51], [81, -71], [60, -88],
  [38, -76], [16, -91], [-6, -77], [-29, -92], [-51, -77], [-72, -94],
  [-72, -63], [-59, -58], [-42, -62], [-24, -64], [-5, -66], [17, -64], [38, -62], [57, -58], [72, -64],
  [-72, -40], [-66, -25], [-64, -7], [-68, 12], [-65, 31], [-62, 49], [-55, 61], [-40, 59], [-20, 63],
  [1, 64], [23, 64], [44, 63], [62, 56], [71, 42], [63, 28], [67, 8], [62, -13], [60, -33],
  [-48, -55], [-31, -48], [-13, -55], [8, -53], [30, -51], [49, -47], [-44, 54], [-26, 56], [-5, 52],
  [16, 55], [36, 53], [54, 48], [-58, 2], [-56, 21], [55, 8], [56, 27], [-28, -30], [8, 31], [42, 37],
];

const STUDY_ROADS = roadsJson as [number, number][][];

function distanceToSegment(
  x: number,
  z: number,
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0
    ? 0
    : THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared, 0, 1);
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

function grassPlacements(): Placement[] {
  let state = 24791;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const placements: Placement[] = [];
  for (const [cx, cz] of GRASS_PATCH_CENTERS) {
    const wanted = cx > 5 && cz > 10 && cz < 45 ? 18 : 34;
    let localCount = 0;
    for (let attempt = 0; attempt < wanted * 6 && placements.length < 6000; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (2.6 + random() * 2.4);
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      if (Math.abs(x) > 116 || Math.abs(z) > 116) continue;
      if (Math.hypot(x, z - 5) < 12) continue;
      if (Math.hypot((x - 26) / 12, (z + 23) / 8) < 1.12) continue;
      let roadDistance = Infinity;
      for (const road of STUDY_ROADS) for (let i=1; i<road.length; i++) {
        roadDistance = Math.min(roadDistance, distanceToSegment(x,z,road[i-1],road[i]));
      }
      if (roadDistance < 2.4) continue;
      const riverV = (x + z - 60) / Math.SQRT2;
      if (Math.abs(riverV) < 3.5) continue;
      placements.push({
        x,
        z,
        rotation: random() * Math.PI * 2,
        scale: 1.05 + random() * 0.4,
        yOffset: 0.035,
      });
      localCount++;
      if (localCount >= wanted) break;
    }
  }
  return placements;
}

function replaceMaterials(root: THREE.Object3D, kind: AssetName): void {
  const materials = new Map<number, THREE.MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const replace = (oldMaterial: THREE.Material): THREE.MeshStandardMaterial => {
      const name = oldMaterial.name.toLowerCase();
      const leaves = kind === 'pine' && name.includes('leaves');
      const color = leaves ? 0x579344
        : kind === 'pine' ? 0x765236
          : kind === 'bridge' || kind === 'fence' ? 0x98704a
            : kind === 'riverRock' ? 0x858a76
              : kind === 'grass' ? 0x78a84d
                : 0x7d9661;
      oldMaterial.dispose();
      const cached = materials.get(color);
      if (cached) return cached;
      const material = new THREE.MeshStandardMaterial({
        name: oldMaterial.name,
        color,
        roughness: 0.95,
        metalness: 0,
        side: leaves ? THREE.DoubleSide : THREE.FrontSide,
      });
      materials.set(color, material);
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(replace)
      : replace(object.material);
  });
}

function addInstances(
  target: THREE.Group,
  collision: CollisionWorld,
  root: THREE.Object3D,
  placements: readonly Placement[],
  name: string,
): void {
  root.updateMatrixWorld(true);
  const levels = new Map<number, THREE.Mesh[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let level = 0;
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      const match = node.name.match(/LOD(\d+)/i);
      if (match) { level = Number(match[1]); break; }
    }
    const list = levels.get(level) ?? [];
    list.push(object); levels.set(level, list);
  });
  const cells = new Map<string, Placement[]>();
  for (const p of placements) {
    const key = Math.floor(p.x / world.sectionSize) + ',' + Math.floor(p.z / world.sectionSize);
    const list = cells.get(key) ?? []; list.push(p); cells.set(key, list);
  }
  const grass = name.includes('grass patches');
  const distances = grass ? [0, 28, 52, 75] : [0, 40, 85, 170];
  const geometries = new Map<THREE.Mesh, THREE.BufferGeometry>();
  const axis = new THREE.Vector3(0, 1, 0);
  for (const [key, cell] of cells) {
    const [cx, cz] = key.split(',').map(Number);
    for (let level = 0; level < 3; level++) {
      const chosen = [...levels.keys()].sort((a,b)=>Math.abs(a-level)-Math.abs(b-level) || b-a)[0];
      const group = new THREE.Group();
      group.userData.detail = { x: cx*world.sectionSize+world.sectionSize/2, z: cz*world.sectionSize+world.sectionSize/2, min: distances[level], max: distances[level+1], grass };
      group.visible = false;
      for (const source of levels.get(chosen) ?? []) {
        let geometry = geometries.get(source);
        if (!geometry) { geometry = source.geometry.clone().applyMatrix4(source.matrixWorld); geometries.set(source, geometry); }
        const selected = grass ? cell.filter((_,i)=>i % (level+1) === 0) : cell;
        const instances = new THREE.InstancedMesh(geometry, source.material, selected.length);
        instances.name = name;
        instances.castShadow = !grass && level === 0;
        instances.receiveShadow = true;
        const transform = new THREE.Object3D();
        selected.forEach((p,index)=> {
          transform.position.set(p.x,collision.groundAt(p.x,p.z)+(p.yOffset??0),p.z);
          transform.quaternion.setFromAxisAngle(axis,p.rotation);
          transform.scale.set(p.scale,p.scaleY??p.scale,p.scale);
          transform.updateMatrix(); instances.setMatrixAt(index,transform.matrix);
        });
        instances.instanceMatrix.needsUpdate=true;
        instances.computeBoundingSphere();
        group.add(instances);
      }
      target.add(group);
    }
  }
}

export async function addEnvironmentAssets(
  target: THREE.Group,
  collision: CollisionWorld,
): Promise<void> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    Object.entries(ASSETS).map(async ([name, url]) => {
      if (name === 'grass') return ['grass', createGrass()] as const;
      const gltf = await loader.loadAsync(url);
      const assetName = name as AssetName;
      if (FLAT_COLORED_ASSETS.has(assetName)) replaceMaterials(gltf.scene, assetName);
      return [assetName, gltf.scene] as const;
    }),
  );
  const assets = Object.fromEntries(entries) as Record<AssetName, THREE.Group>;

  const treePlacements = TREE_SPOTS.map(([x, z], index) => ({
    x,
    z,
    scale: 0.88 + (index % 5) * 0.055,
    rotation: (index * 1.71) % (Math.PI * 2),
    yOffset: 0.52 * (0.88 + (index % 5) * 0.055),
  }));
  addInstances(target, collision, assets.pine, treePlacements, 'instanced Polytope pines');
  addInstances(target, collision, assets.appleTree, [
    { x: 7, z: -49, scale: 1.05, rotation: 0.4 },
    { x: 16, z: -53, scale: 0.94, rotation: 2.1 },
    { x: 23, z: -49, scale: 1.08, rotation: 4.2 },
  ], 'three-low-poly orchard trees');
  addInstances(target, collision, assets.gnarledTree, [
    { x: -31, z: -19, scale: 1.15, rotation: 0.5 },
  ], 'three-low-poly gnarled ruin tree');
  addInstances(target, collision, assets.ruinedWall, [
    { x: -28, z: -16, scale: 0.92, rotation: -0.18 },
    { x: -8, z: -18, scale: 0.78, rotation: 0.28 },
  ], 'three-low-poly ruin walls');
  addInstances(target, collision, assets.flagstones, [
    { x: 13, z: 4, scale: 1, rotation: 0 },
    { x: 13, z: 12, scale: 1, rotation: 0.04 },
  ], 'three-low-poly market flagstones');
  assets.stoneCottage.name = 'cottage_LOD0';
  assets.cottageLow.name = 'cottage_LOD2';
  const cottages = new THREE.Group();
  cottages.add(assets.stoneCottage, assets.cottageLow);
  addInstances(target, collision, cottages, [
    { x: -31, z: 16, scale: 1, rotation: -0.2 },
    { x: -24, z: 20, scale: 1, rotation: 0.25 },
    { x: -35, z: 25, scale: 1, rotation: 0.1 },
    { x: -15, z: 8, scale: 1.05, rotation: 0 },
    { x: 30, z: -34, scale: 1.18, rotation: 0 },
  ], 'three-low-poly stone cottages');
  const grass = grassPlacements();
  addInstances(target, collision, assets.grass, grass, 'instanced low-poly grass patches');

  const bridgeRotation = -Math.PI / 4;
  assets.bridge.updateMatrixWorld(true);
  const bridgeBounds = new THREE.Box3().setFromObject(assets.bridge);
  // Fit the GLB to the collision span. Its plank tops are at y=0.59 in the
  // source asset; compress the vertical scale so that surface lands at the
  // generated deck height (1m), keeping player support and visible boards aligned.
  const bridgeScale = 6.4 / (bridgeBounds.max.x - bridgeBounds.min.x);
  const bridgeDeckSurfaceY = 0.59;
  const bridgeScaleY = 1 / (bridgeDeckSurfaceY - bridgeBounds.min.y);
  const bridgePivot = bridgeBounds.getCenter(new THREE.Vector3());
  const bridgeOffset = new THREE.Vector3(bridgePivot.x, 0, bridgePivot.z)
    .multiplyScalar(bridgeScale)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), bridgeRotation);
  const bridgeX = 30 - bridgeOffset.x;
  const bridgeZ = 30 - bridgeOffset.z;
  const bridgeBaseY = collision.groundAt(30, 30) - bridgeBounds.min.y * bridgeScaleY;
  addInstances(target, collision, assets.bridge, [
    {
      x: bridgeX,
      z: bridgeZ,
      scale: bridgeScale,
      scaleY: bridgeScaleY,
      rotation: bridgeRotation,
      yOffset: bridgeBaseY - collision.groundAt(bridgeX, bridgeZ),
    },
  ], 'Polytope wooden bridge');
  addInstances(target, collision, assets.riverRock, [
    { x: 28, z: 26, scale: 1.4, rotation: 0.4 },
    { x: 32, z: 34, scale: 1.25, rotation: 1.1 },
    { x: 82, z: -17, scale: 1.3, rotation: 0.7 },
    { x: -17, z: 82, scale: 1.35, rotation: 2.1 },
    { x: -42, z: 98, scale: 1.15, rotation: 1.4 },
    { x: 98, z: -42, scale: 1.2, rotation: 0.2 },
  ], 'Polytope river rocks');
  addInstances(target, collision, assets.shrub, [
    { x: -15, z: 16, scale: 1.1, rotation: 0.8 },
    { x: 15, z: -21, scale: 1.22, rotation: 1.6 },
    { x: -88, z: 46, scale: 1.15, rotation: 0.6 },
    { x: -75, z: 59, scale: 1.25, rotation: 1.1 },
    { x: -54, z: 85, scale: 1.3, rotation: 2.4 },
    { x: -18, z: 94, scale: 1.1, rotation: 0.9 },
    { x: 38, z: 88, scale: 1.2, rotation: 1.5 },
    { x: 80, z: 68, scale: 1.25, rotation: 2.7 },
    { x: 75, z: -70, scale: 1.2, rotation: 0.4 },
    { x: 45, z: -91, scale: 1.3, rotation: 1.8 },
    { x: -51, z: -88, scale: 1.15, rotation: 2.3 },
    { x: -88, z: -55, scale: 1.25, rotation: 0.2 },
  ], 'Polytope shrubs');

  const fences: Placement[] = Array.from({ length: 5 }, (_, index) => ({
    x: -17 + index * 4.4,
    z: 22,
    scale: 1.5,
    rotation: 0,
  }));
  fences.push(...Array.from({ length: 10 }, (_, index) => ({
    x: -94 + index * 4.2,
    z: 77,
    scale: 1.35,
    rotation: 0,
  })));
  addInstances(target, collision, assets.fence, fences, 'Polytope village fences');
}

/** Each section submits only one detail level. */
export function updateEnvironment(target: THREE.Group, x: number, z: number, distanceScale: number): void {
  for (const group of target.children) {
    const detail = group.userData.detail;
    if (!detail) continue;
    const distance = Math.hypot(detail.x-x,detail.z-z) / distanceScale;
    group.visible = distance >= detail.min && distance < detail.max;
  }
}
