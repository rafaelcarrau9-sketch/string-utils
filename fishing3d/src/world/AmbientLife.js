import * as THREE from 'three';
import { createRandom, clamp, damp, lerp } from '../core/MathUtils.js';

/**
 * Vida ambiental: lo que ocurre en el lago sin que el jugador haga nada.
 *
 * Peces que saltan a lo lejos, bandos de pájaros cruzando, rachas de viento
 * que recorren la vegetación y anillos sueltos en la superficie. Nada de esto
 * afecta a la partida; está para que el sitio no parezca una maqueta.
 *
 * Todos los eventos se reparten en el tiempo con esperas aleatorias y se
 * modulan con la hora y el tiempo atmosférico: al amanecer salta más pescado,
 * con tormenta no hay pájaros.
 */

const JUMP_POOL = 4;
const BIRD_POOL = 6;

export class AmbientLife {
  constructor(scene, terrain, water, { seed = 606, audio = null } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.water = water;
    this.audio = audio;
    this.rng = createRandom(seed);

    this.group = new THREE.Group();
    this.group.name = 'ambiente';
    scene.add(this.group);

    this.jumpTimer = 6 + this.rng() * 10;
    this.birdTimer = 12 + this.rng() * 20;
    this.gustTimer = 8 + this.rng() * 14;
    this.rippleTimer = 3 + this.rng() * 5;
    this.gust = 0;

    this._buildJumpers();
    this._buildBirds();
  }

