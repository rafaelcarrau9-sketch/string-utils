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

/**
 * Cuerpo de pez construido a partir de los datos de la especie.
 *
 * La silueta no está escrita a mano: sale de la relación peso/longitud del
 * catálogo. Una carpa (mucho peso por centímetro) queda alta y comprimida; un
 * lucio o un siluro, largos y bajos. Encima se montan caudal ahorquillada,
 * dorsal, anal y pectorales.
 *
 * Los colores van por vértice para dar el vientre claro, que es lo que hace
 * que un pez se lea como pez y no como un bulto.
 */
function fishGeometry(species) {
  if (geometryCache.has(species.id)) return geometryCache.get(species.id);

  // 0 = alargado (lucio, siluro), 1 = alto y comprimido (carpa, tenca).
  const chunk = clamp((species.weightPerLength - 0.0000073) / (0.000027 - 0.0000073), 0, 1);
  const height = 0.42 + chunk * 0.34;      // alto del cuerpo
  const width = 0.22 + chunk * 0.12;       // anchura (los peces son delgados)

  const body = new THREE.SphereGeometry(0.5, 20, 14);
  const pos = body.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.z / 0.5;                                   // -1 cola … +1 morro
    // Perfil: hocico afilado, lomo ancho por delante del centro, pedúnculo fino.
    const taper = Math.pow(1 - Math.abs(t) * 0.92, 0.55) * (1 - Math.pow(Math.max(0, -t), 2.4) * 0.55);
    const back = t > 0 ? 1 + t * 0.12 : 1;                 // lomo algo más alto delante
    v.x *= width * taper * 2;
    v.y *= height * taper * back * 2;
    v.z *= 2.05;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  body.computeVertexNormals();

  const parts = [body];

  // Caudal ahorquillada: dos lóbulos desde el pedúnculo.
  const caudal = new THREE.BufferGeometry();
  const cw = 0.02, ch = height * 1.35, cz = -1.02, tip = -1.62;
  const verts = new Float32Array([
    0, 0, cz,   0, ch, tip,   0, ch * 0.18, tip * 0.86,
    0, 0, cz,   0, -ch, tip,  0, -ch * 0.18, tip * 0.86
  ]);
  caudal.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  caudal.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts.length), 3));
  caudal.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
  caudal.computeVertexNormals();
  parts.push(caudal);

  // Aletas: dorsal, anal y dos pectorales, como planos finos.
  const fin = (w, h, x, y, z, rotY = 0, rotZ = 0) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(Math.PI / 2 + rotY);
    g.rotateZ(rotZ);
    g.translate(x, y, z);
    return g;
  };
  parts.push(fin(0.75, height * 0.75, 0, height * 0.95, 0.12));            // dorsal
  parts.push(fin(0.42, height * 0.5, 0, -height * 0.9, -0.42));            // anal
  parts.push(fin(0.34, 0.16, width * 1.5, -height * 0.35, 0.42, 0.5, 0.3));   // pectoral izq.
  parts.push(fin(0.34, 0.16, -width * 1.5, -height * 0.35, 0.42, -0.5, 0.3)); // pectoral der.

  const geo = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());

  // Vientre claro por vértice.
  const gp = geo.attributes.position;
  const colors = new Float32Array(gp.count * 3);
  const base = new THREE.Color(species.color);
  const pale = base.clone().lerp(new THREE.Color(0xf2ece0), species.belly ?? 0.85);
  const c = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const y = gp.getY(i);
    const t = clamp(0.5 - y / (height * 1.6), 0, 1);       // 1 abajo, 0 arriba
    c.copy(base).lerp(pale, Math.pow(t, 1.6));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Normalizado a exactamente 1 unidad de largo, morro a cola. Sin esto la
  // escala (longitud/100) no daba la longitud real: un lucio de 88 cm se
  // dibujaba de más de dos metros.
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const total = bb.max.z - bb.min.z;
  geo.translate(0, -(bb.max.y + bb.min.y) / 2, -(bb.max.z + bb.min.z) / 2);
  geo.scale(1 / total, 1 / total, 1 / total);

  geometryCache.set(species.id, geo);
  return geo;
}

