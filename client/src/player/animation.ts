export interface AnimationPose {
  leftArm: number; rightArm: number; leftLeg: number; rightLeg: number;
  bob: number; lean: number;
}

export function animationPose(time: number, speed: number, onGround: boolean): AnimationPose {
  if (!onGround) return { leftArm: -0.8, rightArm: -0.8, leftLeg: -0.35, rightLeg: 0.3, bob: 0, lean: 0.12 };
  const amount = Math.min(1, Math.max(0, speed) / 4);
  const stride = Math.sin(time * (speed > 5 ? 13 : 9)) * 0.65 * amount;
  return {
    leftArm: -stride, rightArm: stride, leftLeg: stride, rightLeg: -stride,
    bob: Math.abs(Math.sin(time * (speed > 5 ? 13 : 9))) * 0.035 * amount + Math.sin(time * 2) * 0.006 * (1 - amount),
    lean: Math.min(0.15, speed * 0.015),
  };
}
