import * as THREE from 'three';

// Jump animations built on the character's own skeleton, starting from its
// idle pose. Legs and spine only rotate about the character's side-to-side
// axis, so nothing twists; the IK feet follow their shins, so nothing stretches.
//
// A pose is { thigh: [left, right], knee: [left, right], lean, arms } in degrees:
//   thigh  + lifts the knee forward      knee  + bends the shin back
//   lean   + bends the upper body forward arms + raises the arms forward/up
// `planted` keeps the lowest foot on the ground (the body crouches down to it);
// otherwise the body stays at its normal height and the feet lift.

const DEG = Math.PI / 180;
const SIDE = new THREE.Vector3(1, 0, 0); // characters face +z, so x is their side axis

// Names as GLTFLoader sanitises them ("UpperLeg.L" -> "UpperLegL").
const BONES = {
  body: 'Body', spine: 'Abdomen',
  thigh: ['UpperLegL', 'UpperLegR'], shin: ['LowerLegL', 'LowerLegR'], foot: ['FootL', 'FootR'],
  arm: ['UpperArmL', 'UpperArmR'],
};

const STAND = { thigh: [0, 0], knee: [0, 0], lean: 0, arms: 0 };

// Keyframes: [time (s), pose, planted]
const CLIPS = {
  // Leaving the ground: legs push straight, arms swing up.
  jumpStart: { loop: false, keys: [
    [0, { thigh: [20, 20], knee: [40, 40], lean: 12, arms: -15 }, false],
    [0.18, { thigh: [-4, -4], knee: [6, 6], lean: -4, arms: 38 }, false],
  ] },
  // In the air: both knees tucked up, arms raised; a slight sway so it isn't frozen.
  air: { loop: true, keys: [
    [0, { thigh: [50, 44], knee: [86, 80], lean: 8, arms: 42 }, false],
    [0.4, { thigh: [45, 49], knee: [81, 85], lean: 10, arms: 46 }, false],
    [0.8, { thigh: [50, 44], knee: [86, 80], lean: 8, arms: 42 }, false],
  ] },
  // Touching down: knees bend with the feet planted, then stand back up.
  land: { loop: false, keys: [
    [0, { thigh: [30, 27], knee: [58, 54], lean: 12, arms: 30 }, true],
    [0.1, { thigh: [34, 32], knee: [66, 62], lean: 16, arms: 14 }, true],
    [0.38, STAND, true],
  ] },
};

const lerpPose = (a, b, t) => ({
  thigh: a.thigh.map((v, i) => v + (b.thigh[i] - v) * t),
  knee: a.knee.map((v, i) => v + (b.knee[i] - v) * t),
  lean: a.lean + (b.lean - a.lean) * t,
  arms: a.arms + (b.arms - a.arms) * t,
});

function poseAt(keys, time) {
  if (time <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1, planted] = keys[i];
    const [t0, p0] = keys[i - 1];
    if (time <= t1) {
      const u = (time - t0) / (t1 - t0);
      return [lerpPose(p0, p1, u * u * (3 - 2 * u)), planted]; // smoothstep
    }
  }
  const last = keys.at(-1);
  return [last[1], last[2]];
}