  _buildJumpers() {
    const geometry = new THREE.SphereGeometry(0.5, 8, 6);
    const pos = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const taper = 1 - Math.pow(Math.abs(v.z / 0.5), 2) * 0.8;
      v.x *= 0.3 * taper; v.y *= 0.5 * taper; v.z *= 2.1;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();

    this.jumpers = [];
    for (let i = 0; i < JUMP_POOL; i++) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0x8d9aa2, roughness: 0.3, metalness: 0.35
      }));
      mesh.visible = false;
      this.group.add(mesh);
      this.jumpers.push({ mesh, active: false, t: 0, duration: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), height: 1 });
    }
  }

  _buildBirds() {
    // Un pájaro: dos alas en uve que baten. Barato y se lee a distancia.
    const wing = new THREE.PlaneGeometry(0.9, 0.26);
    wing.translate(0.45, 0, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0x2a2f36, side: THREE.DoubleSide, fog: true });

    this.birds = [];
    for (let i = 0; i < BIRD_POOL; i++) {
      const bird = new THREE.Group();
      const left = new THREE.Mesh(wing, material);
      const right = new THREE.Mesh(wing, material);
      right.rotation.y = Math.PI;
      bird.add(left); bird.add(right);
      bird.visible = false;
      this.group.add(bird);
      this.birds.push({ group: bird, left, right, active: false, t: 0, speed: 1, phase: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
  }

  /** Punto de agua al azar dentro de un anillo alrededor del jugador. */
  _waterPointNear(center, min = 14, max = 55) {
    for (let i = 0; i < 24; i++) {
      const angle = this.rng() * Math.PI * 2;
      const radius = lerp(min, max, this.rng());
      const x = center.x + Math.cos(angle) * radius;
      const z = center.z + Math.sin(angle) * radius;
      if (this.terrain.depthAt(x, z) > 1.2) return new THREE.Vector3(x, this.terrain.waterLevel, z);
    }
    return null;
  }

  _startJump(center, energy) {
    const spot = this._waterPointNear(center);
    if (!spot) return;
    const jumper = this.jumpers.find((j) => !j.active);
    if (!jumper) return;

    const angle = this.rng() * Math.PI * 2;
    const distance = 0.8 + this.rng() * 2.2;
    jumper.from.copy(spot);
    jumper.to.set(spot.x + Math.cos(angle) * distance, spot.y, spot.z + Math.sin(angle) * distance);
    jumper.height = 0.5 + this.rng() * 1.1 * energy;
    jumper.duration = 0.55 + this.rng() * 0.4;
    jumper.t = 0;
    jumper.size = 0.18 + this.rng() * 0.4;
    jumper.active = true;
    jumper.mesh.visible = true;
    jumper.mesh.scale.setScalar(jumper.size);

    this.water.splash(spot, 0.5);
    this.audio?.distantSplash?.(clamp(1 - center.distanceTo(spot) / 70, 0.15, 1));
  }

  _startFlock(center, count) {
    const height = 40 + this.rng() * 60;
    const angle = this.rng() * Math.PI * 2;
    const across = 260;
    const from = new THREE.Vector3(
      center.x + Math.cos(angle) * across, height, center.z + Math.sin(angle) * across
    );
    const to = new THREE.Vector3(
      center.x - Math.cos(angle) * across, height + (this.rng() - 0.5) * 20, center.z - Math.sin(angle) * across
    );
    for (let i = 0; i < count; i++) {
      const bird = this.birds.find((x) => !x.active);
      if (!bird) return;
      const spread = new THREE.Vector3((this.rng() - 0.5) * 26, (this.rng() - 0.5) * 8, (this.rng() - 0.5) * 26);
      bird.from.copy(from).add(spread);
      bird.to.copy(to).add(spread);
      bird.t = -i * 0.12;                       // el bando se escalona
      bird.speed = 0.028 + this.rng() * 0.014;
      bird.phase = this.rng() * 6.28;
      bird.active = true;
      bird.group.visible = true;
      bird.group.scale.setScalar(1.6 + this.rng() * 1.2);
    }
  }

  /** Racha de viento en curso, que Game suma al viento base. */
  get gustStrength() { return this.gust; }

  update(dt, { player, time, weather }) {
    const feeding = time.feedingFactor;
    const calm = 1 - clamp(weather.rainAmount, 0, 1);

    // --- peces saltando -------------------------------------------------
    this.jumpTimer -= dt * (0.35 + feeding * 0.5);
    if (this.jumpTimer <= 0) {
      this.jumpTimer = 14 + this.rng() * 38 / Math.max(0.4, feeding);
      this._startJump(player, 0.6 + feeding * 0.6);
    }
    for (const j of this.jumpers) {
      if (!j.active) continue;
      j.t += dt;
      const k = j.t / j.duration;
      if (k >= 1) {
        j.active = false;
        j.mesh.visible = false;
        this.water.splash(j.to, 0.75);
        continue;
      }
      // Parábola entre entrada y salida del agua.
      j.mesh.position.lerpVectors(j.from, j.to, k);
      j.mesh.position.y = j.from.y + Math.sin(k * Math.PI) * j.height;
      const dir = j.to.clone().sub(j.from).normalize();
      j.mesh.rotation.set(lerp(-0.9, 0.9, k), Math.atan2(dir.x, dir.z) + Math.PI / 2, Math.sin(k * 6) * 0.2);
    }

    // --- pájaros ---------------------------------------------------------
    this.birdTimer -= dt * calm;
    if (this.birdTimer <= 0) {
      this.birdTimer = 25 + this.rng() * 55;
      if (time.nightFactor < 0.6) this._startFlock(player, 2 + Math.floor(this.rng() * 4));
    }
    for (const bird of this.birds) {
      if (!bird.active) continue;
      bird.t += dt * bird.speed;
      if (bird.t >= 1) { bird.active = false; bird.group.visible = false; continue; }
      if (bird.t < 0) continue;
      bird.group.position.lerpVectors(bird.from, bird.to, bird.t);
      const dir = bird.to.clone().sub(bird.from).normalize();
      bird.group.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2;
      const flap = Math.sin(bird.phase + performance.now() * 0.006) * 0.7;
      bird.left.rotation.z = flap;
      bird.right.rotation.z = -flap;
    }

    // --- rachas de viento -------------------------------------------------
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = 9 + this.rng() * 22;
      this.gustPeak = 0.5 + this.rng() * 1.4 * (0.5 + weather.windSpeed / 9);
      this.gustLeft = 1.6 + this.rng() * 2.4;
    }
    if (this.gustLeft > 0) {
      this.gustLeft -= dt;
      this.gust = damp(this.gust, this.gustPeak, 1.6, dt);
    } else {
      this.gust = damp(this.gust, 0, 1.1, dt);
    }

    // --- anillos sueltos en la superficie ---------------------------------
    this.rippleTimer -= dt;
    if (this.rippleTimer <= 0) {
      this.rippleTimer = 2 + this.rng() * 6;
      const spot = this._waterPointNear(player, 6, 40);
      if (spot) this.water.splash(spot, 0.18 + this.rng() * 0.2);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.scene.remove(this.group);
  }
}
