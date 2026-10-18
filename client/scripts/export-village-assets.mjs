import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { encodeGLB } from './meadow/glb.mjs';

globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
const output=new URL('../public/environment-expansion/',import.meta.url);
const wood=0x936340, dark=0x59422f, stone=0x919387;
function part(root,geometry,color,x=0,y=0,z=0,rz=0) {
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color}));
  mesh.position.set(x,y,z);mesh.rotation.z=rz;root.add(mesh);return mesh;
}
const box=(g,w,h,d,c,x,y,z,rz=0)=>part(g,new THREE.BoxGeometry(w,h,d),c,x,y,z,rz);
function bake(root) {
  root.updateMatrixWorld(true);const parts=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(Array.isArray(mesh.material)||mesh.material.map||mesh.material.transparent)throw new Error('Expected opaque untextured primitive');
    const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();g.applyMatrix4(mesh.matrixWorld);
    const colors=[];
    for(let i=0;i<g.attributes.position.count;i++) {
      const c=mesh.material.color.clone();
      if(g.attributes.color)c.multiply(new THREE.Color().fromBufferAttribute(g.attributes.color,i));
      colors.push(c.r,c.g,c.b);
    }
    for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));parts.push(g);
  });
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());return merged;
}
function bench() {
  const g=new THREE.Group();
  box(g,2.4,.15,.65,wood,0,.55,0);box(g,2.4,.45,.12,wood,0,1,-.3);
  for(const x of [-.85,.85]){box(g,.16,.55,.55,dark,x,.275,0);box(g,.12,.65,.12,dark,x,.85,-.3);}
  return g;
}
function storage(low) {
  const g=new THREE.Group();box(g,.9,.8,.85,wood,-.55,.4,0);
  if(!low)for(const y of [.12,.65])box(g,.94,.08,.89,dark,-.55,y,0);
  part(g,new THREE.CylinderGeometry(.37,.32,.95,low?6:8),wood,.5,.475,.1);
  if(!low)for(const y of [.15,.75])part(g,new THREE.CylinderGeometry(.38,.38,.08,8),dark,.5,y,.1);
  return g;
}
function well(low) {
  const g=new THREE.Group(),n=low?8:12;
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2;
    const block=box(g,.46,.8,.3,i%2?stone:0xa4a393,Math.sin(a)*.82,.4,Math.cos(a)*.82);
    block.rotation.y=a;
  }
  part(g,new THREE.CylinderGeometry(.65,.65,.04,12),0x354c51,0,.15,0);
  for(const x of [-1.05,1.05])box(g,.16,2.6,.16,dark,x,1.3,0);
  box(g,2.4,.16,.18,wood,0,2.5,0);
  box(g,.025,1.25,.025,dark,0,1.85,0);
  return g;
}
function stall(low) {
  const g=new THREE.Group();box(g,3,1.5,2,wood,0,.75,0);
  for(const x of [-1.4,1.4])for(const z of [-.9,.9])box(g,.12,2.6,.12,dark,x,1.3,z);
  for(const side of [-1,1])box(g,1.7,.12,2.5,side<0?0xad5147:0xc37656,side*.75,2.65,0,side*-.2);
  if(!low){
    for(let i=0;i<3;i++) {
      box(g,.75,.1,.65,dark,-.95+i*.95,1.55,0);
      for(let j=0;j<4;j++)part(g,new THREE.IcosahedronGeometry(.14,0),[0xb75639,0xd4a442,0x6b8947][i],-1.15+i*.95+(j%2)*.3,1.73,Math.floor(j/2)*.3-.15);
    }
    for(let i=0;i<3;i++)box(g,.4,.07,.35,[0x656e87,0x9a5343,0xc5ad73][i],.9,1.58+i*.07,-.65);
  }
  return g;
}
function harvestCart(low) {
  const g=new THREE.Group();box(g,1.7,.16,1.15,wood,0,.58,0);
  for(const z of [-.48,.48])box(g,1.55,.58,.09,wood,0,.93,z);
  for(const x of [-.72,.72]){
    const wheel=part(g,new THREE.CylinderGeometry(low?.32:.36,.36,.12,low?8:12),dark,x,.36,0);
    wheel.rotation.z=Math.PI/2;
  }
  for(const x of [-.52,.52])box(g,1.15,.09,.1,dark,x,.18,.78,-.18);
  if(!low)for(let i=0;i<5;i++)part(g,new THREE.IcosahedronGeometry(.2,0),[0xb74c32,0xd49b36,0x708746][i%3],-.6+i*.3,.82,(i%2)*.34-.17);
  return g;
}
function cropDisplay(low) {
  const g=new THREE.Group();box(g,2.2,.18,1.4,0x735239,0,.09,0);
  for(let row=0;row<2;row++)for(let col=0;col<(low?3:5);col++){
    const x=-.75+col*(low?.75:.38),z=-.35+row*.7;
    box(g,.26,.28,.3,0x6e5137,x,.27,z);
    if(!low)for(const side of [-1,1])part(g,new THREE.ConeGeometry(.08,.42,4),0x6f9845,x+side*.1,.56,z);
  }
  return g;
}
function fishingGear(low) {
  const g=new THREE.Group();part(g,new THREE.CylinderGeometry(.2,.24,.42,low?6:8),wood,-.35,.21,.05);
  for(let i=0;i<(low?2:4);i++)part(g,new THREE.IcosahedronGeometry(.17,0),[0xc49345,0xa85e3b][i%2],.25+(i%2)*.25,.18+Math.floor(i/2)*.25,0);
  box(g,.055,2.2,.055,dark,.8,1.1,0,-.28);
  box(g,.035,1.25,.035,0xb9a477,1.04,1.85,0,.62);
  return g;
}
function fishingPlatform(low) {
  const g=new THREE.Group();
  for(let i=0;i<(low?3:5);i++)box(g,4.1,.18,.52,i%2?0x886143:wood,0,.13,-1.04+i*.52);
  for(const x of [-1.8,1.8])for(const z of [-1.2,1.2])box(g,.18,.53,.18,dark,x,-.045,z);
  return g;
}
function forestLog(low) {
  const g=new THREE.Group();
  for(const [x,z,length,r] of [[-.65,-.28,2.5,.2],[.5,.34,2,.17],[.12,-.05,1.55,.16]]){
    const log=part(g,new THREE.CylinderGeometry(r*.8,r,length,low?5:7),wood,x,r+.025,z);
    log.rotation.z=Math.PI/2+(z*.18);
    if(!low)for(const end of [-1,1])part(g,new THREE.CylinderGeometry(r*.72,r*.72,.035,6),dark,x+end*(length/2-.04),r+.025,z);
  }
  return g;
}
function forestFloor(low) {
  const g=new THREE.Group(),count=low?5:9;
  for(let i=0;i<count;i++){
    const x=((i*7)%9-4)*.2,z=((i*5)%7-3)*.2;
    const leaf=part(g,new THREE.IcosahedronGeometry(.25+(i%3)*.06,0),[0x586d3d,0x72804a,0x8d874b][i%3],x,.08+(i%2)*.035,z);
    leaf.scale.set(1.2,.22,.65);
  }
  for(let i=0;i<(low?2:4);i++){
    const x=(i-1.5)*.18,z=(i%2)*.18;
    const stem=part(g,new THREE.ConeGeometry(.11,.55,4),i%2?0x698344:0x82944a,x,.28,z);
    stem.rotation.z=(i%2?1:-1)*.48;
  }
  return g;
}
function directionSign(word,low) {
  const g=new THREE.Group();box(g,.13,2.1,.13,dark,0,1.05,0);
  box(g,2.9,.58,.14,wood,0,2.05,0);
  const glyph={A:'abcefg',D:'bcdeg',F:'aefg',I:'bc',M:'abcefg',O:'abcdef',R:'abefg',S:'acdfg',V:'bcde',W:'bcdef'};
  const letters=[...word],width=letters.length*.43-.06,start=-width/2;
  for(let i=0;i<letters.length;i++){
    const cx=start+i*.43;
    for(const segment of glyph[letters[i]]??'abcdef'){
      if(segment==='a'||segment==='g'||segment==='d')box(g,.19,.045,.025,0xe8dcb8,cx,2.05+(segment==='a'?.115:segment==='d'?-.115:0),-.083);
      else box(g,.045,.18,.025,0xe8dcb8,cx+(segment==='b'||segment==='c'?.09:-.09),2.05+(segment==='b'||segment==='f'?.055:-.055),-.083);
    }
  }
  if(!low)part(g,new THREE.ConeGeometry(.13,.3,4),0x9e744d,1.43,2.05,0,-Math.PI/2);
  return g;
}
const catalog=JSON.parse(await readFile(new URL('catalog.json',output),'utf8'));
for(const [name,factory,landmark,collider] of [
  ['village_stall',stall,true,null], // Uses the existing market collision volume.
  ['village_well',well,true,[2.2,2.6,2.2]],
  ['village_bench',bench,false,[2.4,1.25,.7]],
  ['village_storage',storage,false,[1.9,.95,1]],
  ['orchard_cart',harvestCart,false,[1.9,1.5,2]],
  ['orchard_crop_display',cropDisplay,false,null],
  ['riverside_gear',fishingGear,false,null],
  ['riverside_platform',fishingPlatform,false,[4.1,.22,2.6]],
  ['forest_log',forestLog,false,[2.8,.6,1.2]],
  ['forest_floor_patch',forestFloor,false,null],
  ['sign_woods',low=>directionSign('WOODS',low),false,[.35,2,.3]],
  ['sign_farm',low=>directionSign('FARM',low),false,[.35,2,.3]],
  ['sign_river',low=>directionSign('RIVER',low),false,[.35,2,.3]],
]) {
  const meshes=[false,true].map((low,lod)=>({name:`${name}_LOD${lod}`,geometry:bake(factory(low)),extras:{}}));
  const bytes=encodeGLB({meshes,spec:{author:'Hangout World',pivot:'ground',units:'meters'}});
  meshes[0].geometry.computeBoundingBox();const bounds=meshes[0].geometry.boundingBox;
  catalog[name]={bytes:bytes.length,lodTriangles:meshes.map(m=>m.geometry.attributes.position.count/3),category:landmark?'landmark':'detail',pivot:[0,0,0],bounds:[bounds.min.toArray(),bounds.max.toArray()],lodDistances:landmark?[35]:[22],maxDistance:landmark?110:(name==='riverside_platform'?70:45),castShadow:false,collider};
  await writeFile(new URL(`${name}.glb`,output),bytes);
}
// Bake cottage materials into vertex colours once, preserving geometry and normals.
for(const name of ['stone_cottage','stone_cottage_low']) {
  const source=await readFile(new URL(`../public/environment-library/${name}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
  const geometry=mergeVertices(bake(scene),1e-6);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));mesh.name=name;
  const bytes=await new GLTFExporter().parseAsync(mesh,{binary:true});
  await writeFile(new URL(`../public/environment-library/${name}_batched.glb`,import.meta.url),Buffer.from(bytes));
}
await writeFile(new URL('catalog.json',output),JSON.stringify(catalog,null,2));
await writeFile(new URL('VILLAGE-CREDITS.md',output),'Village props are original Hangout World assemblies of Three.js primitives. Cottage models retain the attribution in environment-library/CREDITS.md. Regenerate with node scripts/export-village-assets.mjs after exporting expansion assets and cottage LODs.\n');
console.log(Object.fromEntries(Object.entries(catalog).filter(([name])=>name.startsWith('village_'))));
