import world from '../../../shared/world.json' with { type: 'json' };
import { groundHeight } from './terrain.mjs';
import { FOREST_ZONES,forestAt,forestWeight } from './biomes.mjs';

export function regionalLayout(pathDistance) {
  const placements=[];
  const r=world.half-35;
  let state=71529;
  const random=()=> {state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const add=(asset,x,z,scale=1,rotation=0,yOffset=0)=> {
    if(Math.abs(x)>world.half-8||Math.abs(z)>world.half-8) return;
    if((['apple','tree'].includes(asset)||/^forest_(oak|pine|birch)$/.test(asset))&&pathDistance(x,z)<5)return;
    if(asset==='fence'&&pathDistance(x,z)<4)return;
    placements.push({asset,x,z,scale,rotation,y:groundHeight(x,z)+yOffset});
  };
  // Orchard rows and paddock. Leave the east entrance open for the road.
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)add('apple',-r+col*7-10,20+row*8,0.8,random()*6.28);
  for(let i=0;i<12;i++) {
    add('fence',-r-16+i*3,12);add('fence',-r-16+i*3,53);
    add('fence',-r-18,14+i*3,1,Math.PI/2);
  }
  // Connected forest masses, with an irregular edge and a traversable road network.
  for(const zone of FOREST_ZONES)for(let gx=zone.x-zone.rx;gx<=zone.x+zone.rx;gx+=zone.spacing){
    for(let gz=zone.z-zone.rz;gz<=zone.z+zone.rz;gz+=zone.spacing){
      const x=gx+(random()-0.5)*2.2,z=gz+(random()-0.5)*2.2;
      if(zone.name==='North Woods'&&Math.hypot(x+25,z+174)<11)continue;
      const weight=forestWeight(x,z,zone);
      if(weight===0||random()>0.6+weight*0.4||Math.max(Math.abs(x),Math.abs(z))<124||Math.abs(x+z-60)<8)continue;
      const species=zone.kind==='oak'&&random()<0.14?'birch':zone.kind;
      add(`forest_${species}`,x,z,0.85+random()*0.4,random()*6.28);
      if(random()<0.3&&pathDistance(x+2,z+2)>4)add('forest_shrub',x+2,z+2,0.8+random()*0.6,random()*6.28);
    }
  }
  for(let i=0;i<55;i++) {
    const x=-world.half+12+random()*(world.half*2-24),z=60-x+(random()>0.5?8:-8);
    if(pathDistance(x,z)>5)add('rock',x,z,0.45+random()*0.6,random()*6.28);
  }
  // Walk-through courtyard arch and a garden of low walls. Opening faces north.
  add('arch',-30,r,1,0);
  for(let i=0;i<5;i++) {
    add('wall',-42+i*4,r+12);add('wall',-44,r-6+i*4,1,Math.PI/2);
  }
  for(let x=-38;x<=-22;x+=4)for(let z=r+2;z<=r+10;z+=4)add('flagstone',x,z,1,0,-0.08);
  // Landmark lanterns stand on simple timber posts added by the export script.
  for(const [x,z] of [[-r+23,30],[0,-r+6],[-25,r-5],[r-8,60-r+16]])add('lantern',x,z,0.6);
  // Woods get low undergrowth; the open south/east remain a lighter meadow.
  for(let i=0;i<5200;i++) {
    const x=(random()*2-1)*(world.half-8),z=(random()*2-1)*(world.half-8);
    if(Math.max(Math.abs(x),Math.abs(z))<124||pathDistance(x,z)<4||Math.abs(x+z-60)<6||Math.hypot(x+25,z+174)<11)continue;
    const {weight}=forestAt(x,z);
    add('grass',x,z,(weight>0.5?0.75:1.15)+random()*0.7,random()*6.28);
  }
  // Orchard work site at the centre of the level farm pad.
  add('orchard_cart',-185,44,1,0);
  add('orchard_crop_display',-222,31,1,0);
  add('orchard_crop_display',-192,18,1,0);
  add('orchard_crop_display',-174,32,1,0);
  add('village_storage',-185,20,0.9,0);
  add('village_storage',-183,27,0.9,0.5);
  add('village_storage',-222,45,0.9,Math.PI/2);
  // A walkable North Woods clearing with one resting bench, fallen timber and
  // ground-level leaves/ferns. Keep the canopies open around the activity spot.
  add('village_bench',-25,-174,1,Math.PI/2);
  for(const [x,z,r]of [[-12,-164,.95],[-37,-165,1.1],[-10,-177,1],[-40,-181,.9],[-18,-190,1.05],[-34,-187,.9]])add('forest_log',x,z,r,random()*6.28);
  for(const [x,z]of [[-39,-174],[-34,-158],[-23,-159],[-12,-170],[-10,-188],[-20,-191],[-38,-190],[-43,-163]])add('forest_floor_patch',x,z,.9+random()*.25,random()*6.28);
  for(const [x,z,r]of [[-162,146,1],[-184,158,.9],[-166,173,1.1],[171,50,1],[184,79,.9],[201,63,1.05],[-8,202,1],[-50,195,.9],[-14,220,.85]])add('forest_floor_patch',x,z,r,random()*6.28);
  add('village_storage',-176,44,0.9,0);
  // Riverside fishing platform is set on the shallow bank just outside the water.
  add('riverside_platform',205,-157,1,-Math.PI/4);
  add('riverside_gear',204,-151,1,0);
  add('village_bench',205,-164,0.9,Math.PI/4);
  // Three compact, readable trail markers at the farm, woods and river approaches.
  add('sign_farm',-199,12,1,Math.PI/2);
  add('sign_woods',-42,-201,1,Math.PI/2);
  add('sign_river',216,-158,1,-Math.PI/4);
  // Village pilot: preserve the plaza and the existing market footprint.
  add('village_stall',13,4);
  add('village_stall',13,12);
  add('village_well',24,12);
  add('village_bench',24,8,1,Math.PI/2);
  add('village_bench',21,12,1,Math.PI/2);
  add('village_storage',18,0);
  add('village_storage',18,24);
  // Kenney Fantasy Town Kit: a compact themed market corner, streamed like
  // the rest of the regional props. Keep the spawn lane through the plaza open.
  add('kenney-stall-red',-7,19,1,Math.PI/2);
  add('kenney-stall-green',-3,19,1,Math.PI/2);
  add('kenney-cart',5,20,1,-Math.PI/2);
  add('kenney-fountain-round',0,27,1,0);
  const sections={};
  for(const p of placements) {
    const key=`${Math.floor(p.x/world.sectionSize)},${Math.floor(p.z/world.sectionSize)}`;
    (sections[key]??=[]).push(p);
  }
  return {sections,places:[{name:'Orchard Farm',x:-r,z:32},{name:'North Woods',x:-25,z:-174},{name:'Pine Grove',x:187,z:65},{name:'Birch Copse',x:-173,z:157},{name:'Old Courtyard',x:-30,z:r},{name:'Riverside Clearing',x:r-12,z:60-r+20}]};
}

