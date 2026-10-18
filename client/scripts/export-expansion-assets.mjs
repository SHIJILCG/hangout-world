import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { encodeGLB } from './meadow/glb.mjs';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const source=process.argv[2] ?? process.env.MEDIEVAL_SOURCE;
if (!source) throw new Error('Pass the local medieval project directory or set MEDIEVAL_SOURCE');
const modules=resolve(source,'node_modules');
const THREE=await import(pathToFileURL(resolve(modules,'three/build/three.module.js')));
const library=await import(pathToFileURL(resolve(modules,'three-low-poly/dist/three-low-poly.mjs')));
const output=new URL('../public/environment-expansion/',import.meta.url);
await mkdir(output,{recursive:true});
const material=color=>new THREE.MeshStandardMaterial({color,roughness:1});
const mesh=(geometry,color)=>new THREE.Mesh(geometry,material(color));
// Full silhouettes with small geometry budgets: dense forests need canopy volume.
function forestTree(kind,lod) {
  const group=new THREE.Group();
  const trunk=mesh(new THREE.CylinderGeometry(kind==='birch'?0.14:0.23,kind==='birch'?0.22:0.4,kind==='pine'?7:5.4,lod===0?7:5),kind==='birch'?0xd5d5b5:0x654830);
  trunk.position.y=(kind==='pine'?7:5.4)/2;group.add(trunk);
  if(kind==='pine') {
    for(let i=0;i<(lod===2?2:4);i++) {
      const crown=mesh(new THREE.ConeGeometry(lod===2?2.7-i*0.9:2.7-i*0.43,lod===2?4:3.7,lod===0?8:5),[0x315f40,0x3d7146,0x4a8050,0x568a54][i]);
      crown.position.y=lod===2?4.3+i*3.1:3.4+i*1.35;group.add(crown);
    }
  } else {
    const crowns=lod===2?[[0,5.7,0,3.1]]:[[0,6.5,0,2.9],[-1.65,5.3,0.45,2.25],[1.55,5.5,0.8,2.35],[0.15,5.7,-1.8,2.25]];
    for(const [i,[x,y,z,radius]] of crowns.entries()) {
      const crown=mesh(new THREE.IcosahedronGeometry(radius,lod===0?1:0),kind==='birch'?[0x779a47,0x91ae54,0xa5ba65,0x819c4c][i%4]:[0x385e35,0x476e38,0x547a40,0x3d6539][i%4]);
      crown.position.set(x,y,z);crown.scale.y=0.8;group.add(crown);
    }
    if(lod===0)for(const side of [-1,1]){
      const branch=mesh(new THREE.CylinderGeometry(0.1,0.19,2.4,5),kind==='birch'?0xc9ccad:0x654830);
      branch.position.set(side*0.55,4.3,0);branch.rotation.z=-side*0.65;group.add(branch);
    }
  }
  return group;
}
function forestShrub(lod) {
  const group=new THREE.Group();
  for(let i=0;i<(lod===2?1:3);i++){
    const crown=mesh(new THREE.IcosahedronGeometry(0.65,lod===0?1:0),[0x406740,0x507849,0x627e49][i]);
    crown.position.set((i-1)*0.45,0.5,(i%2)*0.3);crown.scale.y=0.75;group.add(crown);
  }
  return group;
}
const factories={
  fence:()=>new library.RusticFence({sections:1,sectionLength:3,postHeight:1.2,seed:217}),
  tree:()=>new library.DeciduousTree({seed:841,maxDepth:2,leafDensity:0.8,leafSize:1.1,clustersPerPoint:2,segmentLength:1.1,baseRise:0.35}),
  apple:()=>new library.AppleTree({seed:112,height:4,crownRadius:2,appleCount:8,leafDensity:0.6,baseRise:0}),
  rock:()=>mesh(new library.MossyRockGeometry({radius:1,detail:0}),0x839470),
  lantern:()=>{
    const group=new THREE.Group();group.add(mesh(new library.HangingLanternGeometry({drop:1.1}),0xd8ae65));
    const post=mesh(new THREE.BoxGeometry(0.15,2.6,0.15),0x765338);post.position.set(0.65,0.8,0);group.add(post);
    const arm=mesh(new THREE.BoxGeometry(0.8,0.12,0.12),0x765338);arm.position.set(0.3,2.05,0);group.add(arm);return group;
  },
  wall:()=>new library.StoneWall({width:4,height:1.8,thickness:0.5,seed:65}),
  arch:()=>mesh(new library.ArchGeometry({span:3,legHeight:1.8,archHeight:1,thickness:0.4,depth:0.6,segments:8}),0x9fa28b),
  flagstone:()=>new library.FlagstoneFloor({width:4,length:4}),
  ...Object.fromEntries(['oak','pine','birch'].flatMap(kind=>[0,1,2].map(lod=>[`forest_${kind}_${lod}`,()=>forestTree(kind,lod)]))),
  ...Object.fromEntries([0,1,2].map(lod=>[`forest_shrub_${lod}`,()=>forestShrub(lod)])),
};
const previous=await readFile(new URL('catalog.json',output),'utf8').then(JSON.parse,()=>({}));
// Keep assets written by other exporters (farm, riverside, custom village and
// licensed third-party models) when regenerating this exporter’s own catalog.
const report={...previous};
Object.assign(report,{
  'kenney-stall-red':{bytes:24304,triangles:270,lodTriangles:[270],category:'landmark',pivot:[0,0,0],bounds:[[-0.5,0,-0.5],[0.5,1.237,0.5]],lodDistances:[],maxDistance:75,castShadow:false,collider:[1.3,1.4,1.3]},
  'kenney-stall-green':{bytes:27120,triangles:322,lodTriangles:[322],category:'landmark',pivot:[0,0,0],bounds:[[-0.5,0,-0.5],[0.5,1.237,0.5]],lodDistances:[],maxDistance:75,castShadow:false,collider:[1.3,1.4,1.3]},
  'kenney-cart':{bytes:52920,triangles:608,lodTriangles:[608],category:'detail',pivot:[0,0,0],bounds:[[-0.65,0,-0.65],[0.65,0.54,0.70]],lodDistances:[],maxDistance:45,castShadow:false,collider:[1.1,0.8,1.4]},
  'kenney-fountain-round':{bytes:84848,triangles:1002,lodTriangles:[1002],category:'landmark',pivot:[0,0,0],bounds:[[-1,0,-1],[1,1,1]],lodDistances:[],maxDistance:75,castShadow:false,collider:[1.8,1,1.8]},
});
for (const [name,factory] of Object.entries(factories)) {
  const root=factory(); root.updateMatrixWorld(true);
  const geometries=[];
  root.traverse(o=> {
    if (!o.isMesh) return;
    const matrices=[];
    if (o.isInstancedMesh) for(let i=0;i<o.count;i++) {const m=new THREE.Matrix4();o.getMatrixAt(i,m);matrices.push(o.matrixWorld.clone().multiply(m));}
    else matrices.push(o.matrixWorld);
    for(const [instanceIndex,matrix] of matrices.entries()) {
      const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone(); g.applyMatrix4(matrix);
      const color=[];const count=g.attributes.position.count;
      const tint=new THREE.Color(0xffffff);if(o.isInstancedMesh&&o.instanceColor)o.getColorAt(instanceIndex,tint);
      for(let i=0;i<count;i++) {
        const group=o.geometry.groups.find(group=>i>=group.start&&i<group.start+group.count);
        const mat=Array.isArray(o.material)?o.material[group?.materialIndex??0]:o.material;
        const c=(mat.color??new THREE.Color('white')).clone().multiply(tint);
        if(g.attributes.color)c.multiply(new THREE.Color().fromBufferAttribute(g.attributes.color,i));
        color.push(c.r,c.g,c.b);
      }
      g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
      g.deleteAttribute('normal');g.computeVertexNormals();
      geometries.push(g);
    }
  });
  const bounds=new THREE.Box3();for(const g of geometries){g.computeBoundingBox();bounds.union(g.boundingBox);}
  // Ground pivot and centered footprint, consistent across exported variants.
  const center=bounds.getCenter(new THREE.Vector3());
  const keepTrunkOrigin=name==='tree'||name==='apple'||name.startsWith('forest_');
  for(const g of geometries)g.translate(keepTrunkOrigin?0:-center.x,-bounds.min.y,keepTrunkOrigin?0:-center.z);
  // Bake into one opaque vertex-color mesh to keep each asset at one draw.
  const geometry=new THREE.BufferGeometry();
  for(const attr of ['position','normal','color']) {
    const values=[];for(const g of geometries)values.push(...g.attributes[attr].array);
    geometry.setAttribute(attr,new THREE.Float32BufferAttribute(values,3));
  }
  const forestMatch=name.match(/^(forest_\w+)_(\d)$/);
  const meshes=[{name:`${forestMatch?.[1]??name}_LOD${forestMatch?.[2]??0}`,geometry,extras:{}}];
  if(name==='tree'||name==='apple') {
    const input=geometry.clone();input.deleteAttribute('normal');
    const welded=mergeVertices(input);
    const low=new SimplifyModifier().modify(welded,Math.floor(welded.attributes.position.count*0.65));
    const flat=low.index?low.toNonIndexed():low.clone();flat.computeVertexNormals();
    meshes.push({name:`${name}_LOD1`,geometry:flat,extras:{}});
    input.dispose();welded.dispose();low.dispose();
  }
  const bytes=encodeGLB({meshes,spec:{source:'three-low-poly',version:'1.2.7'}});
  await writeFile(new URL(`${name}.glb`,output),bytes);
  report[name]={bytes:bytes.length,triangles:geometry.attributes.position.count/3,lodTriangles:meshes.map(m=>m.geometry.attributes.position.count/3),size:bounds.getSize(new THREE.Vector3()).toArray()};
  for(const g of geometries)g.dispose();geometry.dispose();
  for(const m of meshes.slice(1))m.geometry.dispose();
}
// Package each forest species' three authored LODs into a single download.
for(const kind of ['oak','pine','birch','shrub']) {
  const {decodeGLB,readAttribute}=await import('./meadow/glb.mjs');
  const meshes=[];
  for(let lod=0;lod<3;lod++){
    const document=decodeGLB(await readFile(new URL(`forest_${kind}_${lod}.glb`,output)));
    const geometry=new THREE.BufferGeometry(),primitive=document.json.meshes[0].primitives[0];
    for(const [attr,key] of [['position','POSITION'],['normal','NORMAL'],['color','COLOR_0']])geometry.setAttribute(attr,new THREE.Float32BufferAttribute(readAttribute(document,primitive.attributes[key]),3));
    meshes.push({name:`forest_${kind}_LOD${lod}`,geometry,extras:{}});
    await unlink(new URL(`forest_${kind}_${lod}.glb`,output));delete report[`forest_${kind}_${lod}`];
  }
  const bytes=encodeGLB({meshes,spec:{author:'Hangout World',opaque:true}});
  await writeFile(new URL(`forest_${kind}.glb`,output),bytes);
  report[`forest_${kind}`]={bytes:bytes.length,triangles:meshes[0].geometry.attributes.position.count/3,lodTriangles:meshes.map(m=>m.geometry.attributes.position.count/3)};
  for(const m of meshes)m.geometry.dispose();
}
await writeFile(new URL('catalog.json',output),JSON.stringify(report,null,2));
const license=await readFile(resolve(modules,'three-low-poly/LICENSE.md'),'utf8');
await writeFile(new URL('CREDITS.md',output),'# Expansion assets\n\nForest tree and shrub models are authored in export-expansion-assets.mjs using Three.js primitives. Other models are generated from three-low-poly 1.2.7. Seeds and options are recorded in the script.\n\nThe `kenney-*` models and shared palette texture come from Kenney’s Fantasy Town Kit (2.0), released under CC0. See `KENNEY-FANTASY-TOWN-LICENSE.txt`.\n\n'+license);
console.log(report);
