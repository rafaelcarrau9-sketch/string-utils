import * as THREE from 'three';
import { damp, clamp, createRandom } from '../core/MathUtils.js';
import { sharedGeometry, capsuleLimb } from '../core/GeometryUtils.js';

/**
 * Personajes del mundo.
 *
 * Mismo enfoque que el cuerpo del jugador: una jerarquía de articulaciones
 * animada por código, sin esqueletos ni clips. Cada personaje respira, cambia
 * el peso de pierna, mira alrededor y, cuando el jugador se acerca, gira la
 * cabeza y el torso hacia él. No hay ni un solo NPC quieto como un poste.
 *
 * Sobre la cabeza llevan un indicador que dice si tienen algo que ofrecer.
 */

const MARKER_COLORS = { nueva: 0xf2c14e, entregar: 0x74d68a, hablar: 0x6fd3c7 };

export class Npc {
  /** `data` es la ficha de StoryData; `spot` es {position, yaw}. */
  constructor(data, spot, preset, { shadows = true } = {}) {
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.homeYaw = spot.yaw;
    this.rng = createRandom(data.id.length * 977 + data.name.length * 31);

    const p = data.palette ?? {};
    const skin = new THREE.MeshStandardMaterial({ color: p.skin ?? 0xd7ab84, roughness: 0.76 });
    const coat = new THREE.MeshStandardMaterial({ color: p.coat ?? 0x39505f, roughness: 0.87 });
    const trousers = new THREE.MeshStandardMaterial({ color: p.trousers ?? 0x33383f, roughness: 0.9 });
    const hat = new THREE.MeshStandardMaterial({ color: p.hat ?? 0x7a6a3c, roughness: 0.92 });
    this._materials = [skin, coat, trousers, hat];

    this.root = new THREE.Group();
    this.root.name = `npc:${data.id}`;
    this.root.position.copy(spot.position);
    this.root.rotation.y = spot.yaw;

    // Estatura ligeramente distinta por personaje: no son clones.
    this.height = 0.94 + this.rng() * 0.11;
    this.root.scale.setScalar(this.height);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.root.add(this.hips);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(sharedGeometry('chest', () => new THREE.CapsuleGeometry(0.19, 0.32, 5, 10)), coat);
    chest.position.y = 0.26;
    chest.scale.z = 0.72;
    chest.castShadow = shadows;
    this.torso.add(chest);

    this.neck = new THREE.Group();
    this.neck.position.y = 0.52;
    this.torso.add(this.neck);
    const head = new THREE.Mesh(sharedGeometry('head', () => new THREE.SphereGeometry(0.132, 14, 12)), skin);
    head.castShadow = shadows;
    this.neck.add(head);
    const brim = new THREE.Mesh(sharedGeometry('brim', () => new THREE.CylinderGeometry(0.24, 0.24, 0.02, 14)), hat);
    brim.position.y = 0.072;
    this.neck.add(brim);
    const crown = new THREE.Mesh(sharedGeometry('crown', () => new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hat);
    crown.position.y = 0.075;
    this.neck.add(crown);

    this.arms = {};
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * 0.225, 0.43, 0);
      this.torso.add(shoulder);
      shoulder.add(capsuleLimb(coat, 0.053, 0.25));
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      elbow.add(capsuleLimb(skin, 0.046, 0.23));
      this.arms[side] = { shoulder, elbow };
    }

