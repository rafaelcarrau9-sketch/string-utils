import * as THREE from 'three';
import { damp, clamp } from '../core/MathUtils.js';

/**
 * Caña en primera persona.
 *
 * Es un tubo generado sobre una curva: al subir la tensión, la puntera se
 * dobla de verdad (se recalcula la curva), en vez de rotar la malla entera.
 * La puntera es también el ancla de la línea, así que lo que se ve y lo que
 * simula la física es el mismo punto.
 */
export class Rod {
  constructor(camera, equipment) {
    this.equipment = equipment;
    this.bend = 0;
    this.targetBend = 0;
    this.sway = new THREE.Vector2();

    this.group = new THREE.Group();
    this.group.position.set(0.42, -0.34, -0.42);
    this.group.rotation.set(0.05, -0.3, 0.2);
    camera.add(this.group);

    this.material = new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.35, metalness: 0.35 });
    this.gripMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3527, roughness: 0.9 });

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.28, 8), this.gripMaterial);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.1;
    this.group.add(grip);

    const reelSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10),
      new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.3, metalness: 0.8 }));
    reelSeat.position.set(0, -0.05, 0.02);
    this.group.add(reelSeat);
    this.reelSeat = reelSeat;

    this._buildBlank();
    this.tip = new THREE.Object3D();
    this.group.add(this.tip);
  }

  _buildBlank() {
    if (this.blank) {
      this.group.remove(this.blank);
      this.blank.geometry.dispose();
    }
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -0.45),
      new THREE.Vector3(0, 0, -0.9),
      new THREE.Vector3(0, 0, -1.35)
    ]);
    this.blank = new THREE.Mesh(
      new THREE.TubeGeometry(this.curve, 20, 0.007, 5, false),
      this.material
    );
    this.group.add(this.blank);
  }

  /** `tensionRatio` 0..1 respecto a la resistencia de la caña. */
  update(dt, tensionRatio, lookDelta) {
    this.targetBend = clamp(tensionRatio, 0, 1.2);
    this.bend = damp(this.bend, this.targetBend, 7, dt);

    // Balanceo suave al mover la vista: la caña "pesa".
    this.sway.x = damp(this.sway.x, clamp(-lookDelta.x * 0.0016, -0.06, 0.06), 6, dt);
    this.sway.y = damp(this.sway.y, clamp(-lookDelta.y * 0.0016, -0.06, 0.06), 6, dt);
    this.group.rotation.z = 0.16 + this.sway.x;
    this.group.rotation.x = 0.06 + this.sway.y;

    const b = this.bend;
    const points = this.curve.points;
    points[1].set(0, -b * 0.04, -0.45);
    points[2].set(0, -b * 0.16, -0.88);
    points[3].set(0, -b * 0.38, -1.3 + b * 0.06);
    this.curve.needsUpdate = true;

    const geometry = new THREE.TubeGeometry(this.curve, 20, 0.007, 5, false);
    this.blank.geometry.dispose();
    this.blank.geometry = geometry;

    this.tip.position.copy(points[3]);
  }

  /** Puntera en coordenadas de mundo: de ahí sale la línea. */
  worldTip(out = new THREE.Vector3()) {
    return this.tip.getWorldPosition(out);
  }

  setVisible(value) { this.group.visible = value; }

  dispose() {
    this.blank.geometry.dispose();
    this.material.dispose();
    this.gripMaterial.dispose();
  }
}
