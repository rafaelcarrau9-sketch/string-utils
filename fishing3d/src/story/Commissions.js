import { clamp, createRandom } from '../core/MathUtils.js';

/**
 * Encargos del tablón.
 *
 * Lo que sostiene el juego cuando la historia se acaba: tres peticiones por
 * agua, generadas con lo que de verdad vive ahí, que se renuevan solas. No son
 * misiones de la campaña —no tienen diálogo ni consecuencias— sino trabajo:
 * alguien quiere un pez concreto y paga por él.
 *
 * La dificultad y el pago salen de los mismos datos que usa el resto del
 * juego: rareza de la especie, talla pedida y calado al que vive. Así un
 * encargo del cañón vale lo que cuesta y uno del lago también.
 */

const REFRESH = 600;             // segundos hasta renovar la tabla

const CLIENTES = [
  'el restaurante del puerto', 'un coleccionista de la capital', 'la cofradía',
  'el hostal del cruce', 'un aficionado del pueblo', 'la asociación de pesca',
  'la escuela del valle', 'un fotógrafo de naturaleza'
];

const PLANTILLAS = [
  {
    id: 'cantidad',
    peso: 1.0,
    build: (sp, rng) => {
      const n = 2 + Math.floor(rng() * 3);
      return {
        kind: 'cantidad', count: n, species: sp.id,
        text: `${n} ejemplares de ${sp.name.toLowerCase()}`,
        dificultad: n * (sp.rarity === 'comun' ? 1 : sp.rarity === 'raro' ? 2.1 : 4)
      };
    }
  },
  {
    id: 'talla',
    peso: 0.9,
    build: (sp, rng) => {
      const frac = 0.62 + rng() * 0.26;
      const cm = Math.round(sp.lengthRange[0] + (sp.lengthRange[1] - sp.lengthRange[0]) * frac);
      return {
        kind: 'talla', count: 1, species: sp.id, minLength: cm,
        text: `una ${sp.name.toLowerCase()} de ${cm} cm o más`,
        dificultad: 2.2 + frac * 4 + (sp.rarity === 'comun' ? 0 : 2)
      };
    }
  },
  {
    id: 'noche',
    peso: 0.55,
    build: (sp, rng) => {
      const n = 1 + Math.floor(rng() * 2);
      // El plural de «carpa espejo» no es «carpa espejos»: con más de uno se
      // dice «ejemplares de», que funciona con cualquier nombre compuesto.
      const cuerpo = n > 1
        ? `${n} ejemplares de ${sp.name.toLowerCase()} pescados de noche`
        : `un ejemplar de ${sp.name.toLowerCase()} pescado de noche`;
      return {
        kind: 'noche', count: n, species: sp.id, night: true,
        text: cuerpo,
        dificultad: 3 + n * 1.8 + (sp.activity.noche > 1 ? 0 : 2.5)
      };
    }
  }
];

export class Commissions {
  constructor(data = null) {
    this.done = data?.done ?? 0;
    this.earned = data?.earned ?? 0;
    this.accepted = data?.accepted ?? null;    // { zone, ...oferta, progreso }
    this.tables = data?.tables ?? {};          // zona → { seed, offers, age }
  }

  /** Tabla de encargos de una zona; se regenera cuando caduca. */
  offersFor(zone, speciesById, level = 1) {
    const t = this.tables[zone.id];
    if (t && t.age < REFRESH && t.offers?.length) return t.offers;

    const seed = Math.floor(Math.random() * 1e9);
    const rng = createRandom(seed);
    const pool = zone.species
      .map((id) => speciesById[id])
      .filter((sp) => sp && sp.rarity !== 'legendario');
    const offers = [];
    const usadas = new Set();
    for (let i = 0; i < 3 && pool.length; i++) {
      // Sin repetir especie: tres encargos del mismo pez no son tres encargos.
      let sp = null;
      for (let intento = 0; intento < 12; intento++) {
        const cand = pool[Math.floor(rng() * pool.length)];
        if (!usadas.has(cand.id)) { sp = cand; break; }
      }
      if (!sp) break;
      usadas.add(sp.id);

      const total = PLANTILLAS.reduce((n, p) => n + p.peso, 0);
      let r = rng() * total;
      let plantilla = PLANTILLAS[0];
      for (const p of PLANTILLAS) { r -= p.peso; if (r <= 0) { plantilla = p; break; } }

      const base = plantilla.build(sp, rng);
      offers.push({
        ...base,
        id: `${zone.id}:${i}:${seed}`,
        zone: zone.id,
        client: CLIENTES[Math.floor(rng() * CLIENTES.length)],
        reward: Math.round(base.dificultad * (34 + level * 6)),
        xp: Math.round(base.dificultad * 7)
      });
    }
    this.tables[zone.id] = { seed, offers, age: 0 };
    return offers;
  }

  /** Segundos hasta que se renueve la tabla de una zona. */
  refreshIn(zoneId) {
    const t = this.tables[zoneId];
    return t ? Math.max(0, REFRESH - t.age) : 0;
  }

  accept(offer) {
    if (this.accepted) return false;
    this.accepted = { ...offer, progreso: 0 };
    return true;
  }

  abandon() { this.accepted = null; }

  /**
   * Una captura. Devuelve `null` si no cuenta, `{ done:false }` si suma o
   * `{ done:true, reward, xp }` si completa el encargo.
   */
  submit(fish, zoneId, night) {
    const a = this.accepted;
    if (!a || a.zone !== zoneId) return null;
    if (fish.species.id !== a.species) return null;
    if (a.minLength && fish.length < a.minLength) return null;
    if (a.night && !night) return null;
    a.progreso += 1;
    if (a.progreso < a.count) return { done: false, progreso: a.progreso, total: a.count };
    const premio = { done: true, reward: a.reward, xp: a.xp, text: a.text, client: a.client };
    this.done += 1;
    this.earned += a.reward;
    this.accepted = null;
    // La tabla de esa zona se renueva: el encargo cumplido ya no está.
    delete this.tables[zoneId];
    return premio;
  }

  update(dt) {
    for (const t of Object.values(this.tables)) t.age += dt;
  }

  toJSON() {
    return { done: this.done, earned: this.earned, accepted: this.accepted, tables: this.tables };
  }
}
