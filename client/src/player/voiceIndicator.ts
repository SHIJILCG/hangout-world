import * as THREE from 'three';
import { PLAYER_HEIGHT } from './controller';

const INDICATOR = 'voice-indicator';

export function addVoiceIndicator(parent: THREE.Group): void {
  if (parent.getObjectByName(INDICATOR)) return;
  const indicator = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.18, 16),
    new THREE.MeshBasicMaterial({ color: 0x8ff0a4, side: THREE.DoubleSide, transparent: true, opacity: 0 }),
  );
  indicator.name = INDICATOR;
  indicator.position.set(0, PLAYER_HEIGHT + 1.45, 0);
  indicator.rotation.x = -Math.PI / 2;
  parent.add(indicator);
}

export function setSpeaking(parent: THREE.Group, speaking: boolean): void {
  const indicator = parent.getObjectByName(INDICATOR) as THREE.Mesh | undefined;
  if (!indicator) return;
  (indicator.material as THREE.MeshBasicMaterial).opacity = speaking ? 1 : 0;
}
