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
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    for (let j = 0; j < 3; j++) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      cloud.position.set(Math.cos(angle) * 120 + j * 6, 45 + (i % 3) * 9, Math.sin(angle) * 120);
      cloud.scale.set(10, 3 + j, 5);
      group.add(cloud);
    }
  }

  // Visual-only valley floor hides the gap between the playable tile and backdrop.
  const outer = new THREE.Shape();
  outer.moveTo(-220, -220);
  outer.lineTo(220, -220);
  outer.lineTo(220, 220);
  outer.lineTo(-220, 220);
  outer.closePath();
  const opening = new THREE.Path();
  opening.moveTo(-40, -40);
  opening.lineTo(-40, 40);
  opening.lineTo(40, 40);
  opening.lineTo(40, -40);
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
