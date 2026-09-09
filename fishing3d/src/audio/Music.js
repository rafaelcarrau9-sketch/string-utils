import { clamp } from '../core/MathUtils.js';

/**
 * Música ambiental generada.
 *
 * No hay ficheros: no se pueden cargar en la página publicada. Lo que hay es
 * un motor armónico sencillo —un bordón, un acorde que respira y una voz que
 * improvisa sobre una escala— que cambia de humor según dónde y cuándo esté
 * el jugador.
 *
 * La regla que la hace soportable durante horas: toca poco y calla mucho. Las
 * frases se separan por silencios largos y el volumen baja solo cuando pasa
 * algo importante, para no competir con el juego.
 */

// Escalas por humor, en semitonos sobre la tónica.
const MOODS = {
  calma:    { scale: [0, 2, 4, 7, 9, 12, 14, 16], root: 196.00, pad: 0.055, voice: 0.05, rate: 7.5 },
  amanecer: { scale: [0, 2, 4, 7, 9, 11, 12, 16], root: 220.00, pad: 0.05,  voice: 0.058, rate: 6.0 },
  noche:    { scale: [0, 3, 5, 7, 10, 12, 15, 17], root: 146.83, pad: 0.06, voice: 0.04, rate: 9.5 },
  tension:  { scale: [0, 2, 3, 7, 8, 10, 12, 15], root: 164.81, pad: 0.075, voice: 0.06, rate: 3.4 },
  hondo:    { scale: [0, 3, 7, 10, 12, 14, 17, 19], root: 130.81, pad: 0.07, voice: 0.045, rate: 8.5 },
  triunfo:  { scale: [0, 4, 7, 9, 12, 16, 19, 21], root: 261.63, pad: 0.05, voice: 0.075, rate: 2.2 }
};

const semitone = (root, n) => root * Math.pow(2, n / 12);

export class Music {
  constructor(context, destination) {
    this.ctx = context;
    this.enabled = true;
    this.mood = 'calma';
    this.target = 'calma';
    this.timer = 4;
    this.duck = 1;              // baja al ocurrir algo importante
    this.intensity = 1;

    this.out = context.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    // Filtro suave: la música vive por debajo del ambiente, no encima.
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2400;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.out);

    this._startDrone();
  }

  /** Bordón continuo: dos osciladores casi al unísono, que baten despacio. */
  _startDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.filter);
    this.drones = [];
    for (const detune of [-4, 5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = MOODS.calma.root / 2;
      osc.detune.value = detune;
      osc.connect(this.droneGain);
      osc.start();
      this.drones.push(osc);
    }
  }

  /** Una nota de la voz: ataque lento, cola larga. Nunca percusiva. */
  _note(freq, duration, gain) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + duration * 0.28);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(this.filter);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /** Acorde de fondo, tres notas que entran y salen sin que se note. */
  _pad(mood) {
    const m = MOODS[mood];
    const grados = [0, 2, 4];
    const octava = Math.random() < 0.4 ? 12 : 0;
    for (const g of grados) {
      this._note(semitone(m.root, m.scale[g] + octava), 6 + Math.random() * 4, m.pad * this.intensity);
    }
  }

  _phrase(mood) {
    const m = MOODS[mood];
    const notas = 2 + Math.floor(Math.random() * 3);
    let grado = Math.floor(Math.random() * m.scale.length);
    for (let i = 0; i < notas; i++) {
      grado = clamp(grado + Math.round((Math.random() - 0.5) * 4), 0, m.scale.length - 1);
      const freq = semitone(m.root, m.scale[grado] + 12);
      setTimeout(() => {
        if (this.enabled) this._note(freq, 2.2 + Math.random() * 1.6, m.voice * this.intensity);
      }, i * (520 + Math.random() * 420));
    }
  }

  /** Qué humor toca según el mundo. El orden es de más urgente a más de fondo. */
  static moodFor({ fighting, night, hour, zone, weather, celebration }) {
    if (celebration) return 'triunfo';
    if (fighting) return 'tension';
    if (zone === 'garganta') return 'hondo';
    if (night > 0.6) return 'noche';
    if ((hour > 5.5 && hour < 9) || (hour > 18.5 && hour < 21)) return 'amanecer';
    if (weather > 0.7) return 'hondo';
    return 'calma';
  }

  setMood(mood) {
    if (!MOODS[mood] || mood === this.target) return;
    this.target = mood;
  }

  /** Baja la música un momento: al pescar algo, al hablar, al saltar un aviso. */
  duckFor(seconds = 3) { this._duckUntil = this.ctx.currentTime + seconds; }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }

  setVolume(v) { this.volume = clamp(v, 0, 1); }

  update(dt, { fighting = false, night = 0, hour = 12, zone = '', weather = 0, celebration = false } = {}) {
    if (!this.enabled) return;
    const quiere = Music.moodFor({ fighting, night, hour, zone, weather, celebration });
    this.setMood(quiere);

    // El cambio de humor no es un corte: el bordón se desliza a la tónica nueva.
    if (this.target !== this.mood) {
      this.mood = this.target;
      const m = MOODS[this.mood];
      const now = this.ctx.currentTime;
      for (const osc of this.drones) osc.frequency.setTargetAtTime(m.root / 2, now, 2.2);
      this.filter.frequency.setTargetAtTime(this.mood === 'tension' ? 1500 : 2400, now, 1.5);
      this.timer = Math.min(this.timer, 2);
    }

    const agachado = this._duckUntil && this.ctx.currentTime < this._duckUntil;
    const objetivo = (this.volume ?? 0.5) * (agachado ? 0.25 : 1);
    this.out.gain.setTargetAtTime(objetivo, this.ctx.currentTime, 0.9);
    this.droneGain.gain.setTargetAtTime(0.05 * this.intensity, this.ctx.currentTime, 3);

    this.timer -= dt;
    if (this.timer > 0) return;
    const m = MOODS[this.mood];
    // Silencios largos entre frases: la música acompaña, no llena.
    this.timer = m.rate * (0.7 + Math.random() * 0.9);
    if (Math.random() < 0.55) this._pad(this.mood);
    else this._phrase(this.mood);
  }

  dispose() {
    this.drones.forEach((o) => { try { o.stop(); } catch { /* ya parado */ } });
    this.out.disconnect();
  }
}
