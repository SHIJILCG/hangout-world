import { mkdir, writeFile } from 'node:fs/promises';
import { buildMeadow } from './scene.mjs';
import { encodeGLB } from './glb.mjs';
import { validateMeadow } from './validate.mjs';
import { buildCollisionManifest } from './collision.mjs';

const output = new URL('../../public/models/fantasy-meadow.glb', import.meta.url);
const manifestOutput = new URL('../../src/world/meadow-collision.json', import.meta.url);
const scene = buildMeadow();
try {
  const buffer = encodeGLB(scene);
  const report = validateMeadow(buffer);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, buffer);

  const manifest = buildCollisionManifest();
  await mkdir(new URL('.', manifestOutput), { recursive: true });
  await writeFile(manifestOutput, JSON.stringify(manifest));

  console.log(`Wrote ${output.pathname}\n${JSON.stringify(report, null, 2)}`);
  console.log(`Wrote ${manifestOutput.pathname} (${manifest.boxes.length} boxes, ${manifest.grid.heights.length} grid samples)`);
} finally {
  for (const mesh of scene.meshes) mesh.geometry.dispose();
}
