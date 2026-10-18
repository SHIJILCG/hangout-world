import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import world from '../../../shared/world.json' with {type:'json'};
import { splitScenery } from './chunks.mjs';
import { decodeGLB } from './glb.mjs';
import { pathDistance } from './scene.mjs';

test('long scenery is clipped without losing surface area or crossing section boundaries',()=>{
  const geometry=new THREE.PlaneGeometry(240,4).rotateX(-Math.PI/2).toNonIndexed();
  const colors=new Float32Array(geometry.attributes.position.count*3).fill(0.5);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const parts=splitScenery({name:'river',geometry,extras:{}});
  let area=0;
  for(const [key,part] of parts){
    const [x,z]=key.split(',').map(Number),p=part.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      assert.ok(p.getX(i)>=x*world.sectionSize-1e-5&&p.getX(i)<=(x+1)*world.sectionSize+1e-5);
      assert.ok(p.getZ(i)>=z*world.sectionSize-1e-5&&p.getZ(i)<=(z+1)*world.sectionSize+1e-5);
    }
    for(let i=0;i<p.count;i+=3)area+=new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j))).getArea();
    part.geometry.dispose();
  }
  assert.ok(Math.abs(area-960)<0.01);geometry.dispose();
});

test('all map sections exist and retain the terrain sampling budget',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../../public/models/chunks/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.length,(world.half*2/world.sectionSize)**2);
  assert.equal(new Set(manifest.map(s=>s.key)).size,manifest.length);
  for(const section of manifest){
    const glb=decodeGLB(await readFile(new URL(`../../public${section.url}`,import.meta.url)));
    const terrain=glb.json.nodes.find(n=>n.extras.terrain);
    const primitive=glb.json.meshes[terrain.mesh].primitives[0];
    const accessor=glb.json.accessors[primitive.attributes.POSITION];
    assert.ok(accessor.count/3<1500,'Terrain section triangle budget exceeded');
    assert.ok(accessor.min[0]>=section.x-world.sectionSize/2-1e-5);
    assert.ok(accessor.max[0]<=section.x+world.sectionSize/2+1e-5);
    assert.ok(accessor.min[2]>=section.z-world.sectionSize/2-1e-5);
    assert.ok(accessor.max[2]<=section.z+world.sectionSize/2+1e-5);
  }
});

test('regional blocking props preserve road clearance and the binary heightfield matches the manifest',async()=>{
  const layout=JSON.parse(await readFile(new URL('../../public/models/regions.json',import.meta.url),'utf8'));
  assert.ok(['North Woods','Pine Grove','Birch Copse'].every(name=>layout.places.some(place=>place.name===name)));
  for(const p of Object.values(layout.sections).flat()){
    assert.ok(Math.abs(p.x)<world.half&&Math.abs(p.z)<world.half);
    if(['tree','apple'].includes(p.asset)||/^forest_(oak|pine|birch)$/.test(p.asset))assert.ok(pathDistance(p.x,p.z)>=5);
    if(layout.catalog?.[p.asset]?.collider){
      const [w,,d]=layout.catalog[p.asset].collider;
      assert.ok(pathDistance(p.x,p.z)>=2+Math.hypot(w,d)/2,`${p.asset} blocks a road`);
      assert.ok(Math.hypot(p.x,p.z-5)>10+Math.hypot(w,d)/2,'Prop enters the spawn plaza');
    }
    if(p.asset==='fence')assert.ok(pathDistance(p.x,p.z)>=4);
  }
  const bytes=await readFile(new URL('../../public/models/heights.bin',import.meta.url));
  const manifest=JSON.parse(await readFile(new URL('../../src/world/meadow-collision.json',import.meta.url),'utf8'));
  assert.equal(bytes.length,manifest.grid.size**2*4);
  for(let i=0;i<manifest.grid.heights.length;i++)assert.ok(Math.abs(bytes.readFloatLE(i*4)-manifest.grid.heights[i])<1e-6);
});

test('dense forests use bounded tree geometry with three progressively simpler levels',async()=>{
  const layout=JSON.parse(await readFile(new URL('../../public/models/regions.json',import.meta.url),'utf8'));
  const trees=Object.values(layout.sections).flat().filter(p=>/^forest_(oak|pine|birch)$/.test(p.asset));
  assert.ok(trees.length>=700,'Woodland should form a dense forest rather than scattered trees');
  const catalog=JSON.parse(await readFile(new URL('../../public/environment-expansion/catalog.json',import.meta.url),'utf8'));
  for(const name of ['forest_oak','forest_pine','forest_birch']){
    const levels=catalog[name].lodTriangles;
    assert.equal(levels.length,3);assert.ok(levels[0]<=500&&levels[1]<=120&&levels[2]<=50);
    assert.ok(levels[0]>levels[1]&&levels[1]>levels[2]);
  }
});

test('orchard harvest and riverside fishing kits are streamed with a supported low platform',async()=>{
  const layout=JSON.parse(await readFile(new URL('../../public/models/regions.json',import.meta.url),'utf8'));
  const assets=Object.values(layout.sections).flat();const count=name=>assets.filter(p=>p.asset===name).length;
  assert.equal(count('orchard_cart'),1);assert.equal(count('orchard_crop_display'),3);
  assert.equal(count('village_storage'),6); // Two village groups and four harvest groups.
  assert.equal(count('riverside_platform'),1);assert.equal(count('riverside_gear'),1);
  const dock=assets.find(p=>p.asset==='riverside_platform');
  const collider=layout.catalog.riverside_platform.collider;assert.ok(collider);
  assert.ok(Math.abs(dock.y+collider[1]-(dock.y+0.22))<1e-6,'Dock collision top must match its deck surface');
  assert.equal(layout.catalog.orchard_crop_display.collider,null,'Small crops stay nonblocking');
  const manifest=JSON.parse(await readFile(new URL('../../src/world/meadow-collision.json',import.meta.url),'utf8'));
  const {min,step,size,heights}=manifest.grid;
  const terrainAt=(x,z)=>{const fx=(x-min)/step,fz=(z-min)/step,ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz,a=heights[iz*size+ix],b=heights[iz*size+ix+1],c=heights[(iz+1)*size+ix],d=heights[(iz+1)*size+ix+1];return (a+(b-a)*tx)*(1-tz)+(c+(d-c)*tx)*tz;};
  const u=(dock.x-dock.z)/Math.SQRT2;let previous;
  for(let v=-13;v<=-3;v+=0.4){
    const x=30+(v+u)/Math.SQRT2,z=30+(v-u)/Math.SQRT2,ground=terrainAt(x,z);let support=ground;
    for(const b of manifest.boxes){const nx=Math.max(b.minX,Math.min(x,b.maxX)),nz=Math.max(b.minZ,Math.min(z,b.maxZ));if((x-nx)**2+(z-nz)**2<0.35**2&&b.maxY>support&&b.maxY<=ground+0.35+1e-6)support=b.maxY;}
    if(previous!==undefined)assert.ok(Math.abs(support-previous)<=0.35+1e-6,`Dock approach exceeds a step at river offset ${v}`);
    previous=support;
  }
});
