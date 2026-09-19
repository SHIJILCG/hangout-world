import * as THREE from 'three';
import { PLAYER_HEIGHT } from './controller';

export const BUBBLE_SECONDS = 5;
export const BUBBLE_MAX_CHARS = 80;

const BUBBLE_NAME = 'chat-bubble';
const CANVAS_WIDTH = 560;
const PADDING = 24;
const LINE_HEIGHT = 48;
const SCREEN_WIDTH = 280;

function wrapText(text: string, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= CANVAS_WIDTH - PADDING * 2) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && measure(line + character) > CANVAS_WIDTH - PADDING * 2) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function disposeBubble(bubble: THREE.Object3D): void {
  const sprite = bubble as THREE.Sprite;
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
  clearTimeout((sprite.userData.timer as ReturnType<typeof setTimeout>));
}

export function hideBubble(parent: THREE.Group): void {
  const existing = parent.getObjectByName(BUBBLE_NAME);
  if (existing) {
    disposeBubble(existing);
    parent.remove(existing);
  }
}

export function showBubble(parent: THREE.Group, text: string): void {
  hideBubble(parent);
  const shown = text.length > BUBBLE_MAX_CHARS ? text.slice(0, BUBBLE_MAX_CHARS - 1) + '…' : text;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  const ctx = canvas.getContext('2d')!;
  const font = '600 36px system-ui, sans-serif';
  ctx.font = font;
  const lines = wrapText(shown, (line) => ctx.measureText(line).width);
  canvas.height = lines.length * LINE_HEIGHT + PADDING * 2;
  ctx.fillStyle = '#18382f';
  ctx.beginPath();
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 20);
  ctx.fill();
  ctx.strokeStyle = '#fff5da';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, PADDING + LINE_HEIGHT * (index + 0.5));
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    sizeAttenuation: false,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  }));
  sprite.name = BUBBLE_NAME;
  sprite.center.set(0.5, 0);
  sprite.frustumCulled = false;
  sprite.position.set(0, PLAYER_HEIGHT + 0.95, 0);
  // Keep text at 18 CSS pixels regardless of camera distance or device pixel ratio.
  sprite.onBeforeRender = (renderer, _scene, camera) => {
    const viewport = renderer.domElement;
    const width = Math.min(SCREEN_WIDTH, Math.max(1, viewport.clientWidth - 32));
    const scale = 2 * width / (Math.max(1, viewport.clientHeight) * camera.projectionMatrix.elements[5]);
    sprite.scale.set(scale, scale * canvas.height / canvas.width, 1);
    sprite.updateMatrixWorld();
  };
  sprite.userData.timer = setTimeout(() => {
    disposeBubble(sprite);
    parent.remove(sprite);
  }, BUBBLE_SECONDS * 1000);

  parent.add(sprite);
}
