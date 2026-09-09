import { valueFor, xpFor, SPECIES_BY_ID } from '../fish/FishData.js';
import { findItem } from '../gear/GearData.js';

/**
 * Dinero, ventas y registro de capturas.
 *
 * El registro guarda récords por especie: es a la vez "pantalla de peces
 * capturados" y base de la progresión futura (logros, licencias, zonas).
 */
/**
 * Experiencia necesaria para cada nivel. Crece deprisa al principio —para que
 * los primeros peces se noten— y se estira después, cuando cada captura vale
 * mucho más.
 */
export const XP_LEVELS = [0, 60, 170, 360, 660, 1100, 1750, 2700, 4000, 5800, 8200, 11500];

export function levelFor(xp) {
  let level = 1;
  for (let i = 1; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) level = i + 1;
  return level;
}

export const TITLES = [
  'Novato', 'Aficionado', 'Pescador', 'Pescador con oficio', 'Buen conocedor',
  'Veterano', 'Maestro de orilla', 'Lector de aguas', 'Experto de la cuenca',
  'Autoridad', 'Leyenda local', 'Heredero de Valdés'
];

export class Economy {
  constructor(data = null) {
    this.money = data?.money ?? 60;
    this.xp = data?.xp ?? 0;
    this.earned = data?.earned ?? 0;
    this.zonesVisited = new Set(data?.zonesVisited ?? ['lago_niebla']);
    this.records = data?.records ?? {};      // id → { count, bestLength, bestWeight }
    this.stats = {
      casts: 0, hooked: 0, landed: 0, lost: 0, lineBreaks: 0, totalWeight: 0,
      biggest: 0, biggestSpecies: null, questsDone: 0, longest: 0,
      ...(data?.stats ?? {})
    };
    this.unlockedZones = data?.unlockedZones ?? ['lago_niebla'];
    this.currentZone = data?.currentZone ?? 'lago_niebla';
  }

  get level() { return levelFor(this.xp); }
  get title() { return TITLES[Math.min(this.level - 1, TITLES.length - 1)]; }
  /** Experiencia dentro del nivel actual: [conseguida, necesaria]. */
  get levelProgress() {
    const i = this.level - 1;
    const base = XP_LEVELS[i] ?? 0;
    const next = XP_LEVELS[i + 1];
    if (next === undefined) return [1, 1];
    return [this.xp - base, next - base];
  }

  /** Suma experiencia y avisa si se ha subido de nivel. */
  addXp(amount) {
    const before = this.level;
    this.xp += Math.max(0, Math.round(amount));
    return this.level > before ? this.level : 0;
  }

  visit(zoneId) {
    const nuevo = !this.zonesVisited.has(zoneId);
    this.zonesVisited.add(zoneId);
    this.currentZone = zoneId;
    return nuevo;
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

    if (fish.weight > this.stats.biggest - 1e-9) this.stats.biggestSpecies = fish.species.name;
    this.stats.longest = Math.max(this.stats.longest, fish.length);

    const value = valueFor(fish.species, fish.weight);
    const xp = xpFor(fish.species, fish.trophy ?? 0) * (record.count === 1 ? 2.5 : 1);
    return { value, xp: Math.round(xp), isRecord, isNew: record.count === 1 };
  }

  sell(amount) {
    this.money += amount;
    this.earned += amount;
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
      xp: this.xp,
      earned: this.earned,
      zonesVisited: [...this.zonesVisited],
      records: this.records,
      stats: this.stats,
      unlockedZones: this.unlockedZones,
      currentZone: this.currentZone
    };
  }
}
