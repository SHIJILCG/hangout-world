import world from '../../../shared/world.json';
import * as THREE from 'three';
import { CollisionWorld, type Box, type HeightGrid } from './collision';
import { StreamedMap, disposeGeometry } from './streaming';
import { addEnvironmentAssets, updateEnvironment } from './environmentAssets';
import { RegionalAssets } from './regionalAssets';
import manifestJson from './meadow-collision.json';

export const WORLD_HALF = world.half;
// Ten deterministic pads around the central social plaza. The first entry is
// retained as SPAWN for the single-player/client contract.
export const SPAWN_POINTS = world.spawnPoints;
export const SPAWN = SPAWN_POINTS[0];

export interface WorldMap {
  group: THREE.Group;
  collision: CollisionWorld;
  update(x: number, y: number, z: number, now: number, quality: number): void;
  dispose(): void;
  streaming: StreamedMap;
  sun: THREE.DirectionalLight;
  regional: RegionalAssets;
}

interface CollisionManifest {
  half: number;
  grid: HeightGrid;
  boxes: Box[];
}

const manifest = manifestJson as CollisionManifest;


// Sync, JSON-only — used by tests (headless, no GLB/rendering) and by buildMap.
export function buildCollision(): CollisionWorld {
  return new CollisionWorld(manifest.boxes, manifest.grid);
}

export async function buildMap(): Promise<WorldMap> {
  const group = new THREE.Group();
  const [metadataResponse, heightsResponse]=await Promise.all([fetch('/models/collision.json'),fetch('/models/heights.bin')]);
  if(!metadataResponse.ok||!heightsResponse.ok)throw new Error('Could not load world collision data');
  const metadata=await metadataResponse.json() as CollisionManifest;
  const bytes=await heightsResponse.arrayBuffer();
  if(bytes.byteLength!==metadata.grid.size**2*4)throw new Error('Invalid world height field');
  const heights=new Float32Array(bytes.byteLength/4),view=new DataView(bytes);
  for(let i=0;i<heights.length;i++)heights[i]=view.getFloat32(i*4,true);
  const collision = new CollisionWorld(metadata.boxes,{...metadata.grid,heights});

  const streaming = new StreamedMap();
  const environment = new THREE.Group();
  const regional=new RegionalAssets();
  group.add(streaming.group, environment,regional.group);
  try {
    const results = await Promise.allSettled([streaming.initialize(), addEnvironmentAssets(environment, collision),regional.initialize()]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  } catch (error) {
    streaming.dispose();regional.dispose(); disposeGeometry(environment); throw error;
  }

  // --- Lighting ---
  group.add(new THREE.HemisphereLight(0xe7f5ff, 0x789158, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d5, 2);
  sun.position.set(-32, 60, 25);
  sun.castShadow = true;
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.camera.far = 320;
  sun.shadow.normalBias = 0.06;
  sun.shadow.mapSize.set(2048, 2048);
  group.add(sun, sun.target);

  let nextEnvironmentUpdate = 0;
  return {
    group, collision, streaming, sun,regional,
    update(x,_y,z,now,quality) {
      streaming.update(x,z,now,world.detailRadius[quality],world.residentSections[quality]);
      regional.update(streaming.activeKeys,x,z,now,quality);
      // Quantize the shadow focus to avoid moving it on every tiny player step.
      const step=96/sun.shadow.mapSize.x;
      const sx=Math.round(x/step)*step, sz=Math.round(z/step)*step;
      const y=collision.groundAt(sx,sz);
      sun.position.set(sx-32,y+60,sz+25);
      sun.target.position.set(sx,y,sz);
      if (now>=nextEnvironmentUpdate) {
        nextEnvironmentUpdate=now+150;
        updateEnvironment(environment,x,z,[0.65,0.85,1][quality]);
      }
    },
    dispose() { streaming.dispose();regional.dispose(); disposeGeometry(environment); sun.shadow.dispose(); },
  };
}
