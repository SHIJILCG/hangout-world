import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { animateAvatar, avatarModelPath, createAvatar, disposeAvatar } from '../src/player/avatar';

describe('player animation', () => {
  it('maps the existing network character indexes to the six licensed model files', () => {
    expect(Array.from({ length: 7 }, (_, index) => avatarModelPath(index))).toEqual([
      '/characters/Adventurer_Male.glb',
      '/characters/Adventurer_Female.glb',
      '/characters/Farmer.glb',
      '/characters/King.glb',
      '/characters/Hooded_Adventurer.glb',
      '/characters/Villager_Woman.glb',
      '/characters/Witch.glb',
    ]);
    expect(avatarModelPath(99)).toBe('/characters/Adventurer_Male.glb');
  });

  it('creates a feet-origin character root and leaves physics placement untouched', () => {
    const avatar = createAvatar();
    avatar.position.set(1, 2, 3);
    animateAvatar(avatar, 1, 8, false, 1 / 60);
    expect(avatar.name).toBe('medieval-avatar');
    expect(avatar.position.toArray()).toEqual([1, 2, 3]);
    expect(avatar.children).toHaveLength(0);
    disposeAvatar(avatar);
  });

  it('disposes model geometry and materials when a player leaves', () => {
    const avatar = createAvatar();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    avatar.add(new THREE.Mesh(geometry, material));
    disposeAvatar(avatar);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });
});
