/**
 * Persistencia en localStorage. Tolerante a partidas de versiones anteriores:
 * lo que ya no existe en los catálogos se descarta al cargar en vez de romper.
 */

const KEY = 'stillwaters.save.v1';
const VERSION = 1;

export class SaveSystem {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  save(payload) {
    try {
      this.storage.setItem(KEY, JSON.stringify({ version: VERSION, ...payload }));
      return true;
    } catch (err) {
      console.warn('[save] no se pudo guardar:', err.message);
      return false;
    }
  }

  load() {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return null;
      return data;
    } catch (err) {
      console.warn('[save] partida ilegible, se empieza de cero:', err.message);
      return null;
    }
  }

  clear() {
    try { this.storage.removeItem(KEY); } catch { /* almacenamiento bloqueado */ }
  }
}
