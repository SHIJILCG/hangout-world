import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CollisionWorld, type Box, type HeightGrid } from './collision';
import { addEnvironmentAssets } from './environmentAssets';
import manifestJson from './meadow-collision.json';

export const WORLD_HALF = 80; // must match server (160 x 160m)
// Ten deterministic pads around the central social plaza. The first entry is
// retained as SPAWN for the single-player/client contract.
export const SPAWN_POINTS = [
  { x: 0, y: 0, z: 8 },
  { x: 1.9, y: 0, z: 8 },
  { x: 1.55, y: 0, z: 6.8 },
  { x: 0.6, y: 0, z: 5.8 },
  { x: -0.6, y: 0, z: 5.8 },
  { x: -1.55, y: 0, z: 6.8 },
  { x: -1.9, y: 0, z: 8 },
  { x: -1.55, y: 0, z: 9.2 },
  { x: -0.6, y: 0, z: 9.5 },
  { x: 0.6, y: 0, z: 9.2 },
] as const;
export const SPAWN = SPAWN_POINTS[0];

export interface WorldMap {
  group: THREE.Group;
  collision: CollisionWorld;
}

interface CollisionManifest {
  half: number;
  grid: HeightGrid;
  boxes: Box[];
}

const manifest = manifestJson as CollisionManifest;

const MODEL_URL = '/models/fantasy-meadow.glb';

// Sync, JSON-only — used by tests (headless, no GLB/rendering) and by buildMap.
export function buildCollision(): CollisionWorld {
  return new CollisionWorld(manifest.boxes, manifest.grid);
}

export async function buildMap(): Promise<WorldMap> {
  const group = new THREE.Group();
  const collision = buildCollision();

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  group.add(gltf.scene);

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const role = obj.userData.role;
    const generatedBridge = typeof role === 'string' && role.startsWith('bridge-');
    if (role === 'tree-trunk' || role === 'tree-canopy' || role === 'flowers' || generatedBridge) {
      obj.visible = false;
      return;
    }
    obj.receiveShadow = true;
    obj.castShadow = !obj.name.startsWith('Backdrop');
  });
  await addEnvironmentAssets(group, collision);

  // --- Lighting ---
  group.add(new THREE.HemisphereLight(0xe7f5ff, 0x789158, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d5, 2);
  sun.position.set(-32, 60, 25);
  sun.castShadow = true;
  sun.shadow.camera.left = -85;
  sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85;
  sun.shadow.camera.bottom = -85;
  sun.shadow.camera.far = 210;
  sun.shadow.normalBias = 0.06;
  sun.shadow.mapSize.set(2048, 2048);
  group.add(sun);

  return { group, collision };
}
