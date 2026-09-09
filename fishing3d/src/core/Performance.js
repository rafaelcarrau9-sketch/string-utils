import { QUALITY_PRESETS } from './Settings.js';
import { clamp } from './MathUtils.js';

/**
 * Vigilancia de rendimiento y calidad adaptativa.
 *
 * No sé en qué máquina se va a jugar, así que el juego lo averigua solo:
 * mide los fotogramas por segundo y, si no llega, baja un escalón de calidad;
 * si sobra holgura durante un buen rato, vuelve a subir.
 *
 * Sólo toca lo que se puede cambiar en caliente sin reconstruir la escena:
 * resolución de render, sombras, distancias de dibujado y densidad de lluvia.
 * El reflejo del agua se fija al crear el mundo y no se toca aquí.
 */

const LEVELS = ['bajo', 'medio', 'alto'];

const LOW_FPS = 32;        // por debajo de esto, molesta
const HIGH_FPS = 56;       // por encima, sobra margen para subir
const SAMPLE_SECONDS = 2;  // ventana de medición
const PATIENCE_DOWN = 2;   // ventanas malas seguidas antes de bajar
const PATIENCE_UP = 6;     // ventanas buenas seguidas antes de subir

export class Performance {
  constructor({ renderer, sky, vegetationRef, treesRef, grassRef, weather, settings, onChange }) {
    this.renderer = renderer;
    this.sky = sky;
    this.vegetationRef = vegetationRef;   // función: devuelve la vegetación actual
    this.treesRef = treesRef;
    this.grassRef = grassRef;
    this.weather = weather;
    this.settings = settings;
    this.onChange = onChange;

    this.levelIndex = LEVELS.indexOf(settings.quality);
    if (this.levelIndex < 0) this.levelIndex = 1;
    this.auto = settings.autoQuality !== false;

    this.frames = 0;
    this.elapsed = 0;
    this.fps = 60;
    this.badWindows = 0;
    this.goodWindows = 0;
    this.locked = false;      // se bloquea si el jugador toca la calidad a mano
  }

  get level() { return LEVELS[this.levelIndex]; }
  get preset() { return QUALITY_PRESETS[this.level]; }

  /** El jugador ha elegido calidad a mano: se respeta y se deja de ajustar. */
  lockTo(quality) {
    const index = LEVELS.indexOf(quality);
    if (index < 0) return;
    this.levelIndex = index;
    this.locked = true;
    this.apply();
  }

  update(dt) {
    this.frames += 1;
    this.elapsed += dt;
    if (this.elapsed < SAMPLE_SECONDS) return;

    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (!this.auto || this.locked) return;

    if (this.fps < LOW_FPS) {
      this.goodWindows = 0;
      this.badWindows += 1;
      if (this.badWindows >= PATIENCE_DOWN && this.levelIndex > 0) {
        this.badWindows = 0;
        this.levelIndex -= 1;
        this.apply();
        this.onChange?.(this.level, 'baja', Math.round(this.fps));
      }
    } else if (this.fps > HIGH_FPS) {
      this.badWindows = 0;
      this.goodWindows += 1;
      if (this.goodWindows >= PATIENCE_UP && this.levelIndex < LEVELS.length - 1) {
        this.goodWindows = 0;
        this.levelIndex += 1;
        this.apply();
        this.onChange?.(this.level, 'sube', Math.round(this.fps));
      }
    } else {
      this.badWindows = 0;
      this.goodWindows = 0;
    }
  }

  /** Lleva el preset actual a los sistemas vivos. */
  apply() {
    const preset = this.preset;
    this.settings.quality = this.level;

    this.renderer.setPixelRatio(
      clamp(Math.min(window.devicePixelRatio, 2) * preset.pixelRatio, 0.5, 2)
    );

    this.renderer.shadowMap.enabled = preset.shadows;
    if (this.sky?.sun) {
      const sun = this.sky.sun;
      sun.castShadow = preset.shadows;
      if (preset.shadows && sun.shadow.mapSize.width !== preset.shadowMapSize) {
        sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        // Tirar el mapa fuerza a three a recrearlo con el tamaño nuevo.
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    }

    const vegetation = this.vegetationRef?.();
    if (vegetation) {
      vegetation.viewDistance = preset.viewDistance;
      vegetation.tiles.forEach((mesh) => {
        mesh.userData.cullDistance = Math.min(mesh.userData.cullDistance, preset.viewDistance);
      });
    }
    const trees = this.treesRef?.();
    if (trees) {
      trees.nearDistance = Math.min(70, preset.viewDistance * 0.4);
      trees._lastRebuild.set(1e9, 0, 1e9);   // fuerza recalcular el LOD
    }
    this.grassRef?.()?.setBudget?.(preset.grassDensity);
    if (this.weather?.rain) {
      this.weather.rainCount = Math.min(this.weather.rainCount, preset.rainParticles);
    }
  }
}
