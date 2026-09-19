// A deliberately small glTF 2.0 writer: baked world-space meshes, one vertex-color material.
export function encodeGLB({ meshes, spec }) {
  const chunks = [];
  let byteLength = 0;
  const gltf = {
    asset: { version: '2.0', generator: 'Hangout World deterministic meadow generator', extras: { units: 'meters', upAxis: 'Y' } },
    scene: 0,
    scenes: [{ name: 'Fantasy Meadow Valley', nodes: [], extras: spec }],
    nodes: [], meshes: [], accessors: [], bufferViews: [],
    buffers: [{ byteLength: 0 }],
    materials: [{
      name: 'Opaque matte vertex colors',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
      alphaMode: 'OPAQUE', doubleSided: false,
    }],
  };

  function attribute(array, bounds = false) {
    const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const view = gltf.bufferViews.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buffer.byteLength, target: 34962 });
    chunks.push(buffer);
    byteLength += buffer.byteLength;
    const accessor = { bufferView: view, componentType: 5126, count: array.length / 3, type: 'VEC3' };
    if (bounds) {
      accessor.min = [Infinity, Infinity, Infinity];
      accessor.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < array.length; i++) {
        accessor.min[i % 3] = Math.min(accessor.min[i % 3], array[i]);
        accessor.max[i % 3] = Math.max(accessor.max[i % 3], array[i]);
      }
    }
    gltf.accessors.push(accessor);
    return gltf.accessors.length - 1;
  }

  for (const { name, geometry, extras } of meshes) {
    const attributes = {
      POSITION: attribute(geometry.getAttribute('position').array, true),
      NORMAL: attribute(geometry.getAttribute('normal').array),
      COLOR_0: attribute(geometry.getAttribute('color').array),
    };
    gltf.scenes[0].nodes.push(gltf.nodes.length);
    gltf.nodes.push({ name, mesh: gltf.meshes.length, extras });
    gltf.meshes.push({ name, primitives: [{ attributes, material: 0, mode: 4 }] });
  }
  gltf.buffers[0].byteLength = byteLength;
  const json = Buffer.from(JSON.stringify(gltf));
  const padding = (4 - json.length % 4) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + byteLength, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(byteLength, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, binaryHeader, ...chunks]);
}

export function decodeGLB(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2
    || buffer.readUInt32LE(8) !== buffer.length) throw new Error('Invalid GLB header');
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Missing JSON chunk');
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const binaryOffset = 20 + jsonLength;
  if (buffer.readUInt32LE(binaryOffset + 4) !== 0x004e4942) throw new Error('Missing BIN chunk');
  const binary = buffer.subarray(binaryOffset + 8);
  if (buffer.readUInt32LE(binaryOffset) !== binary.length) throw new Error('Invalid BIN length');
  return { json, binary };
}

export function readAttribute(document, index) {
  const accessor = document.json.accessors[index];
  const view = document.json.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') throw new Error('Expected float VEC3');
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const bytes = document.binary.subarray(start, start + accessor.count * 12);
  if (bytes.length !== accessor.count * 12) throw new Error('Accessor exceeds binary bounds');
  const values = [];
  for (let i = 0; i < bytes.length; i += 4) values.push(bytes.readFloatLE(i));
  return values;
}
