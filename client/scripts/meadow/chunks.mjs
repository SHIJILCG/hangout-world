import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { encodeGLB } from './glb.mjs';

// 30m aligns exactly with the terrain's 1.5m cells.
export async function writeChunks(scene) {
  const output = new URL('../../public/models/chunks/', import.meta.url);
  await mkdir(output, { recursive: true });
  const chunks = new Map();
  const overview = [];
  const keyAt = (x, z) => `${Math.min(3, Math.max(-4, Math.floor(x / 30)))},${Math.min(3, Math.max(-4, Math.floor(z / 30)))}`;
  const add = (key, mesh) => {
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(mesh);
  };
  for (const mesh of scene.meshes) {
    const { name, geometry, extras } = mesh;
    if (name.endsWith(' walls') || name.endsWith(' roof') || (name.startsWith('Village ') && name.endsWith(' door'))
      || (extras.role?.startsWith('bridge-') && extras.role !== 'bridge-step')) continue;
    if (name.startsWith('Backdrop')) { overview.push(mesh); continue; }
    if (extras.role !== 'terrain') {
      geometry.computeBoundingBox();
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
        const edges = [ [[0,0],[30,0]], [[30,0],[30,30]], [[30,30],[0,30]], [[0,30],[0,0]] ];
        for (const [a,b] of edges) for (let d=0; d<30; d+=spacing) {
          const indices=[d,d+spacing].map(t=>samples.get(`${cx*30+a[0]+(b[0]-a[0])*t/30},${cz*30+a[1]+(b[1]-a[1])*t/30}`));
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
      const coarse = { position: [], normal: [], color: [] };
      for (let z=0; z<30; z+=6) for (let x=0; x<30; x+=6) {
        for (const [dx,dz] of [[0,0],[0,6],[6,6],[0,0],[6,6],[6,0]]) {
          const index = samples.get(`${cx*30+x+dx},${cz*30+z+dz}`);
          if (index === undefined) throw new Error('Missing overview terrain sample');
          for (const attr of Object.keys(coarse)) {
            const a = geometry.attributes[attr]; coarse[attr].push(a.getX(index),a.getY(index),a.getZ(index));
          }
        }
      }
      skirt(coarse,6);
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
    manifest.push({key,x:x*30+15,z:z*30+15,url:`/models/chunks/${file}`,bytes:buffer.length});
    for (const mesh of merged) mesh.geometry.dispose();
    for (const mesh of meshes) if (mesh.extras.role === 'terrain') mesh.geometry.dispose();
  }
  await writeFile(new URL('overview.glb',output),encodeGLB({meshes:overview,spec:scene.spec}));
  await writeFile(new URL('manifest.json',output),JSON.stringify(manifest));
  for (const mesh of overview) if (mesh.extras.chunk) mesh.geometry.dispose();
  console.log(`Wrote ${manifest.length} streamed map chunks`);
}
