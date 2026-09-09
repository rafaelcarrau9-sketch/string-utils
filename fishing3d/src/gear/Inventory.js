import { CATALOG, findItem } from './GearData.js';

/** Qué posee el jugador. No sabe nada de estadísticas: sólo de propiedad. */
export class Inventory {
  constructor(initial = null) {
    this.owned = initial || {
      rods: ['cana_iniciacion'],
      reels: ['carrete_basico'],
      lines: ['nylon_022'],
      lures: ['cucharilla'],
      boats: ['barca_remos']
    };
  }

  has(category, id) {
    return (this.owned[category] || []).includes(id);
  }

  add(category, id) {
    if (!CATALOG[category] || !findItem(category, id)) return false;
    if (this.has(category, id)) return false;
    // Una partida guardada de antes puede no tener la categoría todavía.
    (this.owned[category] ??= []).push(id);
    return true;
  }

  list(category) {
    return (this.owned[category] || []).map((id) => findItem(category, id)).filter(Boolean);
  }

  toJSON() { return { owned: this.owned }; }

  static fromJSON(data) {
    if (!data?.owned) return new Inventory();
    const clean = {};
    for (const category of Object.keys(CATALOG)) {
      clean[category] = (data.owned[category] || []).filter((id) => findItem(category, id));
      if (!clean[category].length) clean[category] = [CATALOG[category][0].id];
    }
    return new Inventory(clean);
  }
}
