import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createGrass, GRASS_DISTANCES, grassDensityStride } from '../src/world/grass';

it('keeps deterministic opaque clumps within the existing triangle budget',()=>{
  const a=createGrass(),b=createGrass();
  a.children.forEach((child,lod)=>{
    const mesh=child as THREE.Mesh,other=b.children[lod] as THREE.Mesh;
    expect(mesh.geometry.getAttribute('position').count/3).toBe(6-lod*2);
    expect(mesh.geometry.getAttribute('position').array).toEqual(other.geometry.getAttribute('position').array);
    expect(mesh.geometry.getAttribute('color').count).toBe(mesh.geometry.getAttribute('position').count);
    const material=mesh.material as THREE.MeshStandardMaterial;
    expect(material).toBe((a.children[0] as THREE.Mesh).material);
    expect(material.vertexColors).toBe(true);
    expect(material.transparent).toBe(false);
    expect(material.alphaTest).toBe(0);
    expect(material.map).toBeNull();
    expect(mesh.castShadow).toBe(false);
  });
});

it('uses nested deterministic density subsets and a bounded range',()=>{
  const indices=Array.from({length:16},(_,i)=>i);
  const levels=[0,1,2].map(lod=>indices.filter(i=>i%grassDensityStride(lod)===0));
  expect(levels.map(l=>l.length)).toEqual([16,16,8]);
  expect(levels[2].every(i=>levels[1].includes(i))).toBe(true);
  expect(GRASS_DISTANCES).toEqual([0,28,52,75]);
});