    this.legs = {};
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(sign * 0.105, 0, 0);
      this.hips.add(hip);
      hip.add(capsuleLimb(trousers, 0.072, 0.33));
      const knee = new THREE.Group();
      knee.position.y = -0.41;
      hip.add(knee);
      knee.add(capsuleLimb(trousers, 0.06, 0.31));
      const foot = new THREE.Mesh(sharedGeometry('foot', () => new THREE.BoxGeometry(0.105, 0.058, 0.23)), coat);
      foot.position.set(0, -0.41, 0.05);
      foot.castShadow = shadows;
      knee.add(foot);
      this.legs[side] = { hip, knee };
    }

    this._buildMarker();

    // Estado de animación.
    this.t = this.rng() * 20;
    this.breath = 0;
    this.weight = 0;             // -1 pierna izquierda, +1 derecha
    this.weightTarget = 0;
    this.weightTimer = 1 + this.rng() * 3;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.glanceTimer = 2 + this.rng() * 4;
    this.glanceYaw = 0;
    this.attention = 0;          // 0 a lo suyo, 1 mirando al jugador
    this.gesture = 0;            // realce del gesto al hablar
  }

  _buildMarker() {
    this.marker = new THREE.Group();
    this.marker.position.y = 1.86;
    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: MARKER_COLORS.nueva, transparent: true, opacity: 0.95, depthWrite: false
    });
    const body = new THREE.Mesh(sharedGeometry('marker', () => new THREE.OctahedronGeometry(0.13, 0)), this.markerMaterial);
    body.scale.y = 1.5;
    this.marker.add(body);
    this.marker.visible = false;
    this.root.add(this.marker);
  }

  setMarker(kind) {
    this.marker.visible = !!kind;
    if (kind && MARKER_COLORS[kind]) this.markerMaterial.color.setHex(MARKER_COLORS[kind]);
  }

  /** Se llama mientras el personaje tiene la palabra: gesticula un poco más. */
  speak() { this.gesture = 1; }

  get position() { return this.root.position; }

  /**
   * `playerPosition` decide si el personaje está a lo suyo o pendiente de ti.
   * Todo se amortigua: nadie gira la cabeza de golpe.
   */
  update(dt, playerPosition = null, talking = false) {
    this.t += dt;

    // Respiración: el torso sube y baja y el pecho se ensancha un poco.
    this.breath = Math.sin(this.t * 1.05) * 0.5 + 0.5;
    this.torso.position.y = this.breath * 0.011;
    this.torso.scale.setScalar(1 + this.breath * 0.008);

    // Cambio de peso de pierna, como quien lleva un rato de pie.
    this.weightTimer -= dt;
    if (this.weightTimer <= 0) {
      this.weightTimer = 2.5 + this.rng() * 5;
      this.weightTarget = (this.rng() - 0.5) * 1.6;
    }
    this.weight = damp(this.weight, this.weightTarget, 1.6, dt);
    this.hips.position.y = 0.92 - Math.abs(this.weight) * 0.022;
    this.hips.rotation.z = this.weight * 0.055;
    this.hips.rotation.y = this.weight * 0.05;
    this.legs.L.hip.rotation.x = this.weight * 0.09;
    this.legs.R.hip.rotation.x = -this.weight * 0.09;
    this.legs.L.knee.rotation.x = Math.max(0, this.weight) * 0.14;
    this.legs.R.knee.rotation.x = Math.max(0, -this.weight) * 0.14;

    // ¿Hay alguien cerca a quien atender?
    let deseoYaw = 0, deseoPitch = 0, cerca = 0;
    if (playerPosition) {
      const dx = playerPosition.x - this.root.position.x;
      const dz = playerPosition.z - this.root.position.z;
      const dist = Math.hypot(dx, dz);
      cerca = talking ? 1 : clamp((7.5 - dist) / 4.5, 0, 1);
      if (cerca > 0.01) {
        let delta = Math.atan2(dx, dz) - this.root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        // El cuello no gira 180°: si te pones detrás, sólo te sigue hasta donde puede.
        deseoYaw = clamp(delta, -1.15, 1.15);
        const dy = (playerPosition.y + 0.2) - (this.root.position.y + 1.55 * this.height);
        deseoPitch = clamp(-Math.atan2(dy, Math.max(1, dist)), -0.35, 0.35);
      }
    }
    this.attention = damp(this.attention, cerca, 3.4, dt);

    // Con alguien delante no basta con girar el cuello: el cuerpo se vuelve.
    // Sin esto, hablar con un personaje era hablarle a su espalda.
    if (playerPosition && this.attention > 0.25) {
      const dx = playerPosition.x - this.root.position.x;
      const dz = playerPosition.z - this.root.position.z;
      let delta = Math.atan2(dx, dz) - this.root.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      // Se gira sólo lo que el cuello no alcanza: mantiene su postura de
      // trabajo si estás casi delante y se da la vuelta si estás detrás. En
      // plena conversación se cuadra casi del todo, como hace cualquiera.
      const margen = talking ? 0.16 : 0.55;
      const resto = delta - clamp(delta, -margen, margen);
      if (Math.abs(resto) > 0.01) {
        this.root.rotation.y += resto * (1 - Math.exp(-3.2 * dt)) * this.attention;
      }
    } else if (playerPosition) {
      // Cuando se va, vuelve poco a poco a su orientación de siempre.
      let back = this.homeYaw - this.root.rotation.y;
      while (back > Math.PI) back -= Math.PI * 2;
      while (back < -Math.PI) back += Math.PI * 2;
      this.root.rotation.y += back * (1 - Math.exp(-0.9 * dt));
    }

    // Cuando no atiende a nadie, echa vistazos alrededor.
    this.glanceTimer -= dt;
    if (this.glanceTimer <= 0) {
      this.glanceTimer = 2.5 + this.rng() * 5.5;
      this.glanceYaw = (this.rng() - 0.5) * 1.1;
    }
    const objetivoYaw = deseoYaw * this.attention + this.glanceYaw * (1 - this.attention);
    const objetivoPitch = deseoPitch * this.attention + Math.sin(this.t * 0.37) * 0.05 * (1 - this.attention);
    this.lookYaw = damp(this.lookYaw, objetivoYaw, 4.2, dt);
    this.lookPitch = damp(this.lookPitch, objetivoPitch, 4.2, dt);
    // El giro se reparte entre cuello y torso, como hace un cuerpo real.
    this.neck.rotation.set(this.lookPitch, this.lookYaw * 0.62, this.lookYaw * 0.06);
    this.torso.rotation.y = this.lookYaw * 0.34;

    // Brazos: sueltos, con un balanceo mínimo. Al hablar, gesticulan.
    this.gesture = damp(this.gesture, talking ? 1 : 0, talking ? 5 : 1.8, dt);
    const idleSwing = Math.sin(this.t * 0.62) * 0.035;
    const habla = Math.sin(this.t * 4.3) * 0.5 + Math.sin(this.t * 2.7 + 1.1) * 0.35;
    this.arms.R.shoulder.rotation.set(
      idleSwing + this.gesture * (0.28 + habla * 0.34), 0, -0.09 - this.gesture * 0.22
    );
    this.arms.R.elbow.rotation.x = -0.22 - this.gesture * (0.75 + habla * 0.3);
    this.arms.L.shoulder.rotation.set(
      -idleSwing + this.gesture * (0.14 + habla * 0.16), 0, 0.09 + this.gesture * 0.1
    );
    this.arms.L.elbow.rotation.x = -0.2 - this.gesture * 0.4;

    // El indicador flota y gira: se ve desde lejos sin ser un cartel.
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 1.5;
      this.marker.position.y = 1.86 + Math.sin(this.t * 1.9) * 0.06;
    }
  }

  dispose() {
    // Las geometrías son compartidas: sólo se sueltan los materiales, que sí
    // son propios de cada personaje.
    this._materials.forEach((m) => m.dispose());
    this.markerMaterial.dispose();
    this.root.parent?.remove(this.root);
  }
}

