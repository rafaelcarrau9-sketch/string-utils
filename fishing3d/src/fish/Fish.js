import * as THREE from 'three';
import { SPECIES_BY_ID, timeBand, weightFor } from './FishData.js';
import { clamp, lerp, damp, skewedRandom } from '../core/MathUtils.js';
import { mergeGeometries } from '../core/GeometryUtils.js';

/**
 * Un pez: cuerpo, animación de nado y máquina de estados.
 *
 * Estados: IDLE → SWIMMING → SEARCHING → INVESTIGATING → BITING → HOOKED →
 * FIGHTING → ESCAPING → CAUGHT. Cada especie modula tiempos y probabilidades
 * desde `FishData`, así que el comportamiento sale de los datos y no de
 * condicionales repartidos por el código.
 */

export const FishState = {
  IDLE: 'idle',
  SWIMMING: 'swimming',
  SEARCHING: 'searching',
  INVESTIGATING: 'investigating',
  BITING: 'biting',
  HOOKED: 'hooked',
  FIGHTING: 'fighting',
  ESCAPING: 'escaping',
  CAUGHT: 'caught'
};

const geometryCache = new Map();

/** Cuerpo de pez: elipsoide afilado + caudal + dorsal, fusionados. */
function fishGeometry(speciesId) {
  if (geometryCache.has(speciesId)) return geometryCache.get(speciesId);

  const body = new THREE.SphereGeometry(0.5, 14, 10);
  const pos = body.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.z / 0.5;                       // -1 cola, +1 morro
    const taper = 1 - Math.pow(Math.abs(t), 2.1) * 0.85;
    v.x *= 0.42 * taper;
    v.y *= 0.62 * taper;
    v.z *= 2.0;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  body.computeVertexNormals();

  const caudal = new THREE.PlaneGeometry(0.55, 0.7, 1, 1);
  caudal.rotateY(Math.PI / 2);
  caudal.translate(0, 0, -1.15);

  const dorsal = new THREE.PlaneGeometry(0.7, 0.3, 1, 1);
  dorsal.rotateY(Math.PI / 2);
  dorsal.translate(0, 0.3, 0.05);

  const geo = mergeGeometries([body, caudal, dorsal]);
  body.dispose(); caudal.dispose(); dorsal.dispose();
  geometryCache.set(speciesId, geo);
  return geo;
}

