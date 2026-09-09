import { QUESTS, QUESTS_BY_ID, NPCS } from './StoryData.js';

/**
 * Diario de misiones.
 *
 * Es un intérprete de los datos de `StoryData`: no conoce ninguna misión
 * concreta. El juego le manda hechos («he cobrado una perca de 43 cm en el
 * lago», «he llegado al río», «he hablado con Tomé») y él decide qué objetivo
 * avanza, qué misión se completa y qué se desbloquea.
 *
 * Estados de una misión:
 *   bloqueada    le faltan requisitos
 *   disponible   se puede aceptar (hablando con su personaje)
 *   activa       aceptada, con objetivos en curso
 *   porEntregar  objetivos cumplidos, falta volver con el personaje
 *   completada   cobrada
 */

export const QuestState = {
  LOCKED: 'bloqueada',
  AVAILABLE: 'disponible',
  ACTIVE: 'activa',
  READY: 'porEntregar',
  DONE: 'completada'
};

export class QuestSystem {
  constructor(data = null, events = {}) {
    this.events = events;
    this.accepted = new Set(data?.accepted ?? []);
    this.completed = new Set(data?.completed ?? []);
    this.progress = data?.progress ?? {};     // questId → [contador por objetivo]
    this.pages = data?.pages ?? [];           // páginas del cuaderno reunidas
    this.tracked = data?.tracked ?? null;
    this.metNpcs = new Set(data?.metNpcs ?? []);
    this.unlockedByQuest = new Set(data?.unlockedByQuest ?? []);
    this.seenPrologue = data?.seenPrologue ?? false;
  }

  // ------------------------------------------------------------- consultas
  stateOf(id) {
    if (this.completed.has(id)) return QuestState.DONE;
    const quest = QUESTS_BY_ID[id];
    if (!quest) return QuestState.LOCKED;
    if (!this.accepted.has(id)) {
      const ready = (quest.requires ?? []).every((r) => this.completed.has(r));
      return ready ? QuestState.AVAILABLE : QuestState.LOCKED;
    }
    return this._objectivesMet(quest) ? QuestState.READY : QuestState.ACTIVE;
  }

  counters(id) {
    const quest = QUESTS_BY_ID[id];
    if (!quest) return [];
    if (!this.progress[id]) this.progress[id] = quest.objectives.map(() => 0);
    return this.progress[id];
  }

  /** Progreso 0..1 de un objetivo concreto. */
  objectiveProgress(id, index) {
    const quest = QUESTS_BY_ID[id];
    const target = quest.objectives[index].count ?? 1;
    return Math.min(1, this.counters(id)[index] / target);
  }

  _objectivesMet(quest) {
    const c = this.counters(quest.id);
    return quest.objectives.every((o, i) => c[i] >= (o.count ?? 1));
  }

  get active() {
    return QUESTS.filter((q) => this.accepted.has(q.id) && !this.completed.has(q.id));
  }

  get availableQuests() {
    return QUESTS.filter((q) => this.stateOf(q.id) === QuestState.AVAILABLE);
  }

  /** Misiones que este personaje puede ofrecer o recoger ahora mismo. */
  forNpc(npcId) {
    const offer = [], turnIn = [], inProgress = [];
    for (const q of QUESTS) {
      const state = this.stateOf(q.id);
      if (q.npc === npcId && state === QuestState.AVAILABLE) offer.push(q);
      else if (q.turnIn === npcId && state === QuestState.READY) turnIn.push(q);
      else if (q.turnIn === npcId && state === QuestState.ACTIVE) inProgress.push(q);
    }
    return { offer, turnIn, inProgress };
  }

  /** ¿Hay algo que hacer con este personaje? Para el icono sobre su cabeza. */
  npcMarker(npcId) {
    const { offer, turnIn } = this.forNpc(npcId);
    if (turnIn.length) return 'entregar';
    if (offer.length) return 'nueva';
    if (!this.metNpcs.has(npcId)) return 'nueva';
    return null;
  }

  isUnlocked(questId) { return this.completed.has(questId) || this.unlockedByQuest.has(questId); }

  /** La misión que sigue el HUD: la marcada, o la primera de historia activa. */
  get trackedQuest() {
    if (this.tracked && this.accepted.has(this.tracked) && !this.completed.has(this.tracked)) {
      return QUESTS_BY_ID[this.tracked];
    }
    const activas = this.active;
    return activas.find((q) => q.type === 'historia') ?? activas[0] ?? null;
  }

  track(id) { this.tracked = id; }

  // -------------------------------------------------------------- acciones
  /**
   * Acepta una misión.
   *
   * `snapshot` describe lo que el jugador ya ha conseguido (récords por
   * especie, especies descubiertas, nivel, dinero, equipo, zonas visitadas).
   * Con él se rellenan de entrada los objetivos que ya estaban cumplidos antes
   * de que nadie los pidiera: si ya sacaste el salmón de metro y medio, no
   * tiene ningún sentido obligarte a sacar otro sólo porque el encargo llegó
   * después.
   */
  accept(id, snapshot = null) {
    if (this.stateOf(id) !== QuestState.AVAILABLE) return false;
    this.accepted.add(id);
    const c = this.counters(id);
    const quest = QUESTS_BY_ID[id];
    if (snapshot) {
      quest.objectives.forEach((o, i) => {
        const ya = creditFor(o, snapshot);
        if (ya > 0) c[i] = Math.min(ya, o.count ?? 1);
      });
    }
    if (quest.type === 'historia') this.tracked = id;
    this.events.onAccept?.(quest);
    if (this._objectivesMet(quest)) this.events.onReady?.(quest);
    return true;
  }

