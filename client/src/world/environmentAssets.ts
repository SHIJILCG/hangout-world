import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CollisionWorld } from './collision';

const ASSETS = {
  pine: '/environment-demo-prototype/PT_Pine_Tree_03_green.glb',
  bridge: '/environment-demo-prototype/PT_Wooden_Bridge_02.glb',
  fence: '/environment-demo-prototype/PT_Modular_Fence_Wood_02.glb',
  riverRock: '/environment-demo-prototype/PT_River_Rock_Pile_02.glb',
  shrub: '/environment-prototype/PT_Generic_Shrub_01_green.glb',
  grass: '/environment-prototype/PT_Grass_01.glb',
} as const;

type AssetName = keyof typeof ASSETS;

interface Placement {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  yOffset?: number;
}

const TREE_SPOTS: readonly [number, number][] = [
  [-52, -48], [-53, -34], [-36, -35], [-51, -18],
  [-34, -23], [-51, -4], [-36, 5], [-43, 24], [-52, 34],
  [-31, 43], [-10, 22], [-12, -18], [12, -18], [51, 30],
  [-69, -52], [-68, 13], [-57, 68], [-30, -68], [24, -70],
  [62, -60], [70, -29], [68, 45], [47, 70], [-70, 48],
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
];

const STUDY_ROADS: readonly (readonly [number, number][])[] = [
  [[-57, 7], [-39, 8], [-22, 7], [-8, 6], [5, 8], [21, 12], [38, 17], [56, 22]],
  [[-8, -57], [-8, -37], [-5, -20], [0, -7], [4, 7], [7, 23], [13, 39], [16, 57]],
  [[-17, 15], [-10, 20], [2, 21], [14, 19], [21, 12]],
  [[13, -9], [20, -14], [27, -21], [30, -29], [24, -38], [18, -47]],
  [[-48, -35], [-39, -23], [-34, -8], [-32, 12], [-37, 32], [-46, 48]],
];

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
    const wanted = cx > 5 && cz > 10 && cz < 45 ? 12 : 20;
    for (let attempt = 0; attempt < wanted * 4 && placements.length < 320; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * (1.8 + random() * 1.6);
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      if (Math.abs(x) > 76 || Math.abs(z) > 76) continue;
      if (Math.hypot(x, z - 5) < 12) continue;
      if (Math.hypot((x - 26) / 12, (z + 23) / 8) < 1.12) continue;
      const roadDistance = Math.min(...STUDY_ROADS.flatMap((road) =>
        road.slice(1).map((point, index) => distanceToSegment(x, z, road[index], point))));
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
      if (placements.filter((placement) => Math.hypot(placement.x - cx, placement.z - cz) < 6).length >= wanted) break;
    }
  }
  return placements;
}

function replaceMaterials(root: THREE.Object3D, kind: AssetName): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const lod = object.name.match(/LOD(\d+)/i);
    if (lod) object.visible = lod[1] === '0';
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
      return new THREE.MeshStandardMaterial({
        name: oldMaterial.name,
        color,
        roughness: 0.95,
        metalness: 0,
        side: leaves ? THREE.DoubleSide : THREE.FrontSide,
      });
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
  const sources: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) sources.push(object);
  });
  if (sources.length === 0) throw new Error(`Environment asset ${name} has no visible LOD0 meshes.`);

  for (const source of sources) {
    const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
    const instances = new THREE.InstancedMesh(geometry, source.material, placements.length);
    instances.name = name;
    instances.castShadow = name !== 'instanced low-poly grass patches';
    instances.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    placements.forEach((placement, index) => {
      position.set(
        placement.x,
        collision.groundAt(placement.x, placement.z) + (placement.yOffset ?? 0),
        placement.z,
      );
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotation);
      scale.setScalar(placement.scale);
      matrix.compose(position, rotation, scale);
      instances.setMatrixAt(index, matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    target.add(instances);
  }
}

export async function addEnvironmentAssets(
  target: THREE.Group,
  collision: CollisionWorld,
): Promise<void> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    Object.entries(ASSETS).map(async ([name, url]) => {
      const gltf = await loader.loadAsync(url);
      const assetName = name as AssetName;
      replaceMaterials(gltf.scene, assetName);
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
  const grass = grassPlacements().flatMap((placement, index) => {
    const angle = (index * 2.399963229728653) % (Math.PI * 2);
    const offsetX = Math.cos(angle) * 0.22;
    const offsetZ = Math.sin(angle) * 0.22;
    return [
      placement,
      { ...placement, x: placement.x + offsetX, z: placement.z + offsetZ, scale: placement.scale * 0.82 },
      { ...placement, x: placement.x - offsetX, z: placement.z - offsetZ, scale: placement.scale * 0.82 },
    ];
  });
  addInstances(target, collision, assets.grass, grass, 'instanced low-poly grass patches');

  const bridgeRotation = -Math.PI / 4;
  assets.bridge.updateMatrixWorld(true);
  const bridgeBounds = new THREE.Box3().setFromObject(assets.bridge);
  // Fit the measured GLB to the collision span and seat its lowest beam on the terrain.
  const bridgeScale = 6.4 / (bridgeBounds.max.x - bridgeBounds.min.x);
  const bridgePivot = bridgeBounds.getCenter(new THREE.Vector3());
  const bridgeOffset = new THREE.Vector3(bridgePivot.x, 0, bridgePivot.z)
    .multiplyScalar(bridgeScale)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), bridgeRotation);
  const bridgeX = 30 - bridgeOffset.x;
  const bridgeZ = 30 - bridgeOffset.z;
  const bridgeBaseY = collision.groundAt(30, 30) - bridgeBounds.min.y * bridgeScale;
  addInstances(target, collision, assets.bridge, [
    {
      x: bridgeX,
      z: bridgeZ,
      scale: bridgeScale,
      rotation: bridgeRotation,
      yOffset: bridgeBaseY - collision.groundAt(bridgeX, bridgeZ),
    },
  ], 'Polytope wooden bridge');
  addInstances(target, collision, assets.riverRock, [
    { x: 28, z: 26, scale: 1.4, rotation: 0.4 },
    { x: 32, z: 34, scale: 1.25, rotation: 1.1 },
  ], 'Polytope river rocks');
  addInstances(target, collision, assets.shrub, [
    { x: -15, z: 16, scale: 1.1, rotation: 0.8 },
    { x: 15, z: -21, scale: 1.22, rotation: 1.6 },
  ], 'Polytope shrubs');

  const fences: Placement[] = Array.from({ length: 5 }, (_, index) => ({
    x: -17 + index * 4.4,
    z: 22,
    scale: 1.5,
    rotation: 0,
  }));
  addInstances(target, collision, assets.fence, fences, 'Polytope village fences');
}
