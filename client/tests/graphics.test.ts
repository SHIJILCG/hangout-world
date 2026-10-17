// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGraphics } from '../src/ui/graphics';
import type { WorldMap } from '../src/world/map';

afterEach(()=> { vi.restoreAllMocks(); localStorage.clear(); document.body.innerHTML=''; });

it('switches resolution presets and resets Auto instead of retaining High DPR',()=> {
  vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(2);
  const setPixelRatio=vi.fn();
  const renderer={setPixelRatio} as unknown as THREE.WebGLRenderer;
  const map={sun:new THREE.DirectionalLight()} as unknown as WorldMap;
  const graphics=createGraphics(renderer,map,document.body);
  const select=document.querySelector('select')!;
  const change=(value:string)=> { select.value=value; select.dispatchEvent(new Event('change')); };
  change('0'); expect(setPixelRatio).toHaveBeenLastCalledWith(1);
  expect(map.sun.shadow.mapSize.x).toBe(1024);
  change('1'); expect(setPixelRatio).toHaveBeenLastCalledWith(1.5);
  change('2'); expect(setPixelRatio).toHaveBeenLastCalledWith(2);
  expect(map.sun.shadow.mapSize.x).toBe(2048);
  change('auto'); expect(setPixelRatio).toHaveBeenLastCalledWith(1.5);
  expect(graphics.quality).toBe(1);
  graphics.dispose();
});
