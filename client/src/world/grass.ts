import * as THREE from 'three';

// Section-centre distances; both scenery loaders use the same static grass budget.
export const GRASS_DISTANCES = [0, 28, 52, 75] as const;
// Keep clumps through the middle distance; simplify their geometry before thinning.
export function grassDensityStride(lod:number):number { return lod < 2 ? 1 : 2; }

/** Opaque tapered blades: no texture cards or alpha overdraw. */
export function createGrass(): THREE.Group {
  const root=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  const base=new THREE.Color(0x527536),tips=[0x89ac50,0x789b43,0x9bb55e].map(color=>new THREE.Color(color));
  for(let lod=0;lod<3;lod++) {
    const vertices:number[]=[],colors:number[]=[];
    for(let i=0;i<6-lod*2;i++) {
      const angle=i*2.399963, x=Math.cos(angle)*0.14,z=Math.sin(angle)*0.14;
      // Two low, broad leaves enrich the nearest clump without adding triangles.
      const leaf=i>=4,width=leaf?0.11:0.055;
      const dx=Math.cos(angle+1)*width,dz=Math.sin(angle+1)*width;
      const height=leaf?0.18:0.28+(i%3)*0.09;
      vertices.push(x-dx,0,z-dz,x+dx,0,z+dz,x+dx*2,height,z+dz*2);
      for(const color of [base,base,tips[i%tips.length]])colors.push(color.r,color.g,color.b);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`grass_LOD${lod}`;root.add(mesh);
  }
  return root;
}
