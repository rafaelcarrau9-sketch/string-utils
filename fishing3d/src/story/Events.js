import { SPECIES_BY_ID } from '../fish/FishData.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Sucesos del mundo.
 *
 * No son adornos: cada uno cambia durante un rato cómo se pesca. Una tirada de
 * peces obliga a moverse a donde están; una picada floja invita a cambiar de
 * hora o de sitio; un pez raro merodeando premia al que esté atento.
 *
 * Todo pasa por `modifiers`, que el resto del juego consulta: no hay ningún
 * sistema tocado por dentro por los eventos.
 */

const CANDIDATES = [
  {
    id: 'levantada',
    title: 'Levantada de peces',
    text: 'El agua hierve delante de ti: un banco está cazando en superficie.',
    duration: 95,
    weight: 1.0,
    when: ({ hour }) => (hour > 5.5 && hour < 10) || (hour > 18 && hour < 21.5),
    modifiers: { bite: 1.9, surface: true }
  },
  {
    id: 'agua_turbia',
    title: 'El agua se ha enturbiado',
    text: 'La lluvia arrastra tierra: los peces ven menos y se fían más del olfato.',
    duration: 140,
    weight: 0.8,
    when: ({ rain }) => rain > 0.25,
    modifiers: { bite: 1.25, favourRig: 'flotador' }
  },
  {
    id: 'presion',
    title: 'Baja la presión',
    text: 'Cambia el tiempo. Antes de una tormenta los peces comen como si no hubiera mañana.',
    duration: 120,
    weight: 0.9,
    when: ({ cloudiness }) => cloudiness > 0.5,
    modifiers: { bite: 1.6 }
  },
  {
    id: 'sol_alto',
    title: 'Sol de plomo',
    text: 'Con el sol vertical el pez se hunde. Habrá que bajar el señuelo.',
    duration: 150,
    weight: 0.7,
    when: ({ hour, cloudiness }) => hour > 12 && hour < 16.5 && cloudiness < 0.35,
    modifiers: { bite: 0.6, deepOnly: true }
  },
  {
    id: 'ronda_noche',
    title: 'Ronda de noche',
    text: 'Lo grande sale a comer cuando no hay luz.',
    duration: 180,
    weight: 1.0,
    when: ({ night }) => night > 0.7,
    modifiers: { bite: 1.35, trophy: 1.35 }
  },
  {
    id: 'visitante',
    title: 'Merodea algo grande',
    text: 'Una sombra larga ha cruzado por delante del señuelo.',
    duration: 110,
    weight: 0.55,
    when: ({ level }) => level >= 3,
    modifiers: { bite: 0.85, trophy: 1.8, rare: true }
  }
];

/** Un evento dura lo suyo y luego hay un descanso antes del siguiente. */
const COOLDOWN = [90, 220];

export class EventSystem {
  constructor(events = {}) {
    this.events = events;
    this.current = null;
    this.timeLeft = 0;
    this.cooldown = 45;
    this.history = [];
  }

  /** Multiplicadores activos. El resto del juego sólo consulta esto. */
  get modifiers() { return this.current?.modifiers ?? {}; }
  get biteMultiplier() { return this.modifiers.bite ?? 1; }
  get trophyMultiplier() { return this.modifiers.trophy ?? 1; }

  update(dt, context) {
    if (this.current) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        const ended = this.current;
        this.current = null;
        this.cooldown = COOLDOWN[0] + Math.random() * (COOLDOWN[1] - COOLDOWN[0]);
        this.events.onEnd?.(ended);
      }
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this._start(context);
  }

  _start(context) {
    const posibles = CANDIDATES.filter((c) => {
      if (!c.when(context)) return false;
      // No se repite el mismo dos veces seguidas: cansa.
      return this.history[this.history.length - 1] !== c.id;
    });
    if (!posibles.length) { this.cooldown = 25; return; }
    const total = posibles.reduce((n, c) => n + c.weight, 0);
    let r = Math.random() * total;
    let elegido = posibles[0];
    for (const c of posibles) { r -= c.weight; if (r <= 0) { elegido = c; break; } }

    this.current = elegido;
    this.timeLeft = elegido.duration;
    this.history.push(elegido.id);
    if (this.history.length > 6) this.history.shift();
    this.events.onStart?.(elegido);
  }

  /** Texto para el HUD mientras dura. */
  get label() {
    if (!this.current) return '';
    return `${this.current.title} · ${Math.ceil(this.timeLeft)} s`;
  }

  /**
   * Ajuste del apetito de un pez concreto según el evento en curso. Devuelve
   * un multiplicador, nunca decide por sí mismo si pica.
   */
  appetiteFor(species, lure, depth) {
    const m = this.modifiers;
    let k = m.bite ?? 1;
    if (m.surface && depth > 2.5) k *= 0.45;         // la fiesta es arriba
    if (m.deepOnly && depth < 3) k *= 0.4;
    if (m.favourRig && lure?.rig === m.favourRig) k *= 1.35;
    if (m.rare) k *= species.rarity === 'comun' ? 0.7 : 1.9;
    return k;
  }

  /** Sesgo del tamaño del ejemplar: los eventos de trofeo suben la talla. */
  get trophyBias() { return clamp(this.trophyMultiplier, 0.6, 2.2); }
}

export const EVENT_IDS = CANDIDATES.map((c) => c.id);
export { SPECIES_BY_ID };
