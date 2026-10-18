import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHorse } from './horse';
import type { CollisionWorld } from './collision';
import type { RidePose } from '../../../shared/rides';

/** Kenney CC0 cart, with its two authored wheel meshes pivoted at their hubs. */
export function createCart() {
  const root = new THREE.Group(), horse = createHorse();
  root.name = 'Orchard cart';
  horse.root.position.z = 2;
  root.add(horse.root);
  const wheels: THREE.Group[] = [];
  const wood = new THREE.MeshStandardMaterial({ color: 0x795034, roughness: 1 });
  const fittings: THREE.Mesh[] = [];
  let disposed = false;
  let cartRoot:THREE.Group|undefined;
  const box = (size: number[], position: number[]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]), wood);
    mesh.position.fromArray(position);mesh.castShadow=true;root.add(mesh);fittings.push(mesh);
  };
  // Driver's bench, backrest and shafts run alongside the horse.
  box([1.25,.15,.48],[0,1.33,-1]);
  box([1.25,.35,.1],[0,1.53,-1.28]);
  for (const side of [-1,1]) box([.065,.065,2.6],[side*.5,1.12,.75]);
  const disposeAsset = (asset:THREE.Object3D) => {
    const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    asset.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const material of materials){for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);material.dispose();}
    textures.forEach(texture=>texture.dispose());
  };
  const ready = new GLTFLoader().loadAsync('/environment-expansion/kenney-cart.glb').then(gltf=>{
    if(disposed){disposeAsset(gltf.scene);return;}
    const cart=gltf.scene;cartRoot=cart;cart.scale.setScalar(2);cart.position.z=-1.5;
    const wheelMeshes:THREE.Mesh[]=[];
    cart.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;if(o.name.startsWith('Group'))wheelMeshes.push(o);}});
    for(const wheel of wheelMeshes){
      wheel.geometry.computeBoundingBox();
      const center=wheel.geometry.boundingBox!.getCenter(new THREE.Vector3());
      const pivot=new THREE.Group();pivot.position.copy(wheel.position).add(center);
      wheel.parent!.add(pivot);pivot.add(wheel);wheel.position.copy(center).negate();wheels.push(pivot);
    }
    root.add(cart);
  });
  return {root,ready,
    ground(pose:RidePose,collision:CollisionWorld){
      const support=(offset:number)=>collision.supportHeightAt(pose.x+Math.sin(pose.heading)*offset,pose.z+Math.cos(pose.heading)*offset,pose.y,.4);
      const front=support(2),rear=support(-1.1),shift=rear-pose.y;
      horse.root.position.y=front-pose.y;
      horse.root.rotation.x=-Math.atan2(support(2.9)-support(1.1),1.8);
      if(cartRoot)cartRoot.position.y=shift;
      fittings[0].position.y=1.33+shift;fittings[1].position.y=1.53+shift;
      for(const shaft of fittings.slice(2)){shaft.position.y=1.12+(front+rear)/2-pose.y;shaft.rotation.x=-Math.atan2(front-rear,3.1);}
      return shift;
    },
    animate(speed:number,dt:number,time:number){horse.animate(speed,dt,time);for(const wheel of wheels)wheel.rotation.x+=speed*dt/.46776;},
    dispose(){disposed=true;horse.dispose();for(const child of root.children)if(child!==horse.root&&!fittings.includes(child as THREE.Mesh))disposeAsset(child);fittings.forEach(mesh=>mesh.geometry.dispose());wood.dispose();root.clear();},
  };
}
