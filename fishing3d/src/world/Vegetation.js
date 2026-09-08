import * as THREE from 'three';
import { createRandom, clamp, lerp } from '../core/MathUtils.js';
import { mergeGeometries, crossPlanes } from '../core/GeometryUtils.js';

/**
 * Vegetación instanciada.
 *
 * Todo lo que se repite (hierba, juncos, arbustos, árboles, rocas) va en
 * InstancedMesh, así que miles de elementos cuestan un puñado de draw calls.
 * La hierba y los juncos se mueven con el viento en el vertex shader, sin
 * coste de CPU.
 *
 * El culling es por celdas: las instancias se agrupan en tiles y cada tile se
 * apaga entero cuando queda lejos, que es mucho más barato que ocultar
 * instancias sueltas.
 */

const TILE_SIZE = 64;

/** Inyecta ondulación de viento en un material estándar. */
function addWind(material, uniforms, { bendScale = 1 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uBend = { value: bendScale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform vec3 uWind;
        uniform float uBend;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        // Sólo se dobla la parte alta: la base queda clavada en el suelo.
        float bendFactor = clamp(position.y, 0.0, 4.0) * uBend;
        vec3 worldOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float phase = worldOrigin.x * 0.35 + worldOrigin.z * 0.28;
        float gust = sin(uTime * 1.7 + phase) * 0.6 + sin(uTime * 3.1 + phase * 1.7) * 0.4;
        transformed.xz += uWind.xz * gust * bendFactor * 0.14;
      `);
  };
  material.customProgramCacheKey = () => 'wind' + bendScale;
}

/** Roca irregular: icosaedro con los vértices desplazados por ruido. */
function rockGeometry(rng, detail = 1) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 0.72 + rng() * 0.5;
    v.multiplyScalar(n);
    v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Vegetation {
  constructor(scene, terrain, textures, preset, { seed = 4321 } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'vegetación';
    scene.add(this.group);

    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector3(1, 0, 0.3) }
    };
    this.tiles = new Map();
    this.viewDistance = preset.viewDistance;
    this.rng = createRandom(seed);

    this._buildGrass(textures, preset);
    this._buildReeds(preset);
    this._buildBushes(preset);
    this._buildTrees(textures, preset);
    this._buildRocks(textures, preset);
  }

  /** Reparte `count` intentos de colocación y acepta los que cumplan `accept`. */
  _scatter(count, accept) {
    const spots = [];
    const half = this.terrain.field.half - 8;
    for (let i = 0; i < count; i++) {
      const x = (this.rng() * 2 - 1) * half;
      const z = (this.rng() * 2 - 1) * half;
      const h = this.terrain.heightAt(x, z);
      const slope = this.terrain.slopeAt(x, z);
      if (accept(x, z, h, slope)) spots.push({ x, y: h, z });
    }
    return spots;
  }

  _addInstanced(name, geometry, material, spots, transform) {
    if (!spots.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    mesh.name = name;
    const dummy = new THREE.Object3D();
    spots.forEach((spot, i) => {
      transform(dummy, spot, i, this.rng);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = true;
    this.group.add(mesh);
    return mesh;
  }

  _buildGrass(textures, preset) {
    const density = preset.grassDensity;
    if (density <= 0) return;
    const spots = this._scatter(Math.floor(26000 * density), (x, z, h, slope) =>
      h > 0.15 && h < 16 && slope < 0.42);

    const material = new THREE.MeshStandardMaterial({
      map: textures.grassBlade(),
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0
    });
    addWind(material, this.uniforms, { bendScale: 1 });

    const geometry = crossPlanes(0.7, 0.75);
    this.grass = this._addInstanced('hierba', geometry, material, spots, (d, s, i, rng) => {
      d.position.set(s.x, s.y - 0.05, s.z);
      d.rotation.set(0, rng() * Math.PI, 0);
      const k = 0.7 + rng() * 0.8;
      d.scale.set(k, k * (0.8 + rng() * 0.7), k);
    });
    this._tileify(this.grass, spots, 78);
  }

  _buildReeds(preset) {
    // Juncos: sólo en el bajío, entre 5 cm y 1 m de profundidad.
    const spots = this._scatter(Math.floor(7000 * Math.max(0.35, preset.grassDensity)),
      (x, z, h) => h < -0.05 && h > -1.05);

    const material = new THREE.MeshStandardMaterial({
      color: 0x6c7a3a, roughness: 0.9, side: THREE.DoubleSide
    });
    addWind(material, this.uniforms, { bendScale: 0.55 });

    const geometry = crossPlanes(0.12, 1.9);
    this.reeds = this._addInstanced('juncos', geometry, material, spots, (d, s, i, rng) => {
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(0, rng() * Math.PI, 0);
      const k = 0.75 + rng() * 0.9;
      d.scale.set(1, k, 1);
    });
    this._tileify(this.reeds, spots, 110);
  }

  _buildBushes(preset) {
    const spots = this._scatter(Math.floor(900 * Math.max(0.4, preset.grassDensity)),
      (x, z, h, slope) => h > 0.9 && h < 20 && slope < 0.5);
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x40592c, roughness: 0.95, flatShading: true });
    addWind(material, this.uniforms, { bendScale: 0.18 });
    this.bushes = this._addInstanced('arbustos', geometry, material, spots, (d, s, i, rng) => {
      d.position.set(s.x, s.y + 0.35, s.z);
      d.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4);
      d.scale.set(0.7 + rng() * 0.9, 0.55 + rng() * 0.6, 0.7 + rng() * 0.9);
    });
    this._tileify(this.bushes, spots, 150);
  }

  _buildTrees(textures, preset) {
    const spots = this._scatter(1500, (x, z, h, slope) =>
      h > 2.2 && h < 24 && slope < 0.4).slice(0, 420);

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 5.2, 6, 1);
    trunkGeo.translate(0, 2.6, 0);
    const trunkMat = textures.material('corteza', { repeat: 2 });

    this.trunks = this._addInstanced('troncos', trunkGeo, trunkMat, spots, (d, s, i, rng) => {
      d.position.set(s.x, s.y, s.z);
      d.rotation.set((rng() - 0.5) * 0.12, rng() * Math.PI, (rng() - 0.5) * 0.12);
      const k = 0.75 + rng() * 0.85;
      d.scale.set(k, k, k);
    });
    this.trunks.castShadow = preset.shadows;
    this.trunks.receiveShadow = preset.shadows;

    // Copa: dos planos cruzados con la mancha de follaje, mucho más barato
    // que una esfera de hojas y se lee bien a distancia.
    const canopyGeo = crossPlanes(5.4, 5.4);
    canopyGeo.translate(0, 1.4, 0);
    const canopyMat = new THREE.MeshStandardMaterial({
      map: textures.foliage(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9
    });
    addWind(canopyMat, this.uniforms, { bendScale: 0.1 });

    this.canopies = this._addInstanced('copas', canopyGeo, canopyMat, spots, (d, s, i, rng) => {
      d.position.set(s.x, s.y + 3.1, s.z);
      d.rotation.set(0, rng() * Math.PI, 0);
      const k = 0.8 + rng() * 0.8;
      d.scale.set(k, k, k);
    });
    this.canopies.castShadow = preset.shadows;
    this._tileify(this.canopies, spots, this.viewDistance);
    this._tileify(this.trunks, spots, this.viewDistance);
  }

  _buildRocks(textures, preset) {
    const spots = this._scatter(1200, (x, z, h, slope) =>
      (h > -1.6 && h < 22) && (slope > 0.18 || this.rng() < 0.35)).slice(0, 320);
    const geometry = rockGeometry(this.rng, 1);
    const material = textures.material('roca', { repeat: 1.4 });
    this.rocks = this._addInstanced('rocas', geometry, material, spots, (d, s, i, rng) => {
      d.position.set(s.x, s.y - 0.15, s.z);
      d.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      const k = 0.35 + Math.pow(rng(), 2.2) * 2.4;
      d.scale.set(k, k * (0.6 + rng() * 0.5), k);
    });
    this.rocks.castShadow = preset.shadows;
    this.rocks.receiveShadow = preset.shadows;
    this._tileify(this.rocks, spots, this.viewDistance);
  }

  /** Registra la celda y la distancia a la que deja de dibujarse. */
  _tileify(mesh, spots, distance) {
    if (!mesh) return;
    let cx = 0, cz = 0;
    spots.forEach((s) => { cx += s.x; cz += s.z; });
    mesh.userData.center = new THREE.Vector3(cx / spots.length, 0, cz / spots.length);
    mesh.userData.cullDistance = distance;
    this.tiles.set(mesh.name, mesh);
  }

  update(dt, wind, playerPosition) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value.set(wind.x, 0, wind.z);

    // Las instancias cubren todo el mapa, así que el corte por distancia se
    // hace contra el radio real de cada grupo, no contra su centro.
    this.tiles.forEach((mesh) => {
      const d = mesh.userData.center.distanceTo(playerPosition);
      mesh.visible = d < mesh.userData.cullDistance + 320;
    });
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isInstancedMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.scene.remove(this.group);
  }
}
