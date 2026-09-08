import * as THREE from 'three';
import { clamp } from '../core/MathUtils.js';

/**
 * Línea de pesca: cuerda de Verlet entre la puntera y el señuelo.
 *
 * La simulación es puramente visual —la tensión de juego la calcula
 * `FishingSystem` a partir de fuerzas— pero comparte con ella el mismo dato:
 * `lineOut`, los metros de hilo soltados. Si hay más hilo que distancia, la
 * cuerda cuelga; si hay menos, se tensa en línea recta. Por eso lo que se ve
 * coincide siempre con lo que se siente.
 */

const SEGMENTS = 22;
const LINE_GRAVITY = new THREE.Vector3(0, -9.81, 0);

export class FishingLine {
  constructor(scene, { color = 0xe8f1f5 } = {}) {
    this.points = [];
    for (let i = 0; i < SEGMENTS; i++) {
      this.points.push({
        position: new THREE.Vector3(),
        previous: new THREE.Vector3()
      });
    }

    const positions = new Float32Array(SEGMENTS * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.75, depthWrite: false
    });
    this.mesh = new THREE.Line(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'linea';
    scene.add(this.mesh);
  }

  /** Coloca la cuerda recta entre dos puntos (al lanzar). */
  reset(start, end) {
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      const p = start.clone().lerp(end, t);
      this.points[i].position.copy(p);
      this.points[i].previous.copy(p);
    }
  }

  /**
   * @param start   puntera de la caña
   * @param end     posición del señuelo
   * @param lineOut metros de hilo fuera del carrete
   * @param wind    viento, que curva el hilo suelto
   */
  update(dt, start, end, lineOut, wind) {
    const step = Math.min(dt, 0.033);
    const restLength = Math.max(0.05, lineOut / (SEGMENTS - 1));

    // Integración de Verlet con amortiguación.
    for (let i = 1; i < SEGMENTS - 1; i++) {
      const p = this.points[i];
      const velocity = p.position.clone().sub(p.previous).multiplyScalar(0.94);
      p.previous.copy(p.position);
      p.position.add(velocity);
      p.position.addScaledVector(LINE_GRAVITY, step * step * 0.55);
      if (wind) p.position.addScaledVector(wind, step * step * 0.35);
    }

    // Extremos fijos: puntera y señuelo.
    this.points[0].position.copy(start);
    this.points[SEGMENTS - 1].position.copy(end);

    // Relajación de distancias. Varias pasadas dan una cuerda estable.
    for (let iteration = 0; iteration < 6; iteration++) {
      for (let i = 0; i < SEGMENTS - 1; i++) {
        const a = this.points[i].position;
        const b = this.points[i + 1].position;
        const delta = b.clone().sub(a);
        const distance = delta.length();
        if (distance < 1e-5) continue;
        // Sólo tira si está estirado: una cuerda no empuja.
        const difference = (distance - restLength) / distance;
        if (difference <= 0) continue;
        const correction = delta.multiplyScalar(difference * 0.5);
        if (i > 0) a.add(correction);
        if (i + 1 < SEGMENTS - 1) b.sub(correction);
      }
      this.points[0].position.copy(start);
      this.points[SEGMENTS - 1].position.copy(end);
    }

    const array = this.geometry.attributes.position.array;
    for (let i = 0; i < SEGMENTS; i++) {
      const p = this.points[i].position;
      array[i * 3] = p.x;
      array[i * 3 + 1] = p.y;
      array[i * 3 + 2] = p.z;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  /** La línea muy tensa se ve más fina y clara. */
  setTension(ratio) {
    this.material.opacity = clamp(0.5 + ratio * 0.45, 0.5, 0.98);
    this.material.color.setHSL(0.55 - ratio * 0.55, ratio * 0.7, 0.85);
  }

  setVisible(value) { this.mesh.visible = value; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
