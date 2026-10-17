import * as THREE from 'three';

export function createAtmosphere(): THREE.Group {
  const group = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(350, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color(0xd4e8da) },
        zenith: { value: new THREE.Color(0x69bce7) },
      },
      vertexShader: `varying vec3 direction;
        void main() { direction = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; varying vec3 direction;
        void main() { float t = pow(max(direction.y, 0.0), 0.55); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0); }`,
    }),
  );
  sky.name = 'runtime-sky';
  sky.renderOrder = -1;
  group.add(sky);

  const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6e5 });
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 1);
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 36);
  const cloud = new THREE.Object3D();
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    for (let j = 0; j < 3; j++) {
      cloud.position.set(Math.cos(angle) * 190 + j * 6, 45 + (i % 3) * 9, Math.sin(angle) * 190);
      cloud.scale.set(10, 3 + j, 5);
      cloud.updateMatrix();
      clouds.setMatrixAt(i*3+j,cloud.matrix);
    }
  }
  clouds.instanceMatrix.needsUpdate = true;
  group.add(clouds);

  // Visual-only valley floor hides the gap between the playable tile and backdrop.
  const outer = new THREE.Shape();
  outer.moveTo(-280, -280);
  outer.lineTo(280, -280);
  outer.lineTo(280, 280);
  outer.lineTo(-280, 280);
  outer.closePath();
  const opening = new THREE.Path();
  opening.moveTo(-120, -120);
  opening.lineTo(-120, 120);
  opening.lineTo(120, 120);
  opening.lineTo(120, -120);
  opening.closePath();
  outer.holes.push(opening);
  const valley = new THREE.Mesh(
    new THREE.ShapeGeometry(outer).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x80ae69, roughness: 1, flatShading: true }),
  );
  valley.name = 'visual-only-valley-floor';
  valley.position.y = -1.15;
  group.add(valley);
  return group;
}