export function regionalColliders(layout,catalog) {
  const boxes=[];
  const box=(p,x,z,w,d,h)=>boxes.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:p.y,maxY:p.y+h});
  for(const p of Object.values(layout.sections).flat()) {
    const collider=catalog[p.asset]?.collider;
    if(collider){
      const [w,h,d]=collider.map(n=>n*p.scale),c=Math.abs(Math.cos(p.rotation)),s=Math.abs(Math.sin(p.rotation));
      box(p,p.x,p.z,w*c+d*s,w*s+d*c,h);
    }
    if(p.asset==='tree'||p.asset==='apple'||/^forest_(oak|pine|birch)$/.test(p.asset))box(p,p.x,p.z,0.55*p.scale,0.55*p.scale,3*p.scale);
    if(p.asset==='rock')box(p,p.x,p.z,p.scale,p.scale,1.2*p.scale);
    if(p.asset==='fence'||p.asset==='wall') {
      const [w,h,d]=catalog[p.asset].size.map(n=>n*p.scale);
      const quarter=Math.abs(Math.sin(p.rotation))>0.5;
      box(p,p.x,p.z,quarter?d:w,quarter?w:d,h);
    }
    if(p.asset==='arch') {
      // Keep the opening traversable rather than using a single solid AABB.
      box(p,p.x-1.55,p.z,0.4,0.6,3.5);box(p,p.x+1.55,p.z,0.4,0.6,3.5);
    }
  }
  return boxes;
}