/**
 * Los personajes de una zona. Se reconstruye con el mundo, igual que los
 * árboles: cada zona tiene los suyos.
 */
export class NpcCrew {
  constructor(scene, npcList, props, preset) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'personajes';
    scene.add(this.group);
    this.npcs = [];
    // Si dos personajes comparten sitio, el segundo se aparta un paso.
    const usados = new Map();
    for (const data of npcList) {
      const anchor = props.npcAnchors?.[data.anchor] ?? props.npcAnchors?.orilla;
      if (!anchor) continue;
      const n = usados.get(data.anchor) ?? 0;
      usados.set(data.anchor, n + 1);
      const spot = {
        position: anchor.position.clone().add(
          new THREE.Vector3(Math.cos(n * 2.1) * n * 1.6, 0, Math.sin(n * 2.1) * n * 1.6)
        ),
        yaw: anchor.yaw + (n ? 0.4 : 0)
      };
      spot.position.y = props.terrain.heightAt(spot.position.x, spot.position.z);
      const npc = new Npc(data, spot, preset, { shadows: preset.shadows });
      this.group.add(npc.root);
      this.npcs.push(npc);
    }
  }

  byId(id) { return this.npcs.find((n) => n.id === id) ?? null; }

  update(dt, playerPosition, talkingId = null) {
    for (const npc of this.npcs) npc.update(dt, playerPosition, npc.id === talkingId);
  }

  dispose() {
    this.npcs.forEach((n) => n.dispose());
    this.npcs.length = 0;
    this.scene.remove(this.group);
  }
}
