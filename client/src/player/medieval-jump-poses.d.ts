import type * as THREE from 'three';

export function createJumpClips(
  model: THREE.Object3D,
  idleClip: THREE.AnimationClip,
  options?: { fps?: number },
): Record<'jumpStart' | 'air' | 'land' | 'mounted' | 'driving', THREE.AnimationClip> | null;
