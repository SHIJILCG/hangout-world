import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CollisionWorld, type Box, type HeightGrid } from './collision';
import manifestJson from './meadow-collision.json';

export const WORLD_HALF = 40; // must match server
export const SPAWN = { x: 0, y: 0, z: 8 };

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

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  group.add(gltf.scene);

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.receiveShadow = true;
    obj.castShadow = !obj.name.startsWith('Backdrop');
  });

  // --- Lighting ---
  group.add(new THREE.HemisphereLight(0xe7f5ff, 0x789158, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d5, 2);
  sun.position.set(-32, 60, 25);
  sun.castShadow = true;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 170;
  sun.shadow.normalBias = 0.06;
  sun.shadow.mapSize.set(2048, 2048);
  group.add(sun);

  return { group, collision: buildCollision() };
}
