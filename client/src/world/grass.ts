import * as THREE from 'three';

/** Opaque tapered blades: no texture cards or alpha overdraw. */
export function createGrass(): THREE.Group {
  const root=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({color:0x79a844,roughness:1,side:THREE.DoubleSide});
  for(let lod=0;lod<3;lod++) {
    const vertices:number[]=[];
    for(let i=0;i<6-lod*2;i++) {
      const angle=i*2.399963, x=Math.cos(angle)*0.14,z=Math.sin(angle)*0.14;
      const dx=Math.cos(angle+1)*0.035,dz=Math.sin(angle+1)*0.035;
      const height=0.24+(i%3)*0.09;
      vertices.push(x-dx,0,z-dz,x+dx,0,z+dz,x+dx*2,height,z+dz*2);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`grass_LOD${lod}`;root.add(mesh);
  }
  return root;
}
