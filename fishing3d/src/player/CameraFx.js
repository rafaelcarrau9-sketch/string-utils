import { damp, clamp } from '../core/MathUtils.js';

/**
 * Efectos de cámara: sacudidas, tirones y campo de visión.
 *
 * Todo entra como impulsos que decaen, nunca como valores fijos, de modo que
 * la cámara siempre vuelve sola a su sitio y no se acumulan desvíos. Se aplica
 * después del control del jugador, así que no interfiere con la puntería.
 */
export class CameraFx {
  constructor(camera, { baseFov = 70 } = {}) {
    this.camera = camera;
    this.baseFov = baseFov;
    this.shake = 0;
    this.fovKick = 0;
    this.pull = { x: 0, y: 0 };
    this.roll = 0;
    this._t = 0;
  }

  setBaseFov(fov) { this.baseFov = fov; }

  /** Sacudida breve: rotura de línea, clavada fuerte, trueno. */
  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }
  /** Cambio momentáneo de campo de visión: el lance «abre» la vista. */
  addFovKick(amount) { this.fovKick += amount; }
  /** Tirón sostenido: el pez arrastra la vista hacia su carrera. */
  setPull(x, y) { this.pull.x = x; this.pull.y = y; }
  /** Inclinación lateral: presión de la caña en la pelea. */
  setRoll(amount) { this.roll = amount; }

  update(dt) {
    this._t += dt;
    this.shake = damp(this.shake, 0, 4.5, dt);
    this.fovKick = damp(this.fovKick, 0, 5, dt);

    // Ruido de dos frecuencias: una sacudida limpia se nota artificial.
    const s = this.shake * this.shake;
    const nx = (Math.sin(this._t * 47) * 0.6 + Math.sin(this._t * 23.3) * 0.4) * s * 0.035;
    const ny = (Math.cos(this._t * 41) * 0.6 + Math.cos(this._t * 19.7) * 0.4) * s * 0.03;

    this.camera.rotation.x += ny + this.pull.y;
    this.camera.rotation.y += nx + this.pull.x;
    this.camera.rotation.z += this.roll + nx * 0.5;

    const fov = this.baseFov + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
