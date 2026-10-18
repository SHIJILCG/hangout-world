import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../../shared/collision';
import metadata from '../../client/public/models/collision.json';

// Loaded once; matches the browser's generated collision data exactly.
const bytes = readFileSync(new URL('../../client/public/models/heights.bin', import.meta.url));
if (bytes.length!==metadata.grid.size**2*4) throw new Error('Ride collision height field is invalid');
const heights = new Float32Array(bytes.length/4);
for (let i=0;i<heights.length;i++) heights[i]=bytes.readFloatLE(i*4);
export const rideWorld = new CollisionWorld(metadata.boxes,{...metadata.grid,heights});
