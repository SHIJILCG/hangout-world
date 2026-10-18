import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_HEIGHT } from './controller';
import { createJumpClips } from './medieval-jump-poses.js';

interface AvatarAnimation {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current?: THREE.AnimationAction;
  state?: string;
  grounded: boolean;
  airTime: number;
  landTime: number;
  jumpStartDuration: number;
}

const animations = new WeakMap<THREE.Group, AvatarAnimation>();
const templates = new Map<string, Promise<GLTF>>();

function loadTemplate(path: string): Promise<GLTF> {
  let template=templates.get(path);
  if (!template) {
    template=new GLTFLoader().loadAsync(path).catch(error=> { templates.delete(path); throw error; });
    templates.set(path,template);
  }
  return template;
}
const CHARACTER_MODELS = [
  'Adventurer_Male.glb', 'Adventurer_Female.glb', 'Farmer.glb',
  'King.glb', 'Hooded_Adventurer.glb', 'Villager_Woman.glb', 'Witch.glb',
] as const;

export function avatarModelPath(characterIndex = 0): string {
  return `/characters/${CHARACTER_MODELS[characterIndex] ?? CHARACTER_MODELS[0]}`;
}

/** Create a feet-origin player root; the GLB is attached by loadAvatar(). */
export function createAvatar(_overallsColor = 0x4f8ef7): THREE.Group {
  const root = new THREE.Group();
  root.name = 'medieval-avatar';
  return root;
}

/** Load and scale the licensed character asset to the existing player capsule. */
export async function loadAvatar(root: THREE.Group, characterIndex = 0): Promise<void> {
  if (root.userData.avatarLoad) return root.userData.avatarLoad as Promise<void>;

  const modelPath = avatarModelPath(characterIndex);
  const modelFile = modelPath.split('/').pop()!;
  const loading = loadTemplate(modelPath).then((gltf) => {
    if (root.userData.avatarDisposed) return;
    // Independent skeletons/mixers; immutable mesh resources stay in the template cache.
    const model = clone(gltf.scene);
    model.name = modelFile.replace('.glb', '');
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.userData.sharedAvatar = true;
        object.castShadow = true;
        object.receiveShadow = true;
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      }
    });

    const clips = new Map(gltf.animations.map((clip) => [clip.name.split('|').pop()!, clip]));
    const jumpClips = clips.get('Idle') ? createJumpClips(model, clips.get('Idle')!) : null;
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const state of ['Idle', 'Walk', 'Run', 'jumpStart', 'air', 'land', 'mounted', 'driving']) {
      const clip = jumpClips?.[state as 'jumpStart' | 'air' | 'land' | 'mounted' | 'driving'] ?? clips.get(state);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      const oneShot = state === 'jumpStart' || state === 'land';
      action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
      action.clampWhenFinished = oneShot;
      actions.set(state.toLowerCase(), action);
    }

    const idle = actions.get('idle');
    idle?.play();
    mixer.update(0);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty() || bounds.max.y <= bounds.min.y) {
      throw new Error('The medieval character model has no measurable geometry.');
    }
    const scale = PLAYER_HEIGHT / (bounds.max.y - bounds.min.y);
    model.scale.multiplyScalar(scale);
    model.position.y = -bounds.min.y * scale;
    mixer.stopAllAction();
    root.add(model);
    animations.set(root, {
      mixer,
      actions,
      grounded: true,
      airTime: 0,
      landTime: 0,
      jumpStartDuration: actions.get('jumpstart')?.getClip().duration ?? 0,
    });
    playAnimation(root, 'idle', 0);
  });

  root.userData.avatarLoad = loading;
  try {
    await loading;
  } catch (error) {
    delete root.userData.avatarLoad;
    throw error;
  }
}

function playAnimation(root: THREE.Group, state: string, fade = 0.16): void {
  const rig = animations.get(root);
  const next = rig?.actions.get(state);
  if (!rig || !next || next === rig.current) return;
  const previous = rig.current;
  next.reset().fadeIn(fade).play();
  previous?.fadeOut(fade);
  rig.current = next;
  rig.state = state;
}

export function animateAvatar(root: THREE.Group, _time: number, speed: number, onGround: boolean, dt: number): void {
  const rig = animations.get(root);
  if (!rig) return;
  if(root.userData.mounted){playAnimation(root,root.userData.driving?'driving':'mounted');rig.grounded=true;rig.landTime=0;rig.mixer.update(dt);return;}
  let state: string;
  if (!onGround) {
    if (rig.grounded) rig.airTime = 0;
    rig.grounded = false;
    rig.airTime += dt;
    state = rig.airTime < rig.jumpStartDuration ? 'jumpstart' : 'air';
  } else {
    if (!rig.grounded) rig.landTime = rig.actions.has('land') ? 0.3 : 0;
    rig.grounded = true;
    rig.landTime = Math.max(0, rig.landTime - dt);
    state = rig.landTime > 0 ? 'land' : speed < 0.15 ? 'idle' : speed > 5.7 ? 'run' : 'walk';
  }
  playAnimation(root, state);
  rig.mixer.update(dt);
}

export function disposeAvatar(root: THREE.Group): void {
  root.userData.avatarDisposed = true;
  const rig = animations.get(root);
  if (rig) {
    rig.mixer.stopAllAction();
    rig.mixer.uncacheRoot(root.children[0] ?? root);
    animations.delete(root);
  }
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    if (object.userData.sharedAvatar) return;
    if (object instanceof THREE.Mesh) object.geometry.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      }
    }
  });
  delete root.userData.avatarLoad;
}
