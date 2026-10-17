import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { StreamedMap } from '../src/world/streaming';

afterEach(()=> { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(failFirst = false) {
  const sections=Array.from({length:5},(_,i)=>({key:String(i),x:45+i*30,z:15,url:`/section-${i}.glb`}));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>sections}));
  vi.spyOn(performance,'now').mockReturnValue(0);
  const overview=new THREE.Group();
  const fallback=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  fallback.userData.chunk='0'; overview.add(fallback);
  const geometryDisposed=vi.fn();
  let failed=false;
  const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=> {
    if (String(url).includes('overview')) return {scene:overview} as unknown as GLTF;
    if (failFirst && !failed) { failed=true; throw new Error('temporary failure'); }
    const scene=new THREE.Group();
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
    mesh.geometry.addEventListener('dispose',geometryDisposed); scene.add(mesh);
    return {scene} as unknown as GLTF;
  });
  return {loader,fallback,geometryDisposed};
}

describe('map streaming',()=> {
  it('limits requests, swaps fallback terrain, and disposes distant sections',async()=> {
    const {fallback,geometryDisposed}=setup();
    const map=new StreamedMap(); await map.initialize();
    map.update(45,15,0,60);
    expect(map.pendingSections).toBe(2);
    await vi.waitFor(()=>expect(map.activeSections).toBe(2));
    expect(fallback.visible).toBe(false);
    map.update(-1000,-1000,6000,60);
    expect(map.activeSections).toBe(0);
    expect(fallback.visible).toBe(true);
    expect(geometryDisposed).toHaveBeenCalledTimes(2);
    map.dispose();
  });

  it('keeps fallback on failure and retries after the cooldown',async()=> {
    const {loader,fallback}=setup(true);
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    const map=new StreamedMap(); await map.initialize();
    map.update(45,15,0,1);
    await vi.waitFor(()=>expect(map.pendingSections).toBe(0));
    expect(fallback.visible).toBe(true);
    const count=loader.mock.calls.filter(([url])=>url==='/section-0.glb').length;
    map.update(45,15,5000,1);
    expect(loader.mock.calls.filter(([url])=>url==='/section-0.glb')).toHaveLength(count);
    map.update(45,15,11000,1);
    await vi.waitFor(()=>expect(fallback.visible).toBe(false));
    map.dispose();
  });
});
