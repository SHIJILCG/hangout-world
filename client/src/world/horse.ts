import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original articulated low-poly model. Rigid parts share one vertex-colour material. */
export function createHorse() {
  const root=new THREE.Group(), body=new THREE.Group(), head=new THREE.Group(), tail=new THREE.Group();
  root.name='Chestnut';root.add(body);body.add(head,tail);
  const coat=0x955636, dark=0x38271f, leather=0x543a2d, cream=0xe8d9b6;
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  const geometries:THREE.BufferGeometry[]=[];
  const parts=new Map<THREE.Group,THREE.BufferGeometry[]>();
  function part(group:THREE.Group,size:number[],color:number,pos:number[],rotation=0,round=false) {
    const g=round?new THREE.IcosahedronGeometry(1,1):new THREE.BoxGeometry(1,1,1).toNonIndexed();
    g.scale(size[0],size[1],size[2]);g.rotateX(rotation);g.translate(pos[0],pos[1],pos[2]);
    const c=new THREE.Color(color),values=[];
    for(let i=0;i<g.attributes.position.count;i++)values.push(c.r,c.g,c.b);
    g.setAttribute('color',new THREE.Float32BufferAttribute(values,3));g.deleteAttribute('uv');
    const list=parts.get(group)??[];list.push(g);parts.set(group,list);
  }
  part(body,[.48,.51,.96],coat,[0,1.3,0],0,true);
  part(body,[.39,.48,.42],coat,[0,1.37,.56],0,true);
  part(body,[.33,.7,.31],coat,[0,1.86,.69],-.32,true);
  part(body,[.13,.69,.14],dark,[0,1.97,.45],-.32);
  part(body,[.86,.09,.84],0x45675c,[0,1.72,-.06]);
  part(body,[.66,.14,.57],leather,[0,1.8,-.06]);
  part(body,[.65,.2,.1],leather,[0,1.87,-.36]);
  part(body,[.59,.13,.1],leather,[0,1.87,.25]);
  for(const side of [-1,1]) {
    part(body,[.04,.48,.07],leather,[side*.46,1.42,-.06]);
    part(body,[.13,.05,.18],0xc7af7d,[side*.47,1.17,-.06]);
    // Reins from the neck to the rider's hands.
    part(body,[.022,.022,.65],dark,[side*.18,2.02,.43],.35);
  }
  head.position.set(0,2.18,.86);
  part(head,[.29,.33,.47],coat,[0,0,.05],.35,true);
  part(head,[.26,.2,.25],0xb77f55,[0,-.13,.38],.35,true);
  part(head,[.52,.045,.06],leather,[0,-.08,.38]);
  for(const side of [-1,1]) {
    part(head,[.09,.28,.1],coat,[side*.17,.31,-.07],-.18);
    part(head,[.075,.09,.09],dark,[side*.27,.04,.13]);
    part(head,[.02,.03,.025],cream,[side*.31,.065,.145]);
    part(head,[.025,.045,.08],dark,[side*.23,-.12,.49]);
  }
  tail.position.set(0,1.5,-.88);
  part(tail,[.15,.7,.18],dark,[0,-.31,-.16],.4);
  part(tail,[.22,.38,.22],dark,[0,-.64,-.29],.15);
  const legs: {upper:THREE.Group;lower:THREE.Group;phase:number}[]=[];
  for(const side of [-1,1])for(const front of [-1,1]) {
    const upper=new THREE.Group(),lower=new THREE.Group();upper.position.set(side*.29,1.25,front*.65);lower.position.y=-.52;
    root.add(upper);upper.add(lower);
    part(upper,[.19,.56,.22],coat,[0,-.25,0]);
    part(lower,[.13,.43,.15],front<0?coat:cream,[0,-.22,0]);
    part(lower,[.21,.16,.28],dark,[0,-.65,.04]);
    legs.push({upper,lower,phase:side===front?0:Math.PI});
  }
  for(const [group,list] of parts) {
    const g=mergeGeometries(list)!;list.forEach(p=>p.dispose());geometries.push(g);
    const mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  let stride=0;
  return {root,
    animate(speed:number,dt:number,time:number) {
      stride+=speed*dt*2.5;const amount=Math.min(1,speed/3);
      for(const leg of legs){const phase=stride+leg.phase;leg.upper.rotation.x=Math.sin(phase)*.48*amount;leg.lower.rotation.x=Math.max(0,-Math.sin(phase))*.55*amount;}
      body.position.y=Math.abs(Math.sin(stride))*0.035*amount;
      head.rotation.x=Math.sin(stride)*.035*amount+Math.sin(time*.9)*.018;
      tail.rotation.z=Math.sin(time*1.8)*.12;
    },
    dispose(){geometries.forEach(g=>g.dispose());material.dispose();root.clear();},
  };
}
