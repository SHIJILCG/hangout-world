import * as THREE from 'three';
import { animationPose } from './animation';

interface Rig {
  body: THREE.Group;
  leftArm: THREE.Group; rightArm: THREE.Group;
  leftLeg: THREE.Group; rightLeg: THREE.Group;
}
const rigs = new WeakMap<THREE.Group, Rig>();

export function createAvatar(color = 0x4f8ef7): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);
  const tunic = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe2b78e, roughness: 1, flatShading: true });
  const leather = new THREE.MeshStandardMaterial({ color: 0x493b32, roughness: 1, flatShading: true });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1e6bc, roughness: 1, flatShading: true });
  const eyes = new THREE.MeshBasicMaterial({ color: 0x25342b });

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }

  function oval(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number,
    radiusX: number, radiusY: number, radiusZ: number) {
    return mesh(parent, new THREE.SphereGeometry(1, 10, 6).scale(radiusX, radiusY, radiusZ), material, x, y, z);
  }

  const torsoProfile = [
    [0, 0.65], [0.24, 0.65], [0.265, 0.68], [0.235, 0.78],
    [0.255, 1.05], [0.22, 1.14], [0.12, 1.19], [0, 1.19],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  mesh(body, new THREE.LatheGeometry(torsoProfile, 12).scale(1, 1, 0.75), tunic, 0, 0, 0).name = 'tunic';
  mesh(body, new THREE.CylinderGeometry(0.24, 0.25, 0.065, 12).scale(1, 1, 0.78), leather, 0, 0.785, 0);
  oval(body, cream, 0, 0.785, 0.195, 0.055, 0.04, 0.018);
  mesh(body, new THREE.CylinderGeometry(0.09, 0.10, 0.12, 10), skin, 0, 1.2, 0);
  mesh(body, new THREE.SphereGeometry(0.255, 12, 8).scale(1, 0.98, 0.92), skin, 0, 1.42, 0).name = 'head';
  for (const x of [-0.25, 0.25]) oval(body, skin, x, 1.4, 0, 0.045, 0.065, 0.045);
  mesh(body, new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2)
    .scale(0.27, 0.14, 0.25), tunic, 0, 1.555, 0).name = 'cap';
  oval(body, cream, 0, 1.56, 0.19, 0.22, 0.025, 0.14);
  for (const x of [-0.085, 0.085]) oval(body, eyes, x, 1.44, 0.226, 0.02, 0.026, 0.014);
  oval(body, skin, 0, 1.375, 0.237, 0.03, 0.035, 0.043);
  mesh(body, new THREE.CapsuleGeometry(0.12, 0.12, 3, 8).scale(1, 1, 0.7), leather, 0, 0.96, -0.23);

  function limb(x: number, y: number, length: number, width: number, material: THREE.Material): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    mesh(pivot, new THREE.CapsuleGeometry(width / 2, length - width, 3, 8), material, 0, -length / 2, 0);
    body.add(pivot);
    return pivot;
  }
  const leftArm = limb(-0.29, 1.12, 0.36, 0.16, tunic);
  const rightArm = limb(0.29, 1.12, 0.36, 0.16, tunic);
  for (const arm of [leftArm, rightArm]) oval(arm, skin, 0, -0.405, 0, 0.071, 0.088, 0.069);
  const leftLeg = limb(-0.135, 0.67, 0.5, 0.17, leather);
  const rightLeg = limb(0.135, 0.67, 0.5, 0.17, leather);
  for (const leg of [leftLeg, rightLeg]) oval(leg, leather, 0, -0.58, 0.035, 0.105, 0.09, 0.15);
  for (const [name, part] of Object.entries({ leftArm, rightArm, leftLeg, rightLeg })) part.name = name;
  rigs.set(group, { body, leftArm, rightArm, leftLeg, rightLeg });

  return group;
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
