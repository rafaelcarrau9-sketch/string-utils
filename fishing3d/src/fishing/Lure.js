import * as THREE from 'three';
import { clamp, damp } from '../core/MathUtils.js';

/**
 * Señuelo/flotador: vuelo balístico, entrada en el agua y trabajo sumergido.
 *
 * Cada señuelo del catálogo tiene su profundidad de trabajo: la cucharilla
 * pesada baja al fondo, el popper se queda en superficie. Al recoger, sube
 * hacia su profundidad y genera "acción", que es lo que despierta a los peces.
 */

export const LureState = {
  STOWED: 'stowed',
  FLYING: 'flying',
  WATER: 'water',
  LANDED: 'landed'      // en tierra: lanzamiento fallido
};

const AIR_DRAG = 0.16;
const GRAVITY_Y = -9.81;

export class Lure {
  constructor(scene) {
    this.state = LureState.STOWED;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.depthTarget = 0;
    this.action = 0;          // 0..1, cuánto se está moviendo bajo el agua
    this.submergedTime = 0;

    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8402c, roughness: 0.35, metalness: 0.45 })
    );
    body.scale.set(1, 1, 1.7);
    group.add(body);
    const blade = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xd9d2b0, roughness: 0.2, metalness: 0.9 })
    );
    blade.scale.set(0.4, 1.2, 0.9);
    blade.position.z = 0.08;
    group.add(blade);

    this.object = group;
    this.object.visible = false;
    scene.add(this.object);

    this.rig = 'senuelo';
    this.biting = false;
    this.floatDip = 0;
    this.floatObject = this._buildFloat();
    this.floatObject.visible = false;
    scene.add(this.floatObject);
  }

  /** Boya de pesca: cuerpo rojo y blanco con antena. */
  _buildFloat() {
    const group = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xd23c28, roughness: 0.45 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0efe6, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), red);
    body.scale.set(1, 1.5, 1);
    group.add(body);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.05, 12), white);
    collar.position.y = 0.03;
    group.add(collar);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 6), red);
    antenna.position.y = 0.24;
    group.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), white);
    tip.position.y = 0.39;
    group.add(tip);
    const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 5), white);
    keel.position.y = -0.2;
    group.add(keel);
    return group;
  }

  /** Cambia de montaje según el señuelo equipado. */
  setRig(lureItem) {
    this.rig = lureItem?.rig === 'flotador' ? 'flotador' : 'senuelo';
  }

  /** Punto del que cuelga la línea: la boya si hay montaje de flotador. */
  get lineAnchor() {
    return this.rig === 'flotador' && this.state === LureState.WATER
      ? this.floatObject.position
      : this.position;
  }

  cast(origin, direction, speed, lure) {
    this.setRig(lure);
    this.biting = false;
    this.floatDip = 0;
    this.position.copy(origin);
    this.velocity.copy(direction).normalize().multiplyScalar(speed);
    this.state = LureState.FLYING;
    this.depthTarget = lure.workingDepth;
    this.submergedTime = 0;
    this.action = 0;
    this.object.visible = true;
  }

  stow() {
    this.state = LureState.STOWED;
    this.object.visible = false;
    this.floatObject.visible = false;
    this.biting = false;
    this.floatDip = 0;
    this.action = 0;
  }

  /** El pez tiene el cebo en la boca: la boya se hunde. */
  setBiting(value) { this.biting = value; }

  get isFishable() { return this.state === LureState.WATER; }

  /**
   * @param retrieve  0..1 cuánto está recogiendo el jugador
   * @returns evento de entrada en el agua, para salpicadura y sonido
   */
  update(dt, { terrain, waterLevel, retrieve = 0, rodTip, retrieveSpeed = 1.5, wind }) {
    let event = null;

    if (this.state === LureState.FLYING) {
      this.velocity.y += GRAVITY_Y * dt;
      this.velocity.addScaledVector(this.velocity.clone().normalize(), -AIR_DRAG * this.velocity.length() * dt);
      if (wind) this.velocity.addScaledVector(wind, dt * 0.06);
      this.position.addScaledVector(this.velocity, dt);

      const bed = terrain.heightAt(this.position.x, this.position.z);
      if (this.position.y <= waterLevel && bed < waterLevel) {
        this.position.y = waterLevel;
        this.state = LureState.WATER;
        this.velocity.set(0, 0, 0);
        this.submergedTime = 0;
        event = { type: 'splash', position: this.position.clone(), strength: 1 };
      } else if (this.position.y <= bed) {
        this.position.y = bed;
        this.state = LureState.LANDED;
        this.velocity.set(0, 0, 0);
        event = { type: 'ground', position: this.position.clone() };
      }
    } else if (this.state === LureState.WATER) {
      this.submergedTime += dt;
      const bed = terrain.heightAt(this.position.x, this.position.z);
      const maxDepth = Math.max(0.15, waterLevel - bed - 0.08);

      // Hundimiento hasta su profundidad de trabajo; al recoger, sube.
      const sinkTarget = waterLevel - clamp(this.depthTarget, 0, maxDepth);
      const workTarget = waterLevel - clamp(this.depthTarget * (1 - retrieve * 0.55), 0, maxDepth);
      const target = retrieve > 0.05 ? workTarget : sinkTarget;
      const sinkRate = retrieve > 0.05 ? 3.2 : 0.55;
      this.position.y = damp(this.position.y, target, sinkRate, dt);

      if (retrieve > 0.05 && rodTip) {
        const toRod = rodTip.clone().setY(this.position.y).sub(this.position);
        const distance = toRod.length();
        if (distance > 0.01) {
          const step = Math.min(distance, retrieveSpeed * retrieve * dt);
          this.position.addScaledVector(toRod.divideScalar(distance), step);
        }
      }

      // Un señuelo se trabaja recogiendo; un cebo bajo flotador atrae quieto,
      // así que conserva una acción de fondo en vez de apagarse del todo.
      const actionTarget = this.rig === 'flotador' ? Math.max(0.4, retrieve) : retrieve;
      this.action = damp(this.action, actionTarget, 6, dt);
      this.object.rotation.z += this.action * dt * 6;
    }

    this.object.position.copy(this.position);
    if (this.state === LureState.FLYING && this.velocity.lengthSq() > 0.01) {
      this.object.lookAt(this.position.clone().add(this.velocity));
    }

    this._updateFloat(dt, waterLevel);
    return event;
  }

  /**
   * La boya flota justo encima del cebo y cabecea con el oleaje. Al picar se
   * hunde: ese es el aviso, mucho antes que cualquier texto en pantalla.
   */
  _updateFloat(dt, waterLevel) {
    const showFloat = this.rig === 'flotador' && this.state === LureState.WATER;
    this.floatObject.visible = showFloat;
    if (!showFloat) return;

    this.floatDip = damp(this.floatDip, this.biting ? 1 : 0, this.biting ? 9 : 3.5, dt);
    const t = performance.now() * 0.001;
    const bob = Math.sin(t * 1.6 + this.position.x * 0.4) * 0.03
      + Math.sin(t * 2.7 + this.position.z * 0.3) * 0.018;

    this.floatObject.position.set(
      this.position.x,
      waterLevel + bob - this.floatDip * 0.42,
      this.position.z
    );
    // Se ladea al ser arrastrada, y tiembla mientras el pez tantea el cebo.
    const tilt = this.floatDip * 0.7 + (this.biting ? Math.sin(t * 22) * 0.12 : 0);
    this.floatObject.rotation.set(tilt, 0, Math.sin(t * 1.3) * 0.06);
  }

  dispose() {
    [this.object, this.floatObject].forEach((root) => {
      root.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
      root.parent?.remove(root);
    });
  }
}