function fishMaterial(species) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.34,
    metalness: 0.3,
    side: THREE.DoubleSide,
    flatShading: false
  });

  // Ondulación de nado en el vertex shader: la cola bate y el cuerpo serpentea.
  material.userData.uniforms = {
    uTime: { value: 0 },
    uSwim: { value: 1 },      // amplitud del coleteo
    uBeat: { value: 7 },      // frecuencia: los peces pequeños baten más rápido
    uFlex: { value: 0 }       // arqueo del cuerpo al forcejear
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform float uSwim;
        uniform float uBeat;
        uniform float uFlex;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        // La onda recorre el cuerpo de la cabeza a la cola, y la cola es la
        // que más se desplaza: así se lee como natación y no como vibración.
        float along = clamp(0.5 - transformed.z, 0.0, 1.4);
        float tailFactor = along * along;
        float wave = sin(uTime * uBeat - transformed.z * 5.0);
        transformed.x += wave * 0.085 * tailFactor * uSwim;
        // Al forcejear el cuerpo se arquea, no sólo colea.
        transformed.x += sin(uTime * uBeat * 1.7) * uFlex * 0.16 * along;
        transformed.y += cos(uTime * uBeat * 1.3) * uFlex * 0.06 * along;
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
    this.mesh = new THREE.Mesh(fishGeometry(this.species), this.material);
    this.mesh.scale.setScalar(scale);
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = false;
    this.mesh.visible = false;                // se enciende al acercarse
    this.mesh.userData.fish = this;

    // Los peces pequeños y rápidos baten más veces por segundo que los grandes.
    const sizeFactor = clamp(1.4 - this.length / 120, 0.45, 1.35);
    this.material.userData.uniforms.uBeat.value = 3.4 + this.species.speed * 1.5 * sizeFactor;

    this.heading2D = this.heading;
    this.turnRate = 0;
    this.pitch = 0;
    this.roll = 0;
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
    // Cobrado: la malla la coloca quien lo está mostrando, no el pez.
    if (this.state === FishState.CAUGHT) return;
    this.stateTime += dt;
    // El reloj del aleteo corre más deprisa cuanto más rápido nada.
    this.material.userData.uniforms.uTime.value +=
      dt * (0.55 + this.velocity.length() / Math.max(0.6, this.species.speed) * 0.9);

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

    // Huida: un pez no se queda quieto con alguien vadeando encima.
    if (!this.isBusy && context.playerPosition) {
      const dx = this.position.x - context.playerPosition.x;
      const dz = this.position.z - context.playerPosition.z;
      const near = Math.hypot(dx, dz);
      const alarm = context.playerNoise ?? 0;
      const radius = 4.5 + alarm * 5;
      if (near < radius && near > 0.01) {
        const push = (1 - near / radius) * this.species.speed * (0.5 + alarm);
        this.velocity.x += (dx / near) * push * dt * 6;
        this.velocity.z += (dz / near) * push * dt * 6;
        if (this.state !== FishState.ESCAPING && near < radius * 0.6) {
          this.interest = 0;
          this.setState(FishState.ESCAPING);
        }
      }
    }

    if (!this.isBusy) {
      // Corriente: el agua empuja al pez y él nada contra ella para aguantar
      // el puesto. El resultado es que en el río los peces se colocan mirando
      // aguas arriba, que es exactamente lo que hacen los de verdad.
      const flow = context.flowAt?.(this.position.x, this.position.z, this._flow ??= {});
      if (flow && (flow.x || flow.z)) {
        const fuerza = Math.hypot(flow.x, flow.z);
        // Los peces de corriente la remontan casi entera; los demás se dejan
        // llevar más y acaban buscando los remansos.
        const aguante = clamp(
          (this.species.prefersCurrent ? 1.05 : 0.7) * (this.species.speed / 4), 0.25, 1.05
        );
        this.position.x += flow.x * (1 - aguante) * dt;
        this.position.z += flow.z * (1 - aguante) * dt;
        // Encara aguas arriba: se suma una velocidad contra la corriente.
        this.velocity.x -= flow.x * aguante * 0.9;
        this.velocity.z -= flow.z * aguante * 0.9;
        this.inCurrent = fuerza;
      } else {
        this.inCurrent = 0;
      }
      this.position.addScaledVector(this.velocity, dt);
      this._clampToWater(context.terrain);
    }
    this._applyTransform(dt);
  }

  _applyTransform(dt) {
    this.mesh.position.copy(this.position);
    const speed = this.velocity.length();
    const u = this.material.userData.uniforms;

    if (speed > 0.02) {
      // Rumbo amortiguado: `lookAt` cada fotograma hacía que el pez girase de
      // golpe al menor cambio de velocidad.
      const desired = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = desired - this.heading2D;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      // Amortiguado y además con tope de velocidad angular: un pez gira
      // rápido, pero no instantáneamente. Sin el tope, un cambio brusco de
      // velocidad —tocar fondo, huir del jugador— se veía como un corte.
      const maxTurn = 5.0 * dt;                       // ~285°/s
      const turn = clamp(delta * (1 - Math.exp(-4.5 * dt)), -maxTurn, maxTurn);
      this.heading2D += turn;
      this.turnRate = damp(this.turnRate, turn / Math.max(dt, 1e-3), 6, dt);

      // Cabeceo al subir o bajar en el agua.
      const climb = clamp(this.velocity.y / Math.max(speed, 0.001), -1, 1);
      this.pitch = damp(this.pitch, -Math.asin(climb) * 0.7, 5, dt);
    } else {
      this.turnRate = damp(this.turnRate, 0, 6, dt);
    }

    // Alabeo: el pez se inclina hacia dentro de la curva.
    this.roll = damp(this.roll, clamp(-this.turnRate * 0.28, -0.5, 0.5), 5, dt);
    this.mesh.rotation.set(this.pitch, this.heading2D + Math.PI / 2, this.roll);

    // El coleteo sigue a la velocidad; la frecuencia, al tamaño de la especie.
    const cruise = Math.max(0.6, this.species.speed);
    u.uSwim.value = damp(u.uSwim.value, clamp(0.3 + (speed / cruise) * 1.5, 0.3, 2.4), 6, dt);
    const fighting = this.state === FishState.FIGHTING || this.state === FishState.HOOKED;
    u.uFlex.value = damp(u.uFlex.value, fighting ? 0.55 + (1 - this.energy) * -0.3 : 0, 4, dt);
  }

  /** No sale del agua ni atraviesa el fondo. */
  _clampToWater(terrain) {
    const bed = terrain.heightAt(this.position.x, this.position.z);
    const minY = bed + 0.18;
    const maxY = terrain.waterLevel - 0.15;
    if (minY >= maxY) {
      // Ha llegado a un bajío sin calado: da media vuelta hacia el centro.
      // Se encara al agua honda mezclando, no de un tirón.
      const hacia = new THREE.Vector3(-this.position.x, 0, -this.position.z)
        .normalize().multiplyScalar(this.species.speed * 0.4);
      this.velocity.lerp(hacia, 0.25);
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
      let angle = this.heading + (this.rng() - 0.5) * 2.2;
      let dist = 6 + this.rng() * 16;
      // Si es de banco y se ha quedado descolgado, tira hacia los suyos.
      if (this.shoal) {
        const dx = this.shoal.x - this.position.x;
        const dz = this.shoal.z - this.position.z;
        const lejos = Math.hypot(dx, dz);
        if (lejos > 16) {
          angle = Math.atan2(dz, dx) + (this.rng() - 0.5) * 0.9;
          dist = Math.min(lejos, 10 + this.rng() * 14);
        }
      }
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
