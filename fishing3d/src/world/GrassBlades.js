import * as THREE from 'three';
import { createRandom, clamp } from '../core/MathUtils.js';

/**
 * Césped de briznas reales alrededor del jugador.
 *
 * La hierba lejana son cartas cruzadas (`Vegetation`), que a distancia se leen
 * perfectamente y cuestan poco. De cerca eso canta, así que aquí hay briznas
 * de verdad: cintas curvadas de cuatro segmentos, instanciadas.
 *
 * El truco para que salga barato es que el conjunto de briznas es fijo y
 * *acompaña* al jugador: cuando se aleja lo suficiente, sus posiciones se
 * recalculan sobre el terreno del sitio nuevo. Así hay césped denso en todo el
 * mapa con un número de instancias acotado y una sola draw call.
 */

const PATCH_RADIUS = 9.5;     // metros de césped denso alrededor del jugador
const GRASS_STEP = 2.5;           // el césped se recoloca cuando el jugador anda esto

/** Una brizna: cinta que se estrecha hacia la punta y se curva hacia atrás. */
function bladeGeometry({ segments = 4, height = 1, width = 0.032, bend = 0.3 } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = width * (1 - Math.pow(t, 1.4)) * 0.5;
    const y = t * height;
    const z = Math.pow(t, 2) * bend;          // se dobla hacia atrás
    positions.push(-w, y, z, w, y, z);
    normals.push(0, 0, 1, 0, 0, 1);
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export class GrassBlades {
  constructor(scene, terrain, preset, { seed = 5150, density = 1 } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.rng = createRandom(seed);
    this.count = Math.floor(9000 * preset.grassDensity * density);
    this.enabled = this.count > 0;
    if (!this.enabled) return;

    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector3(1, 0, 0.3) }
    };

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      // Sin `vertexColors`: el color va por instancia y la geometría de la
      // brizna no tiene atributo de color — activarlo la pintaba de negro.
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide
    });
    this._addWind(material);

    this.mesh = new THREE.InstancedMesh(bladeGeometry(), material, this.count);
    this.mesh.name = 'cesped';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3);
    scene.add(this.mesh);

    // Reparto fijo dentro del disco: sólo cambia el centro al moverse.
    this.offsets = [];
    for (let i = 0; i < this.count; i++) {
      const angle = this.rng() * Math.PI * 2;
      // Raíz cuadrada para que la densidad sea uniforme en área, no en radio.
      const radius = Math.sqrt(this.rng()) * PATCH_RADIUS;
      // Las briznas del borde se acortan: sin esto el disco de césped se
      // corta en un círculo perfectamente visible alrededor del jugador.
      const edgeFade = 1 - Math.pow(clamp(radius / PATCH_RADIUS, 0, 1), 3.5);
      this.offsets.push({
        dx: Math.cos(angle) * radius,
        dz: Math.sin(angle) * radius,
        edgeFade,
        rotation: this.rng() * Math.PI * 2,
        height: 0.24 + this.rng() * 0.4,
        lean: (this.rng() - 0.5) * 0.35,
        tint: this.rng()
      });
    }

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._last = new THREE.Vector3(1e9, 0, 1e9);
    this.budget = this.count;
  }

  _addWind(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uWind = this.uniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `
          #include <common>
          uniform float uTime;
          uniform vec3 uWind;
        `)
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          // La punta se dobla; la base no se mueve del suelo.
          float blade = clamp(position.y * 2.2, 0.0, 1.6);
          vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float phase = root.x * 0.7 + root.z * 0.55;
          float gust = sin(uTime * 2.1 + phase) * 0.6 + sin(uTime * 3.7 + phase * 1.6) * 0.4;
          transformed.xz += uWind.xz * gust * blade * 0.055;
        `);
    };
    material.customProgramCacheKey = () => 'cespedViento';
  }

  /** Recoloca el disco de césped alrededor del jugador. */
  _rebuild(center) {
    const d = this._dummy;
    const water = this.terrain.waterLevel;
    let placed = 0;

    for (let i = 0; i < this.offsets.length && placed < this.budget; i++) {
      const o = this.offsets[i];
      const x = center.x + o.dx;
      const z = center.z + o.dz;
      const y = this.terrain.heightAt(x, z);

      // Ni dentro del agua, ni en pendientes donde no agarra tierra.
      if (y < water + 0.08 || y > 22 || this.terrain.slopeAt(x, z) > 0.45) continue;

      d.position.set(x, y - 0.02, z);
      d.rotation.set(o.lean * 0.4, o.rotation, o.lean);
      d.scale.set(1, o.height * o.edgeFade, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(placed, d.matrix);

      // Verdes distintos por brizna: sin esto el césped se ve como fieltro.
      this._color.setHSL(0.23 + o.tint * 0.06, 0.32 + o.tint * 0.22, 0.26 + o.tint * 0.2);
      this.mesh.setColorAt(placed, this._color);
      placed++;
    }

    this.mesh.count = placed;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, wind, playerPosition) {
    if (!this.enabled) return;
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value.set(wind.x, 0, wind.z);

    if (this._last.distanceToSquared(playerPosition) < GRASS_STEP * GRASS_STEP) return;
    this._last.copy(playerPosition);
    this._rebuild(playerPosition);
  }

  /** Reduce o restaura la cantidad de briznas sin reconstruir nada. */
  setBudget(fraction) {
    this.budget = Math.floor(this.count * clamp(fraction, 0.1, 1));
    this._last.set(1e9, 0, 1e9);
  }

  get stats() { return { pobladas: this.mesh?.count ?? 0, total: this.count, presupuesto: this.budget }; }

  dispose() {
    if (!this.enabled) return;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
  }
}
