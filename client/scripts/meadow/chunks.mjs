import world from '../../../shared/world.json' with { type: 'json' };
import { mkdir, writeFile as write } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { encodeGLB } from './glb.mjs';
const sectionSize=world.sectionSize;

async function writeFile(path,data) {
  for(let attempt=0;attempt<5;attempt++) {
    try{return await write(path,data);}
    catch(error){if(attempt===4||!['UNKNOWN','EPERM','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));}
  }
}

// Clip long rivers and combined flower patches into the sections they occupy.
// Assigning an entire river by its center would make its distant end disappear.
export function splitScenery(mesh) {
  const cells=new Map();const attrs=['position','normal','color'];
  const g=mesh.geometry,p=g.attributes.position,size=world.sectionSize;
  const limit=world.half/size;
  const cell=n=>Math.max(-limit,Math.min(limit-1,Math.floor(n/size)));
  const clip=(polygon,axis,bound,greater)=> {
    const result=[];
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const insideA=greater?a[axis]>=bound:a[axis]<=bound,insideB=greater?b[axis]>=bound:b[axis]<=bound;
      if(insideA)result.push(a);
      if(insideA!==insideB){const t=(bound-a[axis])/(b[axis]-a[axis]);result.push(a.map((n,j)=>n+(b[j]-n)*t));}
    }
    return result;
  };
  for(let i=0;i<p.count;i+=3) {
    const triangle=Array.from({length:3},(_,j)=>attrs.flatMap(attr=>{const a=g.attributes[attr];return [a.getX(i+j),a.getY(i+j),a.getZ(i+j)];}));
    for(let x=cell(Math.min(...triangle.map(v=>v[0])));x<=cell(Math.max(...triangle.map(v=>v[0])));x++) {
      for(let z=cell(Math.min(...triangle.map(v=>v[2])));z<=cell(Math.max(...triangle.map(v=>v[2])));z++) {
        let polygon=triangle;
        for(const [axis,bound,greater] of [[0,x*size,true],[0,(x+1)*size,false],[2,z*size,true],[2,(z+1)*size,false]])polygon=clip(polygon,axis,bound,greater);
        if(polygon.length<3)continue;
        const key=`${x},${z}`,values=cells.get(key)??{position:[],normal:[],color:[]};cells.set(key,values);
        for(let j=1;j<polygon.length-1;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]])attrs.forEach((attr,k)=>values[attr].push(...v.slice(k*3,k*3+3)));
      }
    }
  }
  return [...cells].map(([key,values])=>{
    const geometry=new THREE.BufferGeometry();for(const attr of attrs)geometry.setAttribute(attr,new THREE.Float32BufferAttribute(values[attr],3));
    return [key,{...mesh,geometry}];
  });
}

