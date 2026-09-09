import * as THREE from 'three';

/** Fusiona geometrías indexadas con los mismos atributos (position/normal/uv). */
export function mergeGeometries(geometries) {
  const result = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'];
  const total = geometries.reduce((n, g) => n + g.attributes.position.count, 0);
  const buffers = {};
  names.forEach((name) => {
    const size = geometries[0].attributes[name].itemSize;
    buffers[name] = { array: new Float32Array(total * size), size, offset: 0 };
  });

  const indices = [];
  let vertexOffset = 0;
  for (const g of geometries) {
    const indexed = g.index ? g : g.toNonIndexed();
    const src = indexed.index ? indexed : indexed;
    names.forEach((name) => {
      const data = src.attributes[name].array;
      buffers[name].array.set(data, buffers[name].offset);
      buffers[name].offset += data.length;
    });
    if (src.index) {
      const idx = src.index.array;
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + vertexOffset);
    } else {
      const count = src.attributes.position.count;
      for (let i = 0; i < count; i++) indices.push(i + vertexOffset);
    }
    vertexOffset += src.attributes.position.count;
  }

  names.forEach((name) => {
    result.setAttribute(name, new THREE.BufferAttribute(buffers[name].array, buffers[name].size));
  });
  result.setIndex(indices);
  return result;
}

/**
 * Dos planos cruzados en X, con el pivote en la base. Para hierba y follaje.
 *
 * `upBias` inclina las normales hacia arriba. Sin esto los planos son
 * verticales, su normal es horizontal y con el sol alto el producto N·L vale
 * casi cero: las copas salen negras a mediodía. Las hojas reales no son un
 * plano, así que fingir una normal más redonda es lo correcto, no un truco.
 */
export function crossPlanes(width, height, upBias = 0) {
  const a = new THREE.PlaneGeometry(width, height, 1, 2);
  a.translate(0, height / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const merged = mergeGeometries([a, b]);
  a.dispose();
  b.dispose();
  if (upBias > 0) {
    const normals = merged.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < normals.count; i++) {
      v.fromBufferAttribute(normals, i);
      v.multiplyScalar(1 - upBias);
      v.y += upBias;
      v.normalize();
      normals.setXYZ(i, v.x, v.y, v.z);
    }
    normals.needsUpdate = true;
  }
  return merged;
}

/**
 * Geometrías cacheadas por clave. Los cuerpos —jugador y personajes— se montan
 * todos con las mismas cápsulas y esferas: crear una malla nueva por persona
 * era gastar memoria y llamadas de dibujo para nada.
 */
const SHARED = new Map();
export function sharedGeometry(key, build) {
  let g = SHARED.get(key);
  if (!g) { g = build(); SHARED.set(key, g); }
  return g;
}

/** Segmento de extremidad que cuelga de su articulación. */
export function capsuleLimb(material, radius, length, { shadows = true } = {}) {
  const mesh = new THREE.Mesh(
    sharedGeometry(`limb:${radius}:${length}`, () => new THREE.CapsuleGeometry(radius, length, 4, 8)),
    material
  );
  mesh.position.y = -length / 2 - radius * 0.5;
  mesh.castShadow = shadows;
  return mesh;
}
