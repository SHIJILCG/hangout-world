import * as THREE from 'three';
import { PLAYER_HEIGHT } from './controller';

export const BUBBLE_SECONDS = 5;
export const BUBBLE_MAX_CHARS = 80;

const BUBBLE_NAME = 'chat-bubble';

function disposeBubble(bubble: THREE.Object3D): void {
  const sprite = bubble as THREE.Sprite;
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
  clearTimeout((sprite.userData.timer as ReturnType<typeof setTimeout>));
}

export function showBubble(parent: THREE.Group, text: string): void {
  const existing = parent.getObjectByName(BUBBLE_NAME);
  if (existing) {
    disposeBubble(existing);
    parent.remove(existing);
  }

  const shown = text.length > BUBBLE_MAX_CHARS ? text.slice(0, BUBBLE_MAX_CHARS - 1) + '…' : text;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 96, 20);
  ctx.fill();
  ctx.font = '28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(shown, 256, 50, 492);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true }));
  sprite.name = BUBBLE_NAME;
  sprite.scale.set(2.2, 0.42, 1);
  sprite.position.set(0, PLAYER_HEIGHT + 0.95, 0);
  sprite.userData.timer = setTimeout(() => {
    disposeBubble(sprite);
    parent.remove(sprite);
  }, BUBBLE_SECONDS * 1000);

  parent.add(sprite);
}
