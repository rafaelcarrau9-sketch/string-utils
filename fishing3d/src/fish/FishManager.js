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

// Con el agua transparente en el bajío los peces se ven de verdad,
// así que compensa dibujarlos más lejos.
const MAX_VISIBLE_DISTANCE = 85;

/**
 * Peso de cada especie en el reparto de la población. Lo raro es raro de
 * verdad, pero nunca ausente: dejar la mezcla al azar puro hacía que una
 * especie con misión asociada pudiera no existir en el lago.
 */
const RARITY_WEIGHT = { comun: 1, raro: 0.34, legendario: 0.07 };
const MIN_PER_SPECIES = { comun: 5, raro: 3, legendario: 1 };

export class FishManager {
  constructor(scene, terrain, {
    population = 72, seed = 71, species = null, allowGated = () => true
  } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.rng = createRandom(seed);
    this.fishes = [];
    this.speciesPool = (species ? SPECIES.filter((s) => species.includes(s.id)) : SPECIES)
      .filter((s) => !s.gated || allowGated(s.id));
    this.group = new THREE.Group();
    this.group.name = 'peces';
    scene.add(this.group);

    this._populate(population);
  }

  /**
   * Reparto de la población: primero un mínimo garantizado de cada especie
   * presente en la zona, y el resto por sorteo ponderado. Así una especie de
   * misión siempre está, y aun así lo legendario sigue siendo excepcional.
   */
  _populate(population) {
    const cola = [];
    for (const s of this.speciesPool) {
      const minimo = Math.min(MIN_PER_SPECIES[s.rarity] ?? 4,
        Math.max(1, Math.floor(population / (this.speciesPool.length * 2))));
      for (let i = 0; i < minimo; i++) cola.push(s);
    }
    const total = this.speciesPool.reduce((n, s) => n + (RARITY_WEIGHT[s.rarity] ?? 1), 0);
    while (cola.length < population) {
      let r = this.rng() * total;
      let elegida = this.speciesPool[0];
      for (const s of this.speciesPool) {
        r -= RARITY_WEIGHT[s.rarity] ?? 1;
        if (r <= 0) { elegida = s; break; }
      }
      cola.push(elegida);
    }
    // Se baraja para que el orden de creación no agrupe especies.
    for (let i = cola.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cola[i], cola[j]] = [cola[j], cola[i]];
    }
    for (let i = 0; i < population; i++) this._spawn(cola[i]);
  }

  /**
   * Muestreo del agua de la zona, hecho una sola vez.
   *
   * Sortear puntos dentro de un radio y descartar los secos funciona en un
   * lago, donde casi todo es agua, pero en un cañón de veinte metros de ancho
   * la mayoría de los intentos caen en la pared y la población salía coja.
   * Con la lámina tabulada, cada especie encuentra su sitio a la primera.
   */
  _waterTable() {
    if (this._water) return this._water;
    const F = this.terrain.field;
    const R = F.lakeRadius * 1.08;
    const points = [];
    const stride = Math.max(2.5, R / 46);
    for (let x = -R; x <= R; x += stride) {
      for (let z = -R; z <= R; z += stride) {
        const depth = F.depthAt(x, z);
        if (depth > 0.35) points.push({ x, z, depth });
      }
    }
    this._water = points;
    return points;
  }

  _randomSpotFor(species) {
    // Busca un punto con la profundidad que esa especie prefiere.
    const table = this._waterTable();
    if (!table.length) return null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const p = table[Math.floor(this.rng() * table.length)];
      // Un poco de dispersión para que no se coloquen en la rejilla.
      const x = p.x + (this.rng() - 0.5) * 3;
      const z = p.z + (this.rng() - 0.5) * 3;
      const depth = this.terrain.depthAt(x, z);
      if (depth < species.depth[0] * 0.7 || depth > species.depth[1] * 1.6) continue;
      // En aguas con corriente cada especie tiene su sitio: el barbo y el
      // salmón en la tabla, la anguila y la tenca en los remansos.
      if (this.terrain.field.hasCurrent && attempt < 45) {
        const f = this.terrain.field.flowAt(x, z, this._flow ??= {});
        const fuerza = Math.hypot(f.x, f.z);
        if (species.prefersCurrent ? fuerza < 0.35 : fuerza > 0.75) continue;
      }
      const y = this.terrain.waterLevel - clamp(
        species.depth[0] + this.rng() * (species.depth[1] - species.depth[0]),
        0.4, depth - 0.25
      );
      return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  _spawn(forced = null) {
    const species = forced ?? this.speciesPool[Math.floor(this.rng() * this.speciesPool.length)];
    if (!species) return null;
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
    const { lurePosition, lure, hour, weatherModifier, lureAction, feeding, worldEvent } = context;
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

      let appetite = fish.appetite(lure, hour, weatherModifier, depth) * feeding;
      if (worldEvent) appetite *= worldEvent.appetiteFor(fish.species, lure, depth);
      // Un pez colocado donde le gusta el agua come mejor.
      if (this.terrain.field.hasCurrent) {
        const f = this.terrain.field.flowAt(lurePosition.x, lurePosition.z, this._flow ??= {});
        const fuerza = Math.hypot(f.x, f.z);
        appetite *= fish.species.prefersCurrent
          ? clamp(0.55 + fuerza * 0.9, 0.55, 1.5)
          : clamp(1.25 - fuerza * 0.7, 0.5, 1.25);
      }
      // Se enfría con la distancia, pero no linealmente: un pez sólo pierde
      // el interés cerca del límite de detección, no a medio camino.
      fish.interest = clamp(appetite * (1 - Math.pow(distance / detection, 1.7)), 0, 2);

      // El apetito es un producto de factores menores que uno, así que sus
      // valores típicos son bajos: la puerta va acorde. Lo que separa un
      // señuelo acertado de uno malo es la probabilidad, no el umbral.
      if (fish.state === FishState.SWIMMING && fish.interest > 0.12 &&
          this.rng() < fish.interest * 0.013) {
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
