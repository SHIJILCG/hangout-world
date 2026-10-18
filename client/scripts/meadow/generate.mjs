import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { buildMeadow, pathCurves, pathDistance } from './scene.mjs';
import { encodeGLB } from './glb.mjs';
import { validateMeadow } from './validate.mjs';
import { buildCollisionManifest } from './collision.mjs';
import { writeChunks } from './chunks.mjs';
import { regionalLayout, regionalColliders } from './regions.mjs';
import world from '../../../shared/world.json' with {type:'json'};

if(world.half%world.sectionSize||world.sectionSize%world.terrainSpacing||world.sectionSize%world.overviewSpacing) {
  throw new Error('World dimensions, terrain spacing and overview spacing must align to section boundaries');
}

const output = new URL('../../public/models/fantasy-meadow.glb', import.meta.url);
const manifestOutput = new URL('../../src/world/meadow-collision.json', import.meta.url);
const scene = buildMeadow();
try {
  const buffer = encodeGLB(scene);
  const report = validateMeadow(buffer);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, buffer);
  await writeChunks(scene);

  const manifest = buildCollisionManifest();
  const layout=regionalLayout(pathDistance);
  const catalog=JSON.parse(await readFile(new URL('../../public/environment-expansion/catalog.json',import.meta.url),'utf8'));
  layout.catalog=Object.fromEntries(Object.entries(catalog).filter(([,entry])=>entry.lodDistances));
  manifest.boxes.push(...regionalColliders(layout,catalog));
  await writeFile(new URL('../../public/models/regions.json',import.meta.url),JSON.stringify(layout));
  await writeFile(new URL('../../src/world/roads.json',import.meta.url),JSON.stringify(pathCurves));
  const {heights,...grid}=manifest.grid;
  await writeFile(new URL('../../public/models/collision.json',import.meta.url),JSON.stringify({...manifest,grid:{...grid,heights:undefined}}));
  const binary=Buffer.alloc(heights.length*4);
  heights.forEach((height,index)=>binary.writeFloatLE(height,index*4));
  await writeFile(new URL('../../public/models/heights.bin',import.meta.url),binary);
  await mkdir(new URL('.', manifestOutput), { recursive: true });
  await writeFile(manifestOutput, JSON.stringify(manifest));

  console.log(`Wrote ${output.pathname}\n${JSON.stringify(report, null, 2)}`);
  console.log(`Wrote ${manifestOutput.pathname} (${manifest.boxes.length} boxes, ${manifest.grid.heights.length} grid samples)`);
} finally {
  for (const mesh of scene.meshes) mesh.geometry.dispose();
}
