// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { BUBBLE_MAX_CHARS, BUBBLE_SECONDS, hideBubble, showBubble } from '../src/player/chatBubble';
import { PLAYER_HEIGHT } from '../src/player/controller';

describe('overhead chat bubbles', () => {
  const context = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
    textAlign: 'center', textBaseline: 'middle',
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: (text: string) => ({ width: Array.from(text).length * 20 }),
  };
  let parent: THREE.Group;
  const bubble = () => parent.getObjectByName('chat-bubble') as THREE.Sprite;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const element = createElement(tag, options);
      if (element instanceof HTMLCanvasElement) {
        Object.defineProperty(element, 'getContext', { value: () => context });
      }
      return element;
    });
    parent = new THREE.Group();
  });

  afterEach(() => {
    hideBubble(parent);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('wraps long messages without horizontally squeezing the letters', () => {
    const message = 'This meadow looks beautiful and the messages should be easy to read.';
    showBubble(parent, message);
    const lines = context.fillText.mock.calls.map(([line]) => line as string);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(message);
    for (const line of lines) expect(context.measureText(line).width).toBeLessThanOrEqual(512);
    for (const call of context.fillText.mock.calls) expect(call).toHaveLength(3);
    expect(context.font).toBe('600 36px system-ui, sans-serif');
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.stroke).toHaveBeenCalledOnce();
  });

  it('wraps unbroken words and retains the existing message limit', () => {
    showBubble(parent, 'W'.repeat(120));
    const lines = context.fillText.mock.calls.map(([line]) => line as string);
    expect(lines.join('')).toBe('W'.repeat(BUBBLE_MAX_CHARS - 1) + '\u2026');
    for (const line of lines) expect(context.measureText(line).width).toBeLessThanOrEqual(512);
  });

  it('keeps high contrast and screen size without drawing through scenery', () => {
    showBubble(parent, 'Hello meadow');
    const sprite = bubble();
    expect(sprite.material).toMatchObject({
      sizeAttenuation: false, depthTest: true, depthWrite: false, toneMapped: false, fog: false,
    });
    expect(sprite.material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(sprite.center.toArray()).toEqual([0.5, 0]);
    expect(sprite.position.y).toBe(PLAYER_HEIGHT + 0.95);

    const domElement = document.createElement('canvas');
    Object.defineProperties(domElement, {
      clientWidth: { value: 960 }, clientHeight: { value: 720 },
    });
    const renderer = { domElement } as THREE.WebGLRenderer;
    const camera = new THREE.PerspectiveCamera(60, 960 / 720, 0.1, 400);
    for (const distance of [2, 6, 10, 40]) {
      camera.position.z = distance;
      sprite.onBeforeRender(renderer, new THREE.Scene(), camera, sprite.geometry, sprite.material, new THREE.Group());
      const screenWidth = sprite.scale.x * camera.projectionMatrix.elements[5] * 720 / 2;
      expect(screenWidth).toBeCloseTo(280);
      expect(sprite.scale.y / sprite.scale.x).toBeCloseTo(96 / 560);
    }
  });

  it('replaces, expires, and hides bubbles without leaking timers or textures', () => {
    showBubble(parent, 'First message');
    const first = bubble();
    const textureDispose = vi.spyOn(first.material.map!, 'dispose');
    const materialDispose = vi.spyOn(first.material, 'dispose');
    showBubble(parent, 'Second message');
    expect(parent.children).toHaveLength(1);
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(BUBBLE_SECONDS * 1000);
    expect(parent.children).toHaveLength(0);
    showBubble(parent, 'Blocked message');
    hideBubble(parent);
    expect(parent.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