  /** Cobra una misión lista. Devuelve la recompensa aplicada o null. */
  turnIn(id) {
    if (this.stateOf(id) !== QuestState.READY) return null;
    const quest = QUESTS_BY_ID[id];
    this.completed.add(id);
    if (this.tracked === id) this.tracked = null;
    const reward = { ...(quest.reward ?? {}) };
    if (reward.page && !this.pages.includes(reward.page)) this.pages.push(reward.page);
    if (reward.unlockZone) this.unlockedByQuest.add(quest.id);
    this.events.onComplete?.(quest, reward);
    return reward;
  }

  meet(npcId) {
    const nuevo = !this.metNpcs.has(npcId);
    this.metNpcs.add(npcId);
    this.notify('talk', { npc: npcId });
    return nuevo;
  }

  // -------------------------------------------------------------- eventos
  /**
   * Hecho del juego. `kind` es el tipo de objetivo que puede avanzar y
   * `payload` lo describe. Sólo avanzan objetivos de misiones aceptadas.
   */
  notify(kind, payload = {}) {
    let cambio = false;
    for (const quest of this.active) {
      const c = this.counters(quest.id);
      quest.objectives.forEach((o, i) => {
        if (o.kind !== kind) return;
        if (c[i] >= (o.count ?? 1)) return;
        if (!this._matches(o, payload)) return;
        // Los objetivos de umbral (nivel, dinero, descubrimientos) guardan el
        // valor alcanzado; los de recuento suman uno.
        c[i] = ABSOLUTE.has(kind) ? Math.max(c[i], payload.value ?? 0) : c[i] + 1;
        cambio = true;
        this.events.onProgress?.(quest, i, c[i]);
      });
      if (cambio && this._objectivesMet(quest)) this.events.onReady?.(quest);
    }
    return cambio;
  }

  _matches(objective, p) {
    switch (objective.kind) {
      case 'catch':
        if (objective.species && p.species !== objective.species) return false;
        if (objective.minLength && (p.length ?? 0) < objective.minLength) return false;
        if (objective.minWeight && (p.weight ?? 0) < objective.minWeight) return false;
        if (objective.zone && p.zone !== objective.zone) return false;
        if (objective.night && !p.night) return false;
        return true;
      case 'catchAny':
        return !objective.zone || p.zone === objective.zone;
      case 'visit':
        return p.zone === objective.zone;
      case 'talk':
        return p.npc === objective.npc;
      case 'own':
        return p.category === objective.category && p.item === objective.item;
      case 'discover':
      case 'level':
      case 'money':
      case 'deliver':
        return (p.value ?? 0) > 0;
      default:
        return false;
    }
  }

  toJSON() {
    return {
      accepted: [...this.accepted],
      completed: [...this.completed],
      progress: this.progress,
      pages: this.pages,
      tracked: this.tracked,
      metNpcs: [...this.metNpcs],
      unlockedByQuest: [...this.unlockedByQuest],
      seenPrologue: this.seenPrologue
    };
  }
}

/**
 * Qué parte de un objetivo ya está cumplida según el historial del jugador.
 *
 * Sólo cuenta lo que se puede afirmar sin ambigüedad. Un «captura tres peces
 * cualesquiera» no se da por hecho con el historial: eso es trabajo por hacer,
 * no un logro anterior.
 */
function creditFor(objective, snap) {
  switch (objective.kind) {
    case 'catch': {
      if (!objective.species) return 0;
      const rec = snap.records?.[objective.species];
      if (!rec?.count) return 0;
      // Sólo se acredita un ejemplar, y sólo si el récord cumple la talla.
      if (objective.minLength && rec.bestLength < objective.minLength) return 0;
      if (objective.minWeight && rec.bestWeight < objective.minWeight) return 0;
      // Una talla o una zona concretas no se pueden comprobar hacia atrás con
      // seguridad, así que sólo se acredita cuando no hay condición de zona.
      if (objective.zone || objective.night) return 0;
      return 1;
    }
    case 'discover': return snap.discovered ?? 0;
    case 'level': return snap.level ?? 0;
    case 'money': return snap.money ?? 0;
    case 'deliver': return snap.pages ?? 0;
    case 'own': return snap.owns?.(objective.category, objective.item) ? 1 : 0;
    case 'visit': return snap.visited?.has?.(objective.zone) ? 1 : 0;
    case 'talk': return snap.met?.has?.(objective.npc) ? 1 : 0;
    default: return 0;
  }
}

/** Objetivos cuyo contador es un valor alcanzado, no un recuento de sucesos. */
const ABSOLUTE = new Set(['discover', 'level', 'money', 'deliver']);

/** Nombre legible de un personaje, para la interfaz. */
export function npcName(id) { return NPCS[id]?.name ?? id; }
