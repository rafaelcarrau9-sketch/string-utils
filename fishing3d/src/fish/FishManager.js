import * as THREE from 'three';
import { Fish, FishState } from './Fish.js';
import { SPECIES } from './FishData.js';
import { createRandom, clamp } from '../core/MathUtils.js';

/**
 * Población del lago.
 *
 * Los peces existen antes de que el jugador lance: nacen en el hábitat que les
 * corresponde por profundidad y se mueven por el lago. Cuando hay un señuelo en
 * el agua, este gestor evalúa qué peces cercanos se interesan y los pasa a
 * SEARCHING; nunca se genera un pez "a medida" delante del jugador.
 */

const MAX_VISIBLE_DISTANCE = 45;

export class FishManager {
  constructor(scene, terrain, { population = 72, seed = 71 } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.rng = createRandom(seed);
    this.fishes = [];
    this.group = new THREE.Group();
    this.group.name = 'peces';
    scene.add(this.group);

    for (let i = 0; i < population; i++) this._spawn();
  }

  _randomSpotFor(species) {
    // Busca un punto con la profundidad que esa especie prefiere.
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const radius = this.rng() * this.terrain.field.lakeRadius * 1.05;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const depth = this.terrain.depthAt(x, z);
      if (depth < species.depth[0] * 0.7 || depth > species.depth[1] * 1.6) continue;
      const y = this.terrain.waterLevel - clamp(
        species.depth[0] + this.rng() * (species.depth[1] - species.depth[0]),
        0.4, depth - 0.25
      );
      return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  _spawn() {
    // Las especies raras aparecen menos.
    const pool = SPECIES.filter((s) => s.rarity !== 'raro' || this.rng() < 0.35);
    const species = pool[Math.floor(this.rng() * pool.length)] || SPECIES[0];
    const position = this._randomSpotFor(species);
    if (!position) return null;

    const fish = new Fish(species.id, { rng: this.rng, position });
    this.fishes.push(fish);
    this.group.add(fish.mesh);
    return fish;
  }

  /** Pez que está mordiendo ahora mismo, si lo hay. */
  get biting() {
    return this.fishes.find((f) => f.state === FishState.BITING) || null;
  }

  /**
   * Reparte interés entre los peces cercanos al señuelo.
   * `lureAction` (0..1) es cuánto se está moviendo el señuelo al recoger.
   */
  evaluate(context) {
    const { lurePosition, lure, hour, weatherModifier, lureAction, feeding } = context;
    if (!lurePosition || !lure) {
      this.fishes.forEach((f) => {
        if (f.state === FishState.SEARCHING || f.state === FishState.INVESTIGATING) {
          f.interest = 0;
          f.setState(FishState.SWIMMING);
        }
      });
      return;
    }

    const depth = this.terrain.depthAt(lurePosition.x, lurePosition.z);
    for (const fish of this.fishes) {
      if (fish.isBusy || fish.state === FishState.ESCAPING || fish.state === FishState.BITING) continue;

      const distance = fish.position.distanceTo(lurePosition);
      const detection = 9 + fish.species.speed * 2.4;
      if (distance > detection) {
        if (fish.state === FishState.SEARCHING) fish.setState(FishState.SWIMMING);
        continue;
      }

      const appetite = fish.appetite(lure, hour, weatherModifier, depth) * feeding;
      // Se enfría con la distancia: el señuelo tiene que estar en su zona.
      fish.interest = clamp(appetite * (1 - distance / detection), 0, 2);

      if (fish.state === FishState.SWIMMING && fish.interest > 0.35 && this.rng() < fish.interest * 0.02) {
        fish.setState(FishState.SEARCHING);
      }
    }
  }

  update(dt, context) {
    const camera = context.cameraPosition;
    for (const fish of this.fishes) {
      fish.update(dt, context);
      // Sólo se dibujan los peces cercanos: el resto sigue simulándose barato.
      fish.mesh.visible = !!camera && fish.position.distanceTo(camera) < MAX_VISIBLE_DISTANCE;
    }
  }

  /** Retira un pez capturado y repone la población en otro punto del lago. */
  remove(fish) {
    const i = this.fishes.indexOf(fish);
    if (i >= 0) this.fishes.splice(i, 1);
    this.group.remove(fish.mesh);
    fish.dispose();
    this._spawn();
  }

  /** Devuelve un pez al agua tras soltarlo o perderlo. */
  release(fish) {
    fish.interest = 0;
    fish.setState(FishState.ESCAPING);
  }

  get counts() {
    const byState = {};
    this.fishes.forEach((f) => { byState[f.state] = (byState[f.state] || 0) + 1; });
    return { total: this.fishes.length, byState };
  }

  dispose() {
    this.fishes.forEach((f) => f.dispose());
    this.scene.remove(this.group);
  }
}
