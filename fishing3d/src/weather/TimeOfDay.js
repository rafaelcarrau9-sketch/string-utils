import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../core/MathUtils.js';

/**
 * Reloj del mundo y paleta de luz.
 *
 * Convierte una hora (0..24) en la posición del sol y en los colores de luz,
 * cielo y niebla. Es la única fuente de verdad sobre "qué hora es": el cielo,
 * la iluminación, la IA de los peces y el audio la consultan.
 */

const MAX_ELEVATION = THREE.MathUtils.degToRad(62);

// Paradas de color a lo largo del día. Se interpolan según la altura del sol.
const PALETTE = [
  { key: 'noche',    sun: 0x2a3f6b, sky: 0x0a1224, fog: 0x0d1526, ambient: 0x1b2740, intensity: 0.25 },
  { key: 'alba',     sun: 0xffa062, sky: 0x35486e, fog: 0x5b6884, ambient: 0x4b5470, intensity: 2.2 },
  { key: 'mañana',   sun: 0xffe0b8, sky: 0x6ea3d8, fog: 0x9db6cf, ambient: 0x7d90a8, intensity: 4.6 },
  { key: 'mediodía', sun: 0xfff6ea, sky: 0x74a9e2, fog: 0xa9c2d8, ambient: 0x93a7bd, intensity: 5.6 },
  { key: 'ocaso',    sun: 0xff7a3c, sky: 0x3d4a72, fog: 0x6b5f70, ambient: 0x4a4560, intensity: 1.9 }
];

export class TimeOfDay {
  constructor({ hour = 7.5, speed = 1 / 1200 } = {}) {
    this.hour = hour;
    // `speed` son días por segundo real: 1/1200 deja el día completo en veinte
    // minutos, es decir una hora de juego cada cincuenta segundos. Antes valía
    // 1/90 —un día entero en minuto y medio—, y con eso una pelea de treinta
    // segundos se comía ocho horas: era imposible pescar «al amanecer» o
    // cumplir un encargo que pidiera capturas de noche.
    this.speed = speed;
    this.paused = false;

    this.sunDirection = new THREE.Vector3();
    this.moonDirection = new THREE.Vector3();
    this.sunColor = new THREE.Color();
    this.skyColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.ambientColor = new THREE.Color();
    this.sunIntensity = 1;
    this.elevation = 0;
    this._update();
  }

  update(dt) {
    if (!this.paused) {
      this.hour = (this.hour + dt * this.speed * 24) % 24;
    }
    this._update();
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this._update();
  }

  /** 0 de día, 1 de noche cerrada. */
  get nightFactor() {
    // Banda ancha a propósito: el crepúsculo dura, no se apaga de golpe.
    return 1 - smoothstep(-0.26, 0.22, Math.sin(this.elevation));
  }

  /** Los peces comen al amanecer y al atardecer: 1 en la mejor franja. */
  get feedingFactor() {
    const h = this.hour;
    const dawn = Math.exp(-Math.pow((h - 6.5) / 1.8, 2));
    const dusk = Math.exp(-Math.pow((h - 19.5) / 1.8, 2));
    const night = h < 4.5 || h > 21.5 ? 0.45 : 0;
    return clamp(0.45 + dawn * 0.75 + dusk * 0.7 + night * 0.2, 0.3, 1.4);
  }

  get label() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  _update() {
    // 6h amanece, 13:15 cenit, 20:30 anochece. Con un día de sólo doce horas el
    // sol se ponía a las 18:00 y a las 19:00 era noche cerrada — justo la franja
    // en la que los peces comen mejor. Un día más largo deja un ocaso de verdad
    // en la mejor hora de pesca.
    const dayAngle = ((this.hour - 6) / 14.5) * Math.PI;
    this.elevation = Math.sin(dayAngle) * MAX_ELEVATION;
    const azimuth = THREE.MathUtils.degToRad(-40) + (this.hour / 24) * Math.PI * 2;

    this.sunDirection.set(
      Math.cos(this.elevation) * Math.cos(azimuth),
      Math.sin(this.elevation),
      Math.cos(this.elevation) * Math.sin(azimuth)
    ).normalize();
    this.moonDirection.copy(this.sunDirection).negate();

    const stops = this._blendStops();
    this.sunColor.copy(stops.sun);
    this.skyColor.copy(stops.sky);
    this.fogColor.copy(stops.fog);
    this.ambientColor.copy(stops.ambient);
    this.sunIntensity = stops.intensity;
  }

  _blendStops() {
    const s = Math.sin(this.elevation);
    let a, b, t;
    if (s < -0.05) { a = PALETTE[0]; b = PALETTE[0]; t = 0; }
    else if (s < 0.12) { a = PALETTE[0]; b = this.hour < 12 ? PALETTE[1] : PALETTE[4]; t = smoothstep(-0.05, 0.12, s); }
    else if (s < 0.42) { a = this.hour < 12 ? PALETTE[1] : PALETTE[4]; b = PALETTE[2]; t = smoothstep(0.12, 0.42, s); }
    else { a = PALETTE[2]; b = PALETTE[3]; t = smoothstep(0.42, 0.85, s); }

    return {
      sun: new THREE.Color(a.sun).lerp(new THREE.Color(b.sun), t),
      sky: new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), t),
      fog: new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t),
      ambient: new THREE.Color(a.ambient).lerp(new THREE.Color(b.ambient), t),
      intensity: lerp(a.intensity, b.intensity, t)
    };
  }
}