// Returns { jumpStart, air, land } AnimationClips for `model`, or null if the
// skeleton doesn't have the bones these poses need.
export function createJumpClips(model, idleClip, { fps = 30 } = {}) {
  const bones = new Map();
  model.traverse((o) => o.isBone && bones.set(o.name, o));
  const need = [BONES.body, BONES.spine, ...BONES.thigh, ...BONES.shin, ...BONES.foot, ...BONES.arm];
  if (!need.every((n) => bones.has(n))) return null;
  const bone = (n) => bones.get(n);

  // Idle pose: local transforms to start every frame from, world transforms to rotate.
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(idleClip).play();
  mixer.update(0);
  model.updateMatrixWorld(true);
  const idle = new Map();
  for (const [name, b] of bones) {
    idle.set(name, {
      q: b.quaternion.clone(), p: b.position.clone(),
      wq: b.getWorldQuaternion(new THREE.Quaternion()), wp: b.getWorldPosition(new THREE.Vector3()),
    });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model);

  // Where each foot sits relative to its shin, so it can follow the shin.
  const footOffset = BONES.foot.map((f, i) => {
    const s = idle.get(BONES.shin[i]);
    const toShin = new THREE.Matrix4().compose(s.wp, s.wq, new THREE.Vector3(1, 1, 1)).invert();
    return idle.get(f).wp.clone().applyMatrix4(toShin);
  });

  const q = new THREE.Quaternion(), pq = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  // Set a bone's world rotation to `angle` about the side axis on top of its idle world rotation.
  const rotate = (name, angle) => {
    const b = bone(name);
    q.setFromAxisAngle(SIDE, angle).multiply(idle.get(name).wq);
    b.parent.getWorldQuaternion(pq);
    b.quaternion.copy(pq.invert().multiply(q));
    b.updateMatrixWorld(true);
  };
  const setWorldPosition = (name, world) => {
    const b = bone(name);
    b.position.copy(b.parent.worldToLocal(world.clone()));
    b.updateMatrixWorld(true);
  };

  const apply = (pose, drop) => {
    for (const [name, b] of bones) {
      b.quaternion.copy(idle.get(name).q);
      b.position.copy(idle.get(name).p);
    }
    model.updateMatrixWorld(true);
    setWorldPosition(BONES.body, idle.get(BONES.body).wp.clone().add(new THREE.Vector3(0, -drop, 0)));
    rotate(BONES.spine, pose.lean * DEG);
    for (let i = 0; i < 2; i++) {
      // thigh + lifts the knee toward +z (forward), which is a negative turn about +x
      rotate(BONES.thigh[i], -pose.thigh[i] * DEG);
      rotate(BONES.shin[i], (-pose.thigh[i] + pose.knee[i]) * DEG);
      const shin = bone(BONES.shin[i]);
      m.compose(shin.getWorldPosition(new THREE.Vector3()), shin.getWorldQuaternion(new THREE.Quaternion()), one);
      setWorldPosition(BONES.foot[i], footOffset[i].clone().applyMatrix4(m));
      rotate(BONES.foot[i], 0); // keep the foot level
      rotate(BONES.arm[i], -pose.arms * DEG);
    }
  };

  const lowestFootLift = () => Math.min(...BONES.foot.map((f) => bone(f).getWorldPosition(new THREE.Vector3()).y - idle.get(f).wp.y));

  const clips = {};
  for (const [state, { keys }] of Object.entries(CLIPS)) {
    const duration = keys.at(-1)[0];
    const frames = Math.max(2, Math.round(duration * fps) + 1);
    const times = new Float32Array(frames);
    const quats = new Map([...bones.keys()].map((n) => [n, new Float32Array(frames * 4)]));
    const bodyPos = new Float32Array(frames * 3);
    const footPos = BONES.foot.map(() => new Float32Array(frames * 3));
    for (let f = 0; f < frames; f++) {
      const t = (f / (frames - 1)) * duration;
      times[f] = t;
      const [pose, planted] = poseAt(keys, t);
      apply(pose, 0);
      if (planted) apply(pose, lowestFootLift()); // crouch down until the lowest foot is on the ground
      for (const [name, b] of bones) b.quaternion.toArray(quats.get(name), f * 4);
      bone(BONES.body).position.toArray(bodyPos, f * 3);
      BONES.foot.forEach((n, i) => bone(n).position.toArray(footPos[i], f * 3));
    }
    const tracks = [...bones.keys()].map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, quats.get(n)));
    tracks.push(new THREE.VectorKeyframeTrack(`${BONES.body}.position`, times, bodyPos));
    BONES.foot.forEach((n, i) => tracks.push(new THREE.VectorKeyframeTrack(`${n}.position`, times, footPos[i])));
    clips[state] = new THREE.AnimationClip(state, duration, tracks);
  }

  // Leave the model in its idle pose.
  for (const [name, b] of bones) {
    b.quaternion.copy(idle.get(name).q);
    b.position.copy(idle.get(name).p);
  }
  model.updateMatrixWorld(true);
  return clips;
}