function fishMaterial(species) {
  const material = new THREE.MeshStandardMaterial({
    color: species.color,
    roughness: 0.42,
    metalness: 0.22,
    side: THREE.DoubleSide,
    flatShading: false
  });

  // Ondulación de nado en el vertex shader: la cola bate y el cuerpo serpentea.
  material.userData.uniforms = { uTime: { value: 0 }, uSwim: { value: 1 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = material.userData.uniforms.uTime;
    shader.uniforms.uSwim = material.userData.uniforms.uSwim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform float uSwim;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float tailFactor = clamp(-transformed.z * 0.9 + 0.35, 0.0, 1.6);
        transformed.x += sin(uTime * 7.0 + transformed.z * 2.4) * 0.09 * tailFactor * uSwim;
      `);
  };
  return material;
}

export class Fish {
  constructor(speciesId, { rng, position }) {
    this.species = SPECIES_BY_ID[speciesId];
    this.rng = rng;

    this.length = skewedRandom(rng, this.species.lengthRange[0], this.species.lengthRange[1], 2.4);
    this.weight = weightFor(this.species, this.length);
    this.trophy = (this.length - this.species.lengthRange[0]) /
      (this.species.lengthRange[1] - this.species.lengthRange[0]);

    this.state = FishState.SWIMMING;
    this.stateTime = 0;
    this.interest = 0;
    this.energy = 1;

    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.heading = rng() * Math.PI * 2;
    this.wanderTarget = position.clone();
    this.wanderTimer = 0;

    const scale = this.length / 100;          // cm → m
    this.material = fishMaterial(this.species);
    this.mesh = new THREE.Mesh(fishGeometry(this.species.id), this.material);
    this.mesh.scale.setScalar(scale);
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = false;
    this.mesh.visible = false;                // se enciende al acercarse
    this.mesh.userData.fish = this;
  }

  get displayName() { return this.species.name; }
  get isBusy() {
    return this.state === FishState.HOOKED || this.state === FishState.FIGHTING;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
  }

  /** Ganas de morder este señuelo, ahora, aquí. 0 = ni mirarlo. */
  appetite(lure, hour, weatherModifier, depth) {
    const s = this.species;
    const affinity = s.lures[lure.id] ?? 0.8;
    const band = s.activity[timeBand(hour)] ?? 1;
    const depthFit = 1 - clamp(
      Math.abs(depth - (s.depth[0] + s.depth[1]) / 2) / ((s.depth[1] - s.depth[0]) / 2 + 1.2),
      0, 1
    ) * 0.75;
    // Los ejemplares grandes son más desconfiados.
    const caution = 1 - this.trophy * 0.35;
    return affinity * band * depthFit * caution * weatherModifier * lure.attraction;
  }

  update(dt, context) {
    this.stateTime += dt;
    this.material.userData.uniforms.uTime.value += dt * (0.6 + this.velocity.length() * 0.5);

    switch (this.state) {
      case FishState.SWIMMING: this._wander(dt, context); break;
      case FishState.SEARCHING: this._search(dt, context); break;
      case FishState.INVESTIGATING: this._investigate(dt, context); break;
      case FishState.BITING: this._biting(dt, context); break;
      case FishState.ESCAPING: this._escape(dt, context); break;
      case FishState.HOOKED:
      case FishState.FIGHTING: break;   // los conduce FishingSystem
      default: break;
    }

    if (!this.isBusy) {
      this.position.addScaledVector(this.velocity, dt);
      this._clampToWater(context.terrain);
    }
    this._applyTransform(dt);
  }

  _applyTransform(dt) {
    this.mesh.position.copy(this.position);
    const speed = this.velocity.length();
    if (speed > 0.02) {
      const look = this.position.clone().addScaledVector(this.velocity, 1 / Math.max(speed, 0.001));
      this.mesh.lookAt(look);
    }
    this.material.userData.uniforms.uSwim.value = clamp(0.35 + speed * 0.5, 0.3, 2.2);
  }

  /** No sale del agua ni atraviesa el fondo. */
  _clampToWater(terrain) {
    const bed = terrain.heightAt(this.position.x, this.position.z);
    const minY = bed + 0.18;
    const maxY = terrain.waterLevel - 0.15;
    if (minY >= maxY) {
      // Ha llegado a un bajío sin calado: da media vuelta hacia el centro.
      this.velocity.set(-this.position.x, 0, -this.position.z).normalize().multiplyScalar(this.species.speed * 0.4);
      this.position.y = Math.min(maxY, minY);
      return;
    }
    if (this.position.y < minY) { this.position.y = minY; this.velocity.y = Math.abs(this.velocity.y) * 0.4; }
    if (this.position.y > maxY) { this.position.y = maxY; this.velocity.y = -Math.abs(this.velocity.y) * 0.4; }
  }

  _wander(dt, { terrain }) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 3 + this.rng() * 6;
      const s = this.species;
      const preferredDepth = lerp(s.depth[0], s.depth[1], this.rng());
      const angle = this.heading + (this.rng() - 0.5) * 2.2;
      const dist = 6 + this.rng() * 16;
      const nx = this.position.x + Math.cos(angle) * dist;
      const nz = this.position.z + Math.sin(angle) * dist;
      const depthThere = terrain.depthAt(nx, nz);
      if (depthThere > s.depth[0] * 0.6) {
        this.heading = angle;
        this.wanderTarget.set(nx, terrain.waterLevel - clamp(preferredDepth, 0.4, depthThere - 0.3), nz);
      } else {
        this.heading += Math.PI * (0.6 + this.rng() * 0.8);   // hacia aguas con calado
      }
    }
    this._steerTo(this.wanderTarget, this.species.speed * 0.28, dt);
  }

  _search(dt, context) {
    const lure = context.lurePosition;
    if (!lure) { this.setState(FishState.SWIMMING); return; }
    this._steerTo(lure, this.species.speed * 0.55, dt);
    if (this.position.distanceTo(lure) < 2.4) this.setState(FishState.INVESTIGATING);
    if (this.stateTime > 14) this.setState(FishState.ESCAPING);
  }

  _investigate(dt, context) {
    const lure = context.lurePosition;
    if (!lure) { this.setState(FishState.SWIMMING); return; }

    // Rodea el señuelo mientras se decide.
    const toLure = lure.clone().sub(this.position);
    const dist = toLure.length();
    const tangent = new THREE.Vector3(-toLure.z, 0, toLure.x).normalize();
    const desired = lure.clone()
      .addScaledVector(tangent, 0.9)
      .addScaledVector(toLure.normalize(), -0.7);
    this._steerTo(desired, this.species.speed * 0.4, dt);

    // El movimiento del señuelo despierta el ataque; quieto, desconfía.
    const action = context.lureAction || 0;
    const chance = this.interest * (0.25 + action * 0.9) * dt;
    if (this.rng() < chance && dist < 1.8) {
      this.setState(FishState.BITING);
      this.biteStrength = clamp(0.35 + this.interest * 0.5 + this.trophy * 0.4, 0.25, 1.6);
      context.onBite?.(this);
    } else if (this.stateTime > 6 + this.interest * 5) {
      this.setState(FishState.ESCAPING);
    }
  }

  _biting(dt, context) {
    const lure = context.lurePosition;
    if (lure) this._steerTo(lure, this.species.speed * 0.5, dt);
    // Ventana para clavar: si el jugador no reacciona, lo suelta.
    if (this.stateTime > 1.15 + this.species.stamina * 0.35) {
      context.onSpit?.(this);
      this.setState(FishState.ESCAPING);
    }
  }

  _escape(dt, { terrain }) {
    const away = this.position.clone().setY(0).normalize().negate().multiplyScalar(-1);
    this.velocity.lerp(away.multiplyScalar(this.species.speed * 0.6), 1 - Math.exp(-2 * dt));
    if (this.stateTime > 5) { this.interest = 0; this.setState(FishState.SWIMMING); }
  }

  _steerTo(target, speed, dt) {
    const desired = target.clone().sub(this.position);
    const d = desired.length();
    if (d < 0.001) return;
    desired.multiplyScalar(speed / d);
    this.velocity.x = damp(this.velocity.x, desired.x, 1.8, dt);
    this.velocity.y = damp(this.velocity.y, desired.y, 1.4, dt);
    this.velocity.z = damp(this.velocity.z, desired.z, 1.8, dt);
  }

  dispose() {
    this.material.dispose();
  }
}
