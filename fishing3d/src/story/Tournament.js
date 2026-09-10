import { clamp } from '../core/MathUtils.js';

/**
 * Concursos de pesca.
 *
 * Es el contenido que no se acaba: se apunta uno pagando inscripción, tiene un
 * rato contado para sacar el ejemplar más pesado que pueda, y cobra según la
 * marca que consiga. Da una razón para volver a un agua ya conocida y para
 * estrenar aparejo, sin depender de la historia.
 *
 * La marca a batir se calcula con lo que hay de verdad en esa zona, no con un
 * número inventado: así el concurso del lago pequeño es asequible y el del
 * cañón, una barbaridad.
 */

const TOURNEY_DURATION = 300;      // segundos de partida por concurso
const TOURNEY_COOLDOWN = 240;      // descanso antes de poder repetir

export class Tournament {
  constructor(data = null, events = {}) {
    this.events = events;
    this.state = 'libre';          // libre | corriendo | terminado
    this.timeLeft = 0;
    this.best = null;              // { species, weight, length }
    this.zone = null;
    this.target = 0;
    this.entry = 0;
    this.prize = 0;
    this.cooldown = 0;
    this.wins = data?.wins ?? 0;
    this.played = data?.played ?? 0;
    this.records = data?.records ?? {};   // zona → mejor peso conseguido
  }

  get running() { return this.state === 'corriendo'; }
  get available() { return this.state === 'libre' && this.cooldown <= 0; }

  /**
   * Condiciones del concurso de una zona: la marca sale del peso medio de un
   * buen ejemplar de las especies presentes, y el premio, de la marca.
   */
  static terms(zone, speciesById, level = 1) {
    let suma = 0, n = 0;
    for (const id of zone.species) {
      const sp = speciesById[id];
      if (!sp || sp.rarity === 'legendario') continue;
      // Un ejemplar del 70 % de la talla máxima: buena captura, no récord.
      const largo = sp.lengthRange[0] + (sp.lengthRange[1] - sp.lengthRange[0]) * 0.7;
      suma += sp.weightPerLength * Math.pow(largo, 3);
      n++;
    }
    const target = n ? (suma / n) * 1.05 : 3;
    const entry = Math.max(60, Math.round(target * 22));
    return {
      target: Math.round(target * 100) / 100,
      entry,
      prize: Math.round(entry * 3.4 + level * 45)
    };
  }

  /** Apunta al jugador. `pay` cobra la inscripción y devuelve si pudo. */
  enter(zone, terms, pay) {
    if (!this.available) return false;
    if (!pay(terms.entry)) return false;
    this.state = 'corriendo';
    this.timeLeft = TOURNEY_DURATION;
    this.best = null;
    this.zone = zone.id;
    this.zoneName = zone.name;
    this.target = terms.target;
    this.entry = terms.entry;
    this.prize = terms.prize;
    this.played += 1;
    this.events.onStart?.(this);
    return true;
  }

  /** Una captura durante el concurso. Sólo cuenta en la zona del concurso. */
  submit(fish, zoneId) {
    if (!this.running || zoneId !== this.zone) return false;
    if (this.best && fish.weight <= this.best.weight) return false;
    this.best = {
      species: fish.species.name,
      weight: fish.weight,
      length: fish.length
    };
    this.events.onLead?.(this);
    return true;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.running) return;
    this.timeLeft -= dt;
    if (this.timeLeft > 0) return;
    this._finish();
  }

  /** Rendirse antes de tiempo: se pierde la inscripción, como en la vida. */
  abandon() {
    if (!this.running) return;
    this.timeLeft = 0;
    this._finish();
  }

  _finish() {
    this.state = 'terminado';
    this.cooldown = TOURNEY_COOLDOWN;
    const peso = this.best?.weight ?? 0;
    const ratio = this.target > 0 ? peso / this.target : 0;
    // Se paga por tramos: quedarse corto no deja al jugador sin nada si ha
    // sacado algo decente, y pasarse de largo se premia de verdad.
    let pago = 0, veredicto = '';
    if (!this.best) {
      veredicto = 'Sin captura. La inscripción se queda en la caja.';
    } else if (ratio >= 1.6) {
      pago = Math.round(this.prize * 2); veredicto = 'Marca de las que se recuerdan.';
      this.wins += 1;
    } else if (ratio >= 1) {
      pago = this.prize; veredicto = 'Has batido la marca. Concurso ganado.';
      this.wins += 1;
    } else if (ratio >= 0.6) {
      pago = Math.round(this.prize * 0.35); veredicto = 'Cerca. Te llevas algo por el esfuerzo.';
    } else {
      veredicto = 'Demasiado poco para esta agua.';
    }
    const mejora = peso > (this.records[this.zone] ?? 0);
    if (mejora) this.records[this.zone] = peso;

    const resultado = {
      zone: this.zone, zoneName: this.zoneName, best: this.best,
      target: this.target, pago, veredicto, ratio, recordDeZona: mejora
    };
    this.state = 'libre';
    this.events.onFinish?.(resultado);
    return resultado;
  }

  /** Texto para el HUD mientras corre. */
  get label() {
    if (!this.running) return '';
    const m = Math.floor(this.timeLeft / 60);
    const s = Math.floor(this.timeLeft % 60);
    const marca = this.best ? `${this.best.weight.toFixed(2)} kg` : 'sin captura';
    return `Concurso · ${m}:${String(s).padStart(2, '0')} · tu mejor: ${marca} · marca ${this.target.toFixed(2)} kg`;
  }

  get progress() { return this.best ? clamp(this.best.weight / Math.max(0.01, this.target), 0, 1.6) : 0; }

  toJSON() { return { wins: this.wins, played: this.played, records: this.records }; }
}
