import * as THREE from 'three';
import { damp, clamp, lerp, createRandom } from '../core/MathUtils.js';

/**
 * Meteorología: estados, transiciones suaves y lluvia.
 *
 * Cada preset no es sólo estético — la nubosidad y el viento entran en el
 * cálculo de actividad de los peces, en el oleaje del agua y en la mezcla del
 * audio ambiente.
 */

export const WEATHER_PRESETS = {
  despejado: { label: 'Despejado', cloudiness: 0.1, fogDensity: 0.00055, rain: 0, wind: 1.6, biteModifier: 1.0 },
  nubes:     { label: 'Nublado',   cloudiness: 0.6, fogDensity: 0.0016, rain: 0, wind: 3.2, biteModifier: 1.15 },
  niebla:    { label: 'Niebla',    cloudiness: 0.7,  fogDensity: 0.016,  rain: 0, wind: 0.6, biteModifier: 0.9 },
  lluvia:    { label: 'Lluvia',    cloudiness: 0.88, fogDensity: 0.0075, rain: 0.6, wind: 5.5, biteModifier: 1.3 },
  tormenta:  { label: 'Tormenta',  cloudiness: 1.0,  fogDensity: 0.012,  rain: 1, wind: 9, biteModifier: 0.75 }
};

const ORDER = Object.keys(WEATHER_PRESETS);

export class Weather {
  constructor(scene, textures, preset, { initial = 'despejado', seed = 5 } = {}) {
    this.scene = scene;
    this.rng = createRandom(seed);
    this.current = initial;
    this.target = WEATHER_PRESETS[initial];

    this.cloudiness = this.target.cloudiness;
    this.fogDensity = this.target.fogDensity;
    this.rainAmount = this.target.rain;
    this.windSpeed = this.target.wind;
    this.windDirection = new THREE.Vector2(1, 0.35).normalize();
    this.timeToChange = 120 + this.rng() * 180;

    this.fog = new THREE.FogExp2(0xa8bdd2, this.fogDensity);
    scene.fog = this.fog;

    this._buildRain(textures, preset.rainParticles);
  }

  _buildRain(textures, count) {
    this.rainCount = count;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions.set([
        (this.rng() - 0.5) * 140,
        this.rng() * 60,
        (this.rng() - 0.5) * 140
      ], i * 3);
      speeds[i] = 26 + this.rng() * 22;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainSpeeds = speeds;

    this.rain = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: textures.raindrop(),
      color: 0xc9dcec,
      size: 0.42,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  setWeather(key) {
    if (!WEATHER_PRESETS[key]) return;
    this.current = key;
    this.target = WEATHER_PRESETS[key];
    this.timeToChange = 150 + this.rng() * 200;
  }

  cycle() {
    const i = ORDER.indexOf(this.current);
    this.setWeather(ORDER[(i + 1) % ORDER.length]);
    return this.target.label;
  }

  get label() { return this.target.label; }
  get biteModifier() { return this.target.biteModifier; }
  /** Cuánto pica la superficie del agua: alimenta el shader del lago. */
  get choppiness() { return clamp(0.5 + this.windSpeed / 9, 0.5, 2.4); }

  update(dt, playerPosition, fogColor) {
    this.timeToChange -= dt;
    if (this.timeToChange <= 0) {
      // Transición a un estado vecino: nunca se pasa de despejado a tormenta de golpe.
      const i = ORDER.indexOf(this.current);
      const next = ORDER[clamp(i + (this.rng() < 0.5 ? -1 : 1), 0, ORDER.length - 1)];
      this.setWeather(next);
    }

    this.cloudiness = damp(this.cloudiness, this.target.cloudiness, 0.35, dt);
    this.fogDensity = damp(this.fogDensity, this.target.fogDensity, 0.35, dt);
    this.rainAmount = damp(this.rainAmount, this.target.rain, 0.5, dt);
    this.windSpeed = damp(this.windSpeed, this.target.wind, 0.4, dt);

    this.fog.density = this.fogDensity;
    if (fogColor) this.fog.color.copy(fogColor);

    this._updateRain(dt, playerPosition);
  }

  _updateRain(dt, center) {
    const visible = this.rainAmount > 0.02;
    this.rain.visible = visible;
    if (!visible) return;

    this.rain.material.opacity = clamp(this.rainAmount * 0.75, 0, 1);
    const active = Math.floor(this.rainCount * clamp(this.rainAmount, 0, 1));
    this.rain.geometry.setDrawRange(0, active);

    const pos = this.rain.geometry.attributes.position;
    const arr = pos.array;
    const driftX = this.windDirection.x * this.windSpeed * dt;
    const driftZ = this.windDirection.y * this.windSpeed * dt;

    for (let i = 0; i < active; i++) {
      const i3 = i * 3;
      arr[i3 + 1] -= this.rainSpeeds[i] * dt;
      arr[i3] += driftX;
      arr[i3 + 2] += driftZ;
      // Reciclado en una caja alrededor del jugador: la lluvia le acompaña.
      if (arr[i3 + 1] < center.y - 6) {
        arr[i3] = center.x + (this.rng() - 0.5) * 140;
        arr[i3 + 1] = center.y + 45 + this.rng() * 20;
        arr[i3 + 2] = center.z + (this.rng() - 0.5) * 140;
      }
    }
    pos.needsUpdate = true;
  }

  dispose() {
    this.rain.geometry.dispose();
    this.rain.material.dispose();
  }
}
