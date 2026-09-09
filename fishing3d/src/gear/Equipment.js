import { findItem, CATALOG } from './GearData.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Montaje equipado y estadísticas derivadas.
 *
 * Aquí es donde caña + carrete + línea + señuelo se convierten en los números
 * que usa el sistema de pesca: cuánto se lanza, cuánto aguanta la línea, a qué
 * velocidad se recoge y cuánto freno se puede aplicar.
 */
export class Equipment {
  constructor(inventory, equipped = null) {
    this.inventory = inventory;
    this.equipped = equipped || {
      rods: 'cana_iniciacion',
      reels: 'carrete_basico',
      lines: 'nylon_022',
      lures: 'cucharilla'
    };
  }

  get rod() { return findItem('rods', this.equipped.rods) || CATALOG.rods[0]; }
  get reel() { return findItem('reels', this.equipped.reels) || CATALOG.reels[0]; }
  get line() { return findItem('lines', this.equipped.lines) || CATALOG.lines[0]; }
  get lure() { return findItem('lures', this.equipped.lures) || CATALOG.lures[0]; }

  /**
   * Equipar. `guard` permite a la pesca vetar el cambio: no se cambia de
   * línea con un pez colgando, ni de señuelo con el aparejo en el agua.
   * Devuelve `true`, o el motivo del rechazo.
   */
  equip(category, id) {
    if (!this.inventory.has(category, id)) return false;
    const veto = this.guard?.(category);
    if (veto) return veto;
    this.equipped[category] = id;
    return true;
  }

  get stats() {
    const { rod, reel, line, lure } = this;

    // Un señuelo con peso vuela más; una línea gruesa frena el lanzamiento.
    const lureFactor = clamp(0.62 + lure.weightG / 26, 0.62, 1.4);
    const lineFactor = clamp(1.2 - line.diameter * 1.35, 0.72, 1.16);
    const castDistance = 17 * rod.power * lureFactor * lineFactor * (0.85 + reel.retrieve * 0.35);

    return {
      castDistance,                                   // metros a máxima potencia
      lineStrength: line.strength,                    // kg antes de romper
      // El freno nunca puede superar lo que aguanta la línea.
      maxDrag: Math.min(reel.maxDrag, line.strength * 0.82),
      retrieveSpeed: 0.85 + reel.retrieve * 1.5,      // m/s de recogida
      sensitivity: rod.sensitivity,
      elasticity: line.elasticity,                    // amortigua los picos de tensión
      rodStrength: rod.strength,                      // tensión que aguanta la caña
      workingDepth: lure.workingDepth,
      lureAction: lure.action,
      capacity: reel.capacity                         // metros de línea disponibles
    };
  }

  toJSON() { return { equipped: this.equipped }; }

  static fromJSON(inventory, data) {
    const equipment = new Equipment(inventory);
    if (data?.equipped) {
      for (const [category, id] of Object.entries(data.equipped)) {
        if (inventory.has(category, id)) equipment.equipped[category] = id;
      }
    }
    return equipment;
  }
}
