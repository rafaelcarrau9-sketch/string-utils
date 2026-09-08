/**
 * Entrada unificada: teclado, ratón con pointer lock y rueda.
 * No decide nada de gameplay; sólo expone estado consultable y eventos.
 */

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false };
    this.locked = false;
    this.enabled = true;
    this._listeners = new Map();

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      this._emit('keydown', e);
      if (['Space', 'Tab', 'KeyE'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); this._emit('keyup', e); };
    this._onMove = (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onDown = (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      this._emit('pointerdown', e);
    };
    this._onUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      this._emit('pointerup', e);
    };
    this._onWheel = (e) => { this.mouse.wheel += Math.sign(e.deltaY); };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      this._emit('lockchange', this.locked);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event).delete(fn);
  }

  _emit(event, arg) {
    const set = this._listeners.get(event);
    if (set) set.forEach((fn) => fn(arg));
  }

  isDown(code) { return this.keys.has(code); }

  requestLock() { this.dom.requestPointerLock?.(); }
  releaseLock() { document.exitPointerLock?.(); }

  /** Consume el delta acumulado: llamar una vez por frame. */
  consumeMouseDelta() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    return d;
  }

  setEnabled(value) {
    this.enabled = value;
    if (!value) this.keys.clear();
  }
}