// 30m aligns exactly with the terrain's 1.5m cells.
export async function writeChunks(scene) {
  const output = new URL('../../public/models/chunks/', import.meta.url);
  await mkdir(output, { recursive: true });
  const chunks = new Map();
  const overview = [];
  const temporary=[];
  const keyAt = (x, z) => `${Math.min(world.half/sectionSize-1, Math.max(-world.half/sectionSize, Math.floor(x / sectionSize)))},${Math.min(world.half/sectionSize-1, Math.max(-world.half/sectionSize, Math.floor(z / sectionSize)))}`;
  const add = (key, mesh) => {
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(mesh);
  };
  for (const mesh of scene.meshes) {
    const { name, geometry, extras } = mesh;
    if (name.startsWith('Town market stall ')||name.startsWith('Town market canopy ')) continue;
    if (name.endsWith(' walls') || name.endsWith(' roof') || (name.startsWith('Village ') && name.endsWith(' door'))
      || (extras.role?.startsWith('bridge-') && extras.role !== 'bridge-step')) continue;
    if (name.startsWith('Backdrop')) { overview.push(mesh); continue; }
    if (extras.role !== 'terrain') {
      geometry.computeBoundingBox();
      const extent=geometry.boundingBox.getSize(new THREE.Vector3());
      if(Math.max(extent.x,extent.z)>world.sectionSize) {
        for(const [key,part] of splitScenery(mesh)){add(key,part);temporary.push(part.geometry);}
        continue;
      }
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      add(keyAt(center.x, center.z), mesh);
      continue;
    }
    const p = geometry.attributes.position;
    const cells = new Map();
    const samples = new Map();
    for (let i = 0; i < p.count; i++) samples.set(`${p.getX(i)},${p.getZ(i)}`, i);
    for (let i = 0; i < p.count; i += 3) {
      const key = keyAt((p.getX(i) + p.getX(i+1) + p.getX(i+2))/3, (p.getZ(i) + p.getZ(i+1) + p.getZ(i+2))/3);
      if (!cells.has(key)) cells.set(key, { position: [], normal: [], color: [] });
      const cell = cells.get(key);
      for (const attr of Object.keys(cell)) for (let j = i; j < i+3; j++) {
        const a = geometry.attributes[attr]; cell[attr].push(a.getX(j), a.getY(j), a.getZ(j));
      }
    }
    for (const [key, attrs] of cells) {
      const detail = new THREE.BufferGeometry();
      for (const [attr, values] of Object.entries(attrs)) detail.setAttribute(attr, new THREE.Float32BufferAttribute(values, 3));
      add(key, { name: `terrain ${key}`, geometry: detail, extras });
      const [cx, cz] = key.split(',').map(Number);
      // Cover seams between the 1.5m detail edge and the 6m overview edge.
      const skirt = (attributes, spacing) => {
        const edges = [ [[0,0],[sectionSize,0]], [[sectionSize,0],[sectionSize,sectionSize]], [[sectionSize,sectionSize],[0,sectionSize]], [[0,sectionSize],[0,0]] ];
        for (const [a,b] of edges) for (let d=0; d<sectionSize; d+=spacing) {
          const indices=[d,d+spacing].map(t=>samples.get(`${cx*sectionSize+a[0]+(b[0]-a[0])*t/sectionSize},${cz*sectionSize+a[1]+(b[1]-a[1])*t/sectionSize}`));
          for (const [v,drop] of [[0,0],[1,0],[1,2],[0,0],[1,2],[0,2]]) {
            for (const attr of Object.keys(attributes)) {
              const a=geometry.attributes[attr], index=indices[v];
              attributes[attr].push(a.getX(index),a.getY(index)-(attr==='position'?drop:0),a.getZ(index));
            }
          }
        }
      };
      skirt(attrs,1.5);
      for (const [attr, values] of Object.entries(attrs)) detail.setAttribute(attr, new THREE.Float32BufferAttribute(values,3));
      const spacing=world.overviewSpacing;
      const coarse = { position: [], normal: [], color: [] };
      for (let z=0; z<sectionSize; z+=spacing) for (let x=0; x<sectionSize; x+=spacing) {
        for (const [dx,dz] of [[0,0],[0,spacing],[spacing,spacing],[0,0],[spacing,spacing],[spacing,0]]) {
          const index = samples.get(`${cx*sectionSize+x+dx},${cz*sectionSize+z+dz}`);
          if (index === undefined) throw new Error('Missing overview terrain sample');
          for (const attr of Object.keys(coarse)) {
            const a = geometry.attributes[attr]; coarse[attr].push(a.getX(index),a.getY(index),a.getZ(index));
          }
        }
      }
      skirt(coarse,spacing);
      const low = new THREE.BufferGeometry();
      for (const [attr, values] of Object.entries(coarse)) low.setAttribute(attr,new THREE.Float32BufferAttribute(values,3));
      overview.push({ name:`overview ${key}`, geometry:low, extras:{chunk:key} });
    }
  }
  const manifest = [];
  for (const [key, meshes] of chunks) {
    const merged = [];
    for (const terrain of [true,false]) {
      const parts = meshes.filter(m => (m.extras.role === 'terrain') === terrain);
      if (!parts.length) continue;
      const compatible=parts.map(m=> {
        const g=m.geometry.clone();
        for (const key of Object.keys(g.attributes)) if (!['position','normal','color'].includes(key)) g.deleteAttribute(key);
        return g;
      });
      merged.push({name: terrain?'terrain':'scenery',geometry:mergeGeometries(compatible),extras:{terrain}});
      for (const g of compatible) g.dispose();
    }
    const file = `${key.replace(',', '_')}.glb`;
    const buffer = encodeGLB({meshes:merged,spec:scene.spec});
    await writeFile(new URL(file, output),buffer);
    const [x,z] = key.split(',').map(Number);
    manifest.push({key,x:x*sectionSize+15,z:z*sectionSize+15,url:`/models/chunks/${file}`,bytes:buffer.length});
    for (const mesh of merged) mesh.geometry.dispose();
    for (const mesh of meshes) if (mesh.extras.role === 'terrain') mesh.geometry.dispose();
  }
  await writeFile(new URL('overview.glb',output),encodeGLB({meshes:overview,spec:scene.spec}));
  await writeFile(new URL('manifest.json',output),JSON.stringify(manifest));
  for (const mesh of overview) if (mesh.extras.chunk) mesh.geometry.dispose();
  for(const geometry of temporary)geometry.dispose();
  console.log(`Wrote ${manifest.length} streamed map chunks`);
}
