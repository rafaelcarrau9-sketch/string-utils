import * as THREE from 'three';
import { clamp } from '../core/MathUtils.js';

/**
 * Interacción por mirada.
 *
 * Los objetos se registran con su malla, un alcance y una acción. Cada
 * fotograma se busca cuál está mirando el jugador: primero por rayo desde la
 * cámara, y si no acierta de lleno, por ángulo respecto a la vista, para que
 * no haya que apuntar con precisión de francotirador.
 *
 * El elegido se resalta —sube su emisivo— y publica su rótulo. Así el jugador
 * ve a qué va a afectar el botón antes de pulsarlo, en vez de adivinarlo por
 * cercanía.
 */

const MAX_ANGLE = Math.cos(THREE.MathUtils.degToRad(32));

export class InteractionSystem {
  constructor(camera) {
    this.camera = camera;
    this.targets = [];
    this.current = null;
    this.raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._point = new THREE.Vector3();
  }

  /**
   * @param target.object   malla o grupo al que mirar
   * @param target.anchor   punto alternativo si no hay malla
   * @param target.anchorHeight  altura sobre el origen del objeto a la que se
   *        apunta. El origen de una persona está en los pies: apuntar ahí
   *        obliga a mirar al suelo para hablar con ella.
   * @param target.range    distancia máxima en metros
   * @param target.label    texto del aviso; puede ser función
   * @param target.action   qué ocurre al interactuar
   * @param target.enabled  condición opcional
   * @param target.highlightColor  emisivo al apuntarlo. Sobre una persona el
   *        realce fuerte de un objeto la convierte en una estatua encendida;
   *        para la gente basta un apunte, que ya llevan su indicador y su
   *        rótulo.
   */
  register(target) {
    this.targets.push({ range: 3.5, ...target });
    return () => this.unregister(target);
  }

  unregister(target) {
    const i = this.targets.findIndex((t) => t === target || t.object === target);
    if (i >= 0) this.targets.splice(i, 1);
  }

  clear() {
    this._highlight(null);
    this.targets.length = 0;
  }

  _anchorOf(target, out) {
    if (target.anchor) return out.copy(target.anchor);
    if (target.object) {
      target.object.getWorldPosition(out);
      if (target.anchorHeight) out.y += target.anchorHeight;
      return out;
    }
    return out.set(0, 0, 0);
  }

  /** Resalta el objeto apuntado y apaga el anterior. */
  _highlight(target) {
    if (this._lit === target) return;
    const paint = (t, on) => {
      t?.object?.traverse?.((o) => {
        if (!o.isMesh || !o.material?.emissive) return;
        if (on) {
          o.userData._emissive ??= o.material.emissive.getHex();
          o.material.emissive.setHex(t.highlightColor ?? 0x1c3a3a);
        } else if (o.userData._emissive !== undefined) {
          o.material.emissive.setHex(o.userData._emissive);
        }
      });
    };
    paint(this._lit, false);
    paint(target, true);
    this._lit = target;
  }

  update(playerPosition) {
    this.camera.getWorldPosition(this._origin);
    this.camera.getWorldDirection(this._forward);

    let best = null;
    let bestScore = -Infinity;

    for (const target of this.targets) {
      if (target.enabled && !target.enabled()) continue;
      this._anchorOf(target, this._point);
      const distance = playerPosition.distanceTo(this._point);
      if (distance > target.range) continue;

      this._toTarget.copy(this._point).sub(this._origin);
      const length = this._toTarget.length();
      if (length < 1e-3) continue;
      this._toTarget.divideScalar(length);
      const facing = this._forward.dot(this._toTarget);
      if (facing < MAX_ANGLE) continue;          // está a la espalda o muy de lado

      // Se prefiere lo que está más centrado en la vista, y a igualdad, lo más cerca.
      const score = facing * 2 - distance / target.range;
      if (score > bestScore) { bestScore = score; best = target; }
    }

    this.current = best;
    this._highlight(best);
    return best;
  }

  get label() {
    const t = this.current;
    if (!t) return '';
    return typeof t.label === 'function' ? t.label() : t.label;
  }

  /** Ejecuta la acción del objeto apuntado. Devuelve si hizo algo. */
  interact() {
    if (!this.current) return false;
    this.current.action?.();
    return true;
  }
}
