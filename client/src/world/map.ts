import * as THREE from 'three';
import { CollisionWorld, STEP_HEIGHT, type Box } from './collision';

export const WORLD_HALF = 30;
export const SPAWN = { x: 0, y: 0, z: 8 };

export interface WorldMap {
  group: THREE.Group;
  collision: CollisionWorld;
}

export function buildMap(): WorldMap {
  const group = new THREE.Group();
  const boxes: Box[] = [];

  const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

  // Solid box: mesh + collision from the same numbers.
  function solid(cx: number, cz: number, w: number, h: number, d: number, color: number, baseY = 0): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(cx, baseY + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    boxes.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minY: baseY, maxY: baseY + h,
      minZ: cz - d / 2, maxZ: cz + d / 2,
    });
  }

  // Stairs along +z: each step rise ≤ STEP_HEIGHT so the controller climbs them.
  function stairs(cx: number, zStart: number, width: number, steps: number, rise: number, run: number, color: number): void {
    for (let i = 0; i < steps; i++) {
      solid(cx, zStart - i * run, width, rise * (i + 1), run, color);
    }
  }

  // --- Ground: grass with a stone plaza circle (visual only, both flat) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    mat(0x67a95c)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40), mat(0xb9b3a8));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;           // avoid z-fighting with the grass
  plaza.receiveShadow = true;
  group.add(plaza);

  // --- Central stage platform (1.5 m high) with stairs on its +z side ---
  // Stage occupies z ∈ [-17, -11]. The stairs descend AWAY from the stage
  // (+z direction): the tallest step (top 1.5 = stage height) sits flush
  // against the stage face at z = -11, the lowest step is nearest the
  // plaza. Steps must never overlap the stage footprint — the stage's
  // tall collision box would push the player off mid-climb.
  solid(0, -14, 10, 1.5, 6, 0x8a6f4d);
  const rise = STEP_HEIGHT - 0.05;   // 0.3 m per step, climbable without jumping
  stairs(0, -7.4, 4, 5, rise, 0.8, 0x9c8258);   // step 5 spans z ∈ [-11.0, -10.2]

  // --- Scattered jump platforms ---
  solid(12, 4, 3, 0.6, 3, 0x7f8c9b);
  solid(15.5, 1, 3, 1.2, 3, 0x7f8c9b);
  solid(-13, -3, 4, 0.9, 4, 0x7f8c9b);

  // --- Benches around the plaza (low, steppable — that's fine) ---
  solid(6, 6, 2.4, 0.5, 0.8, 0x6b4a2f);
  solid(-6, 6, 2.4, 0.5, 0.8, 0x6b4a2f);
  solid(0, 10.5, 2.4, 0.5, 0.8, 0x6b4a2f);

  // --- Trees: cone canopy + trunk; only the trunk collides ---
  const treeSpots: Array<[number, number]> = [
    [-20, 12], [-22, -8], [20, -12], [22, 14], [-10, 20], [14, 18],
  ];
  for (const [tx, tz] of treeSpots) {
    solid(tx, tz, 0.6, 2, 0.6, 0x5b3d26);                       // trunk
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 8), mat(0x3e7d3a));
    canopy.position.set(tx, 4, tz);
    canopy.castShadow = true;
    group.add(canopy);
  }

  // --- Border walls (tall, keep players inside) ---
  const wallH = 4;
  const wallT = 1;
  solid(0, -WORLD_HALF - wallT / 2, WORLD_HALF * 2 + 2, wallH, wallT, 0x9a9a9a);
  solid(0, WORLD_HALF + wallT / 2, WORLD_HALF * 2 + 2, wallH, wallT, 0x9a9a9a);
  solid(-WORLD_HALF - wallT / 2, 0, wallT, wallH, WORLD_HALF * 2 + 2, 0x9a9a9a);
  solid(WORLD_HALF + wallT / 2, 0, wallT, wallH, WORLD_HALF * 2 + 2, 0x9a9a9a);

  // --- Lighting ---
  group.add(new THREE.HemisphereLight(0xbfd9ff, 0x557744, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.mapSize.set(2048, 2048);
  group.add(sun);

  return { group, collision: new CollisionWorld(boxes) };
}
