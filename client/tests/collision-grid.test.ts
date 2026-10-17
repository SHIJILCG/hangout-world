import { expect, it } from 'vitest';
import { CollisionWorld, STEP_HEIGHT, type Box } from '../src/world/collision';
import manifest from '../src/world/meadow-collision.json';

function overlaps(x:number,z:number,r:number,b:Box) {
  return (x-Math.max(b.minX,Math.min(x,b.maxX)))**2+(z-Math.max(b.minZ,Math.min(z,b.maxZ)))**2<r*r;
}

// Original exhaustive algorithm is the oracle for spatial-index behavior.
function exhaustive(boxes:Box[],x:number,z:number,y:number,r:number,h:number) {
  for (const b of boxes) {
    if (!(b.maxY>y+STEP_HEIGHT && b.minY<y+h) || !overlaps(x,z,r,b)) continue;
    const left=x-(b.minX-r),right=b.maxX+r-x,back=z-(b.minZ-r),front=b.maxZ+r-z;
    if (Math.min(left,right)<=Math.min(back,front)) x=left<=right?b.minX-r:b.maxX+r;
    else z=back<=front?b.minZ-r:b.maxZ+r;
  }
  return {x,z};
}

it('matches exhaustive collision and support queries across terrain, grid edges and obstacles',()=> {
  const world=new CollisionWorld(manifest.boxes,manifest.grid);
  let seed=812;
  const random=()=> { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  for (let i=0;i<5000;i++) {
    const b=manifest.boxes[i%manifest.boxes.length];
    const x=i%2?random()*244-122:b.minX+(random()-0.5)*1.2;
    const z=i%2?random()*244-122:b.minZ+(random()-0.5)*1.2;
    const y=world.groundAt(x,z)+random()*2;
    expect(world.resolveHorizontal(x,z,y,0.4,1.7)).toEqual(exhaustive(manifest.boxes,x,z,y,0.4,1.7));
    let support=world.groundAt(x,z);
    for (const box of manifest.boxes) if (box.maxY<=y+STEP_HEIGHT+1e-6 && box.maxY>support && overlaps(x,z,0.4,box)) support=box.maxY;
    expect(world.supportHeightAt(x,z,y,0.4)).toBe(support);
  }
});
