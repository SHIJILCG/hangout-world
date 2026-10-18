import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RegionalAssets } from '../src/world/regionalAssets';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('applies catalog distance and shadow policies to streamed props',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
    catalog:{village_storage:{lodDistances:[22],maxDistance:45,castShadow:false}},
    sections:{'0,0':[{asset:'village_storage',x:15,y:0,z:15,scale:1,rotation:0}]},
  })}));
  const source=new THREE.Group();
  for(let lod=0;lod<2;lod++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
    mesh.name=`storage_LOD${lod}`;source.add(mesh);
  }
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:source} as unknown as GLTF);
  const assets=new RegionalAssets();await assets.initialize();assets.update(['0,0'],15,15,0,2);
  await vi.waitFor(()=>expect(assets.instanceCount).toBe(2));
  const children=()=>assets.group.children.flatMap(s=>s.children);
  for(const [x,time,expected] of [[15,300,0],[40,600,1],[70,900,-1]]){
    assets.update(['0,0'],x,15,time,2);
    expect(children().filter(c=>c.visible).map(c=>c.userData.detail.lod)).toEqual(expected<0?[]:[expected]);
    expect(children().every(c=>!c.castShadow)).toBe(true);
  }
  assets.dispose();
});

it('animates grass through one shared uniform and warms lanterns without extra lights',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({sections:{
    '0,0':[
      {asset:'grass',x:15,y:0,z:15,scale:1,rotation:0},
      {asset:'lantern',x:16,y:0,z:15,scale:1,rotation:0},
    ],
  }})}));
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async path=>{
    const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);
    mesh.name=String(path).includes('lantern')?'lantern_LOD0':'prop_LOD0';root.add(mesh);
    return {scene:root} as unknown as GLTF;
  });
  const assets=new RegionalAssets();await assets.initialize();assets.update(['0,0'],15,15,0,2);
  await vi.waitFor(()=>expect(assets.instanceCount).toBe(4));
  const meshes=assets.group.children[0].children as THREE.InstancedMesh[];
  const grass=meshes.find(mesh=>mesh.userData.detail.asset==='grass')!;
  const lantern=meshes.find(mesh=>mesh.userData.detail.asset==='lantern')!;
  const grassMaterial=grass.material as THREE.MeshStandardMaterial,lanternMaterial=lantern.material as THREE.MeshStandardMaterial;
  expect(grassMaterial.customProgramCacheKey()).toBe('hangout-grass-wind-v1');
  const shader={uniforms:{} as Record<string,{value:number}>,vertexShader:'#include <common>\n#include <begin_vertex>'};
  grassMaterial.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms,{} as THREE.WebGLRenderer);
  expect(shader.vertexShader).toContain('uEnvironmentWind');expect(shader.vertexShader).toContain('windFlex');
  expect(lanternMaterial.emissive.getHex()).toBe(0xffa447);expect(lanternMaterial.emissiveIntensity).toBe(0.55);
  assets.update(['0,0'],15,15,300,2);expect(shader.uniforms.uEnvironmentWind.value).toBe(0.3);
  assets.update(['0,0'],15,15,600,0);expect(shader.uniforms.uEnvironmentWind.value).toBe(0);
  assets.dispose();
});

it('selects one forest detail level at a time and hides distant trees',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({sections:{
    '0,0':[{asset:'forest_oak',x:10,y:0,z:10,scale:1,rotation:0}],
  }})}));
  const source=new THREE.Group();
  for(let lod=0;lod<3;lod++){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
    mesh.name=`forest_oak_LOD${lod}`;source.add(mesh);
  }
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:source} as unknown as GLTF);
  const assets=new RegionalAssets();await assets.initialize();
  const visible=()=>assets.group.children.flatMap(section=>section.children).filter(o=>o.visible).map(o=>o.userData.detail.lod);
  assets.update(['0,0'],15,15,0,2);
  await vi.waitFor(()=>expect(assets.instanceCount).toBe(3));
  expect(visible()).toEqual([]);
  for(const [x,now,lod] of [[15,300,0],[80,600,1],[140,900,2]]){
    assets.update(['0,0'],x,15,now,2);expect(visible()).toEqual([lod]);
  }
  assets.update(['0,0'],200,15,1200,2);expect(visible()).toEqual([]);assets.dispose();
});

function setup(){
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({sections:{
    '0,0':[{asset:'rock',x:10,y:0,z:10,scale:1,rotation:0}],
    '1,0':[{asset:'rock',x:35,y:0,z:10,scale:1,rotation:0}],
  }})}));
  const source=new THREE.Group(),geometry=new THREE.BoxGeometry();source.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));
  const disposed=vi.spyOn(geometry,'dispose');
  const loader=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockResolvedValue({scene:source} as unknown as GLTF);
  return {loader,disposed};
}

it('shares templates across sections and releases geometry only after the last section leaves',async()=>{
  const {loader,disposed}=setup();const assets=new RegionalAssets();await assets.initialize();
  assets.update(['0,0','1,0'],0,0,0,2);
  await vi.waitFor(()=>expect(assets.instanceCount).toBe(2));
  expect(loader).toHaveBeenCalledTimes(1);expect(assets.templateCount).toBe(1);
  assets.update(['1,0'],35,0,300,2);
  expect(assets.instanceCount).toBe(1);expect(disposed).not.toHaveBeenCalled();
  assets.update([],100,0,600,2);
  await vi.waitFor(()=>expect(disposed).toHaveBeenCalledTimes(1));
  expect(assets.templateCount).toBe(0);expect(assets.instanceCount).toBe(0);assets.dispose();
});

it('releases a template whose section was evicted while its request was pending',async()=>{
  const {loader,disposed}=setup();let complete!:(value:GLTF)=>void;
  const pending=new Promise<GLTF>(resolve=>{complete=resolve;});
  const source=new THREE.Group();const geometry=new THREE.BoxGeometry();source.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()));
  const cancelledDisposed=vi.spyOn(geometry,'dispose');loader.mockReturnValue(pending);
  const assets=new RegionalAssets();await assets.initialize();
  assets.update(['0,0'],0,0,0,2);assets.update([],200,0,300,2);
  complete({scene:source} as unknown as GLTF);
  await vi.waitFor(()=>expect(cancelledDisposed).toHaveBeenCalledTimes(1));
  expect(disposed).not.toHaveBeenCalled();expect(assets.templateCount).toBe(0);expect(assets.instanceCount).toBe(0);assets.dispose();
});
