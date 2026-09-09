import * as THREE from 'three';
import { clamp, damp } from '../core/MathUtils.js';

/**
 * Barca de remos navegable.
 *
 * Es la forma de llegar a las aguas hondas del centro del lago, donde viven
 * las especies que no pican desde la orilla. Flota siguiendo la superficie,
 * no puede entrar donde no hay calado y deja estela al avanzar.
 */

const MIN_DEPTH = 0.55;          // calado mínimo para navegar
const ROW_ACCEL = 2.4;
const MAX_SPEED = 3.6;
const TURN_RATE = 1.15;

export class Boat {
  constructor(scene, terrain, textures, preset, { position = new THREE.Vector3(), heading = 0 } = {}) {
    this.terrain = terrain;
    this.position = position.clone();
    this.heading = heading;
    this.speed = 0;
    this.occupied = false;
    this.wakeTimer = 0;

    const wood = textures.material('madera', { repeat: 1.5 });
    this.group = new THREE.Group();
    this.group.name = 'barca';

    // Casco: caja afinada en proa y popa desplazando vértices.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.62, 4.4, 3, 2, 8), wood);
    const pos = hull.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const taper = 1 - Math.pow(Math.abs(v.z) / 2.2, 2.2) * 0.82;
      v.x *= taper;
      if (v.y > 0) v.x *= 1.14;
      else v.y *= 0.85;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    hull.geometry.computeVertexNormals();
    hull.castShadow = preset.shadows;
    hull.receiveShadow = preset.shadows;
    this.group.add(hull);

    // Bancada y regala
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.09, 0.4), wood);
    bench.position.set(0, 0.24, -0.2);
    this.group.add(bench);
    const gunwale = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.05, 6, 16, Math.PI * 2), wood);
    gunwale.rotation.x = Math.PI / 2;
    gunwale.scale.set(1, 2.6, 1);
    gunwale.position.y = 0.3;
    this.group.add(gunwale);

    // Remos, que se mueven al bogar
    this.oars = [];
    [-1, 1].forEach((side) => {
      const oar = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.1, 6), wood);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = side * 0.9;
      oar.add(shaft);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.22), wood);
      blade.position.set(side * 1.85, 0, 0);
      oar.add(blade);
      oar.position.set(0, 0.28, -0.1);
      this.group.add(oar);
      this.oars.push({ object: oar, side });
    });

    this.group.position.copy(this.position);
    this.group.rotation.y = heading;
    scene.add(this.group);
  }

  /** Punto donde se sienta el pescador, en coordenadas de mundo. */
  seatPosition(out = new THREE.Vector3()) {
    return out.set(0, 0.34, -0.2).applyMatrix4(this.group.matrixWorld);
  }

  /** ¿Está el jugador lo bastante cerca para subirse? */
  /**
   * Distancia en planta, no en el espacio: el jugador vadeando está medio metro
   * por encima del casco flotando, y contar ese desnivel dejaba el fondeadero
   * sin punto de embarque en algunas orillas.
   */
  canBoard(playerPosition) {
    if (this.occupied) return false;
    const dx = playerPosition.x - this.group.position.x;
    const dz = playerPosition.z - this.group.position.z;
    return Math.hypot(dx, dz) < 4.2;
  }

  board() { this.occupied = true; }
  leave() { this.occupied = false; this.speed = 0; }

  /**
   * @param row  -1..1 (bogar hacia adelante o ciar)
   * @param turn -1..1
   */
  update(dt, { row = 0, turn = 0, time = 0, water = null } = {}) {
    if (this.occupied) {
      this.speed = damp(this.speed, row * MAX_SPEED, ROW_ACCEL, dt);
      // Virar sólo tiene efecto con algo de arrancada, como en el agua real.
      this.heading += turn * TURN_RATE * dt * clamp(0.35 + Math.abs(this.speed) / MAX_SPEED, 0.35, 1.3);
    } else {
      this.speed = damp(this.speed, 0, 1.4, dt);
    }

    if (Math.abs(this.speed) > 0.01) {
      const nx = this.position.x - Math.sin(this.heading) * this.speed * dt;
      const nz = this.position.z - Math.cos(this.heading) * this.speed * dt;
      // Sin calado no se pasa: la barca encalla suavemente.
      if (this.terrain.depthAt(nx, nz) > MIN_DEPTH) {
        this.position.x = nx;
        this.position.z = nz;
      } else {
        this.speed *= 0.25;
      }

      this.wakeTimer -= dt;
      if (water && this.wakeTimer <= 0 && Math.abs(this.speed) > 0.6) {
        this.wakeTimer = 0.45;
        water.splash(this.position, 0.35);
      }
    }

    // Flotación: cabeceo y balanceo suaves.
    const bobY = Math.sin(time * 1.4) * 0.035 + Math.sin(time * 2.1 + 1.3) * 0.02;
    this.group.position.set(this.position.x, this.terrain.waterLevel + 0.12 + bobY, this.position.z);
    this.group.rotation.y = this.heading;
    this.group.rotation.z = Math.sin(time * 1.1) * 0.025 - this.speed * 0.02;
    this.group.rotation.x = Math.sin(time * 1.7) * 0.018;
    this.group.updateMatrixWorld();

    // Los remos bogan al ritmo del avance.
    const stroke = Math.sin(time * 3.2) * clamp(Math.abs(this.speed) / MAX_SPEED, 0, 1);
    this.oars.forEach(({ object, side }) => {
      object.rotation.x = stroke * 0.5;
      object.rotation.y = stroke * 0.28 * side;
    });
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.group.parent?.remove(this.group);
  }
}
