import { valueFor, SPECIES_BY_ID } from '../fish/FishData.js';
import { findItem } from '../gear/GearData.js';

/**
 * Dinero, ventas y registro de capturas.
 *
 * El registro guarda récords por especie: es a la vez "pantalla de peces
 * capturados" y base de la progresión futura (logros, licencias, zonas).
 */
export class Economy {
  constructor(data = null) {
    this.money = data?.money ?? 60;
    this.records = data?.records ?? {};      // id → { count, bestLength, bestWeight }
    this.stats = data?.stats ?? {
      casts: 0, hooked: 0, landed: 0, lost: 0, lineBreaks: 0, totalWeight: 0, biggest: 0
    };
    this.unlockedZones = data?.unlockedZones ?? ['lago_niebla'];
    this.currentZone = data?.currentZone ?? 'lago_niebla';
  }

  /** Registra una captura y devuelve lo que vale. */
  registerCatch(fish) {
    const id = fish.species.id;
    const record = this.records[id] || { count: 0, bestLength: 0, bestWeight: 0 };
    const isRecord = fish.length > record.bestLength;
    record.count += 1;
    record.bestLength = Math.max(record.bestLength, fish.length);
    record.bestWeight = Math.max(record.bestWeight, fish.weight);
    this.records[id] = record;

    this.stats.landed += 1;
    this.stats.totalWeight += fish.weight;
    this.stats.biggest = Math.max(this.stats.biggest, fish.weight);

    const value = valueFor(fish.species, fish.weight);
    return { value, isRecord, isNew: record.count === 1 };
  }

  sell(amount) {
    this.money += amount;
    return this.money;
  }

  canAfford(price) { return this.money >= price; }

  buy(category, id) {
    const item = findItem(category, id);
    if (!item || !this.canAfford(item.price)) return false;
    this.money -= item.price;
    return true;
  }

  get discovered() {
    return Object.keys(this.records).filter((id) => this.records[id].count > 0).length;
  }

  get speciesTotal() { return Object.keys(SPECIES_BY_ID).length; }

  toJSON() {
    return {
      money: this.money,
      records: this.records,
      stats: this.stats,
      unlockedZones: this.unlockedZones,
      currentZone: this.currentZone
    };
  }
}
