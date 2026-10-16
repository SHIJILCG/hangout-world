import * as THREE from 'three';
import { animationPose } from './animation';

interface Rig {
  body: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

const rigs = new WeakMap<THREE.Group, Rig>();

export function createAvatar(overallsColor = 0x4f8ef7): THREE.Group {
  const root = new THREE.Group();
  root.name = 'default-avatar';

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  const yellow = new THREE.MeshStandardMaterial({ color: 0xffd329, roughness: 0.86, flatShading: true });
  const overalls = new THREE.MeshStandardMaterial({ color: overallsColor, roughness: 0.95, flatShading: true });
  const black = new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: 0.9, flatShading: true });
  const goggle = new THREE.MeshStandardMaterial({ color: 0x68747a, metalness: 0.45, roughness: 0.42, flatShading: true });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xfffbef, roughness: 0.68, flatShading: true });
  const iris = new THREE.MeshStandardMaterial({ color: 0x86532f, roughness: 0.75, flatShading: true });

  function addMesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
    position: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // One simple, rounded yellow body with a single goggle and blue overalls.
  addMesh(body, new THREE.CapsuleGeometry(0.31, 0.52, 4, 10), yellow, 'yellow-body', [0, 1.08, 0]);
  addMesh(body, new THREE.CylinderGeometry(0.285, 0.31, 0.52, 10), overalls, 'overalls', [0, 0.81, 0]);
  addMesh(body, new THREE.CapsuleGeometry(0.08, 0.025, 3, 8), overalls, 'overall-pocket', [0, 0.96, 0.294]);

  for (const side of [-1, 1]) {
    const strap = addMesh(body, new THREE.CapsuleGeometry(0.035, 0.19, 3, 7), overalls,
      side < 0 ? 'left-strap' : 'right-strap', [side * 0.155, 1.18, 0.185]);
    strap.rotation.z = side * -0.12;
  }

  const rim = addMesh(body, new THREE.TorusGeometry(0.148, 0.034, 6, 12), goggle, 'goggle-rim', [0, 1.43, 0.275]);
  rim.scale.set(1, 1, 0.75);
  addMesh(body, new THREE.SphereGeometry(0.128, 10, 6), eyeWhite, 'single-eye', [0, 1.43, 0.24]);
  addMesh(body, new THREE.SphereGeometry(0.067, 8, 5), iris, 'iris', [0.014, 1.43, 0.32]);
  addMesh(body, new THREE.SphereGeometry(0.034, 8, 5), black, 'pupil', [0.018, 1.43, 0.365]);
  addMesh(body, new THREE.SphereGeometry(0.012, 6, 4), eyeWhite, 'eye-highlight', [-0.004, 1.456, 0.386]);

  function limb(
    name: string,
    x: number,
    y: number,
    length: number,
    width: number,
    material: THREE.Material,
    foot?: boolean,
  ): THREE.Group {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, 0);
    addMesh(pivot, new THREE.CapsuleGeometry(width / 2, length - width, 3, 8), material,
      `${name}-segment`, [0, -length / 2, 0]);
    if (foot) {
    addMesh(pivot, new THREE.SphereGeometry(1, 8, 5).scale(0.105, 0.075, 0.15), black,
        `${name}-boot`, [0, -0.495, 0.045]);
    } else {
      addMesh(pivot, new THREE.SphereGeometry(1, 8, 5).scale(0.075, 0.09, 0.07), black,
        `${name}-glove`, [0, -0.385, 0.015]);
    }
    body.add(pivot);
    return pivot;
  }

  const leftArm = limb('leftArm', -0.285, 1.17, 0.39, 0.15, yellow);
  const rightArm = limb('rightArm', 0.285, 1.17, 0.39, 0.15, yellow);
  const leftLeg = limb('leftLeg', -0.135, 0.57, 0.5, 0.17, overalls, true);
  const rightLeg = limb('rightLeg', 0.135, 0.57, 0.5, 0.17, overalls, true);

  rigs.set(root, { body, leftArm, rightArm, leftLeg, rightLeg });
  return root;
}

export function animateAvatar(root: THREE.Group, time: number, speed: number, onGround: boolean, dt: number): void {
  const rig = rigs.get(root);
  if (!rig) return;
  const pose = animationPose(time, speed, onGround);
  const blend = 1 - Math.exp(-15 * dt);
  for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const) {
    rig[name].rotation.x += (pose[name] - rig[name].rotation.x) * blend;
  }
  rig.body.position.y += (pose.bob - rig.body.position.y) * blend;
  rig.body.rotation.x += (pose.lean - rig.body.rotation.x) * blend;
}

export function disposeAvatar(root: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  for (const material of materials) {
    if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
    material.dispose();
  }
  rigs.delete(root);
}
