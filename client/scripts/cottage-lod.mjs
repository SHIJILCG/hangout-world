import { readFile, writeFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result=result; this.onloadend?.(); }); }
};
const source = await readFile(new URL('../public/environment-library/stone_cottage.glb',import.meta.url));
const gltf=await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
let before=0, after=0;
gltf.scene.traverse(o=> {
  if (!o.isMesh) return;
  const g=o.geometry;
  before+=(g.index?.count??g.attributes.position.count)/3;
  // Preserve material boundaries (GLTFLoader splits primitives into separate meshes).
  if (g.attributes.position.count>180) {
    const input=g.clone();
    input.deleteAttribute('normal'); input.deleteAttribute('uv');
    const welded=mergeVertices(input);
    const reduced=new SimplifyModifier().modify(welded,Math.floor(welded.attributes.position.count*0.65));
    reduced.computeVertexNormals();
    o.geometry=reduced; g.dispose(); input.dispose(); welded.dispose();
  }
  after+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
});
const result=await new GLTFExporter().parseAsync(gltf.scene,{binary:true});
await writeFile(new URL('../public/environment-library/stone_cottage_low.glb',import.meta.url),Buffer.from(result));
console.log({before,after,bytes:result.byteLength});
