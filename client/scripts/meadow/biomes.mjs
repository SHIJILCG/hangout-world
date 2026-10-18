// Shared by terrain colouring and deterministic vegetation placement.
export const FOREST_ZONES = [
  {name:'North Woods',x:-25,z:-174,rx:166,rz:57,spacing:6,kind:'oak'},
  {name:'Pine Grove',x:187,z:65,rx:39,rz:91,spacing:5.5,kind:'pine'},
  {name:'Birch Copse',x:-173,z:157,rx:38,rz:37,spacing:7,kind:'birch'},
];

export function forestWeight(x,z,zone) {
  const radius=Math.hypot((x-zone.x)/zone.rx,(z-zone.z)/zone.rz);
  return Math.max(0,Math.min(1,(1-radius)*5));
}

export function forestAt(x,z) {
  let selected=null,weight=0;
  for(const zone of FOREST_ZONES){const value=forestWeight(x,z,zone);if(value>weight){selected=zone;weight=value;}}
  return {zone:selected,weight};
}
