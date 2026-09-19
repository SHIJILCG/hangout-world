import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { animationPose } from '../src/player/animation';
import { animateAvatar, createAvatar, disposeAvatar } from '../src/player/avatar';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/player/controller';

describe('explorer animations', () => {
  it('has idle, opposite walking limbs, faster running, and a distinct jump pose', () => {
    expect(animationPose(0.4, 0, true).leftLeg).toBeCloseTo(0);
    const walk = animationPose(0.4, 4, true);
    expect(walk.leftLeg).toBeCloseTo(-walk.rightLeg);
    expect(walk.leftArm).toBeCloseTo(-walk.leftLeg);
    expect(animationPose(0.4, 8, true)).not.toEqual(walk);
    expect(animationPose(0.4, 4, false).leftArm).toBe(-0.8);
  });

  it('keeps the animated root at the feet without a speaking indicator', () => {
    const avatar = createAvatar();
    avatar.position.set(1, 2, 3);
    animateAvatar(avatar, 1, 8, false, 1 / 60);
    expect(avatar.position.toArray()).toEqual([1, 2, 3]);
    expect(avatar.getObjectByName('speaking-indicator')).toBeUndefined();
    disposeAvatar(avatar);
  });

  it('uses rounded low-poly shapes within the existing standing collision bounds', () => {
    const avatar = createAvatar(0xf07865);
    const bounds = new THREE.Box3().setFromObject(avatar);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeLessThanOrEqual(PLAYER_HEIGHT);
    expect(Math.max(Math.abs(bounds.min.x), bounds.max.x)).toBeLessThanOrEqual(PLAYER_RADIUS);
    expect(Math.max(Math.abs(bounds.min.z), bounds.max.z)).toBeLessThanOrEqual(PLAYER_RADIUS);
    let triangles = 0;
    avatar.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(object.geometry).not.toBeInstanceOf(THREE.BoxGeometry);
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      if (object.material instanceof THREE.MeshStandardMaterial) {
        expect(object.material.flatShading).toBe(true);
      }
    });
    expect(triangles).toBeLessThan(3000);
    const tunic = avatar.getObjectByName('tunic');
    expect(tunic).toBeInstanceOf(THREE.Mesh);
    if (tunic instanceof THREE.Mesh && tunic.material instanceof THREE.MeshStandardMaterial) {
      expect(tunic.material.color.getHex()).toBe(0xf07865);
    }
    disposeAvatar(avatar);
  });

  it('keeps the rounded limbs attached to the animated rig', () => {
    const avatar = createAvatar();
    const leftArm = avatar.getObjectByName('leftArm')!;
    const rightArm = avatar.getObjectByName('rightArm')!;
    const leftLeg = avatar.getObjectByName('leftLeg')!;
    const rightLeg = avatar.getObjectByName('rightLeg')!;
    const shoulder = leftArm.position.clone();
    animateAvatar(avatar, 0.4, 4, true, 1);
    expect(Math.abs(leftArm.rotation.x)).toBeGreaterThan(0.1);
    expect(leftArm.rotation.x).toBeCloseTo(-rightArm.rotation.x);
    expect(leftLeg.rotation.x).toBeCloseTo(-rightLeg.rotation.x);
    expect(leftArm.position.equals(shoulder)).toBe(true);
    animateAvatar(avatar, 0.4, 4, false, 1);
    expect(leftArm.rotation.x).toBeCloseTo(-0.8);
    expect(rightArm.rotation.x).toBeCloseTo(-0.8);
    expect(avatar.position.toArray()).toEqual([0, 0, 0]);
    disposeAvatar(avatar);
  });
});
