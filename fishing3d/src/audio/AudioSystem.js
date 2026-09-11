import { Music } from './Music.js';
import { clamp, lerp } from '../core/MathUtils.js';

/**
 * Audio sintetizado con WebAudio.
 *
 * No se descarga ningún fichero: el viento y la lluvia son ruido filtrado, el
 * agua es ruido con un filtro que respira, los pájaros y los grillos son
 * osciladores con envolvente. La mezcla responde a la hora y al tiempo
 * atmosférico, así que el paisaje sonoro cambia solo.
 */

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.volume = 0.8;
    this.muted = false;
    this.layers = {};
    this._birdTimer = 3;
    this._cricketTimer = 5;
    this._frogTimer = 4;
    this.music = null;
    this.musicVolume = 0.55;
  }

  /** Debe llamarse desde un gesto del usuario (política de autoplay). */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.layers.wind = this._noiseLayer({ type: 'lowpass', frequency: 480, q: 0.7, gain: 0 });
    this.layers.water = this._noiseLayer({ type: 'bandpass', frequency: 900, q: 1.4, gain: 0 });
    this.layers.rain = this._noiseLayer({ type: 'highpass', frequency: 1500, q: 0.6, gain: 0 });

    // La música cuelga del mismo maestro que el resto: un solo volumen manda.
    this.music = new Music(this.ctx, this.master);
    this.music.setVolume(this.musicVolume);
    this.ready = true;
  }

  _noiseBuffer(seconds = 3) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _noiseLayer({ type, frequency, q, gain }) {
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer();
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    // LFO lento sobre el filtro: evita que el ruido suene estático.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07 + Math.random() * 0.1;
    lfoGain.gain.value = frequency * 0.28;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start();
    return { source, filter, amp };
  }

  _tone(freq, duration, { type = 'sine', gain = 0.12, slideTo = null, delay = 0, attack = 0.01 } = {}) {
    if (!this.ready || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  _burst(duration, { gain = 0.2, type = 'lowpass', from = 3000, to = 300 } = {}) {
    if (!this.ready || this.muted) return;
    const t0 = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer(Math.max(0.4, duration));
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), t0 + duration);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter); filter.connect(amp); amp.connect(this.master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  }

  // ------------------------------------------------------------- efectos
  cast() { this._burst(0.32, { gain: 0.16, from: 600, to: 2600, type: 'bandpass' }); }
  splash(strength = 1) { this._burst(0.45 * strength, { gain: 0.26, from: 2600, to: 280 }); }
  reelClick() { this._tone(1500 + Math.random() * 400, 0.03, { type: 'square', gain: 0.045 }); }
  dragSlip() { this._tone(820, 0.16, { type: 'sawtooth', gain: 0.09, slideTo: 1250 }); }
  hookSet() { this._tone(240, 0.16, { type: 'square', gain: 0.16, slideTo: 520 }); }
  bite() { this._tone(700, 0.09, { type: 'sine', gain: 0.16 }); this._tone(1040, 0.12, { type: 'sine', gain: 0.14, delay: 0.08 }); }
  lineBreak() { this._burst(0.3, { gain: 0.3, from: 4000, to: 700, type: 'highpass' }); this._tone(180, 0.4, { type: 'sawtooth', gain: 0.16, slideTo: 60 }); }
  landed() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.18, { type: 'triangle', gain: 0.13, delay: i * 0.09 })); }
  coin() { this._tone(880, 0.07, { type: 'square', gain: 0.1 }); this._tone(1320, 0.09, { type: 'square', gain: 0.09, delay: 0.06 }); }

  // --- narrativa -----------------------------------------------------------
  /** Cada línea de diálogo: un golpecito seco, no una nota musical. */
  dialogueBeat() { this._tone(320 + Math.random() * 90, 0.035, { type: 'triangle', gain: 0.045 }); }
  /** Se abre una conversación. */
  greet() { this._tone(392, 0.12, { type: 'triangle', gain: 0.09 }); this._tone(523, 0.14, { type: 'triangle', gain: 0.08, delay: 0.09 }); }
  /** Misión aceptada: dos notas que suben. */
  questAccept() { [440, 587].forEach((f, i) => this._tone(f, 0.16, { type: 'triangle', gain: 0.1, delay: i * 0.1 })); }
  /** Misión cobrada: acorde corto y satisfecho. */
  questDone() { [523, 659, 880].forEach((f, i) => this._tone(f, 0.26, { type: 'triangle', gain: 0.11, delay: i * 0.07 })); }
  /** Subida de nivel: fanfarria breve. */
  levelUp() { [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.3, { type: 'triangle', gain: 0.12, delay: i * 0.08 })); }
  /** Objetivo cumplido: un tic claro. */
  objective() { this._tone(1046, 0.1, { type: 'sine', gain: 0.1 }); this._tone(1568, 0.12, { type: 'sine', gain: 0.08, delay: 0.07 }); }
  /** Empieza un suceso en el agua: nota grave que llama la atención. */
  worldEvent() { this._tone(196, 0.5, { type: 'sine', gain: 0.13, slideTo: 262 }); this._tone(392, 0.4, { type: 'triangle', gain: 0.07, delay: 0.14 }); }
  /**
   * Trueno. De cerca es un chasquido seco con cola; de lejos, un retumbo
   * grave y largo. La diferencia la hace el filtro, no el volumen.
   */
  thunder(closeness = 0.5) {
    if (!this.ready || this.muted) return;
    const cerca = clamp(closeness, 0, 1);
    // El chasquido inicial sólo existe si cae cerca.
    if (cerca > 0.55) {
      this._burst(0.22, { gain: 0.3 * cerca, from: 5200, to: 900, type: 'highpass' });
    }
    // El retumbo: ruido filtrado bajo, largo, que se va apagando.
    this._burst(1.6 + (1 - cerca) * 2.2, {
      gain: 0.1 + cerca * 0.26,
      from: 260 + cerca * 340,
      to: 45,
      type: 'lowpass'
    });
    this._tone(38 + cerca * 26, 1.9, { type: 'sine', gain: 0.05 + cerca * 0.12, slideTo: 24, attack: 0.12 });
  }

  /** Página del cuaderno encontrada. */
  page() { [659, 880, 1175].forEach((f, i) => this._tone(f, 0.34, { type: 'sine', gain: 0.1, delay: i * 0.11 })); }
  /** Chapoteo lejano: se atenúa y se apaga de agudos con la distancia. */
  distantSplash(closeness = 1) {
    const c = clamp(closeness, 0.05, 1);
    this._burst(0.35 + (1 - c) * 0.3, { gain: 0.05 + c * 0.16, from: 600 + c * 2200, to: 200 });
  }
  /** Zumbido del hilo cuando la tensión aprieta. Sube de tono con ella. */
  lineStress(ratio) {
    if (ratio < 0.5) return;
    this._tone(180 + ratio * 520, 0.16, { type: 'sawtooth', gain: 0.02 + ratio * 0.05 });
  }
  /** Coletazo del pez en la superficie. */
  thrash(strength = 1) {
    this._burst(0.22 * strength, { gain: 0.1 + strength * 0.12, from: 1800, to: 300 });
    this._tone(90, 0.14, { type: 'sine', gain: 0.06 * strength, slideTo: 55 });
  }
  /** Clic del carrete: el intervalo lo marca quien llama, según la recogida. */
  reelTick(speed = 1) {
    this._tone(1200 + Math.random() * 500 + speed * 300, 0.028, { type: 'square', gain: 0.03 + speed * 0.02 });
  }
  /** Chapoteo del jugador al andar por el agua somera. */
  wade() { this._burst(0.24, { gain: 0.09, from: 1500, to: 320 }); }

  footstep(surface) {
    if (surface === 'madera') this._tone(140 + Math.random() * 40, 0.07, { type: 'square', gain: 0.055 });
    else if (surface === 'agua') this._burst(0.2, { gain: 0.11, from: 1800, to: 400 });
    else this._burst(0.09, { gain: 0.06, from: 900, to: 200 });
  }

  // ------------------------------------------------------------- ambiente
  update(dt, { windSpeed = 2, rain = 0, nightFactor = 0, nearWater = 1, cloudiness = 0, music = null, frogs = 0 } = {}) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const set = (layer, value) => {
      if (layer) layer.amp.gain.setTargetAtTime(this.muted ? 0 : value, now, 0.4);
    };

    set(this.layers.wind, clamp(0.012 + windSpeed * 0.011, 0, 0.14));
    if (this.layers.wind) {
      this.layers.wind.filter.frequency.setTargetAtTime(320 + windSpeed * 90, now, 0.6);
    }
    set(this.layers.water, clamp(nearWater * (0.02 + windSpeed * 0.006), 0, 0.09));
    set(this.layers.rain, clamp(rain * 0.13, 0, 0.13));

    // Pájaros de día, grillos de noche.
    this._birdTimer -= dt;
    if (this._birdTimer <= 0) {
      this._birdTimer = lerp(1.4, 9, nightFactor) + Math.random() * 4 + cloudiness * 3;
      if (nightFactor < 0.55 && rain < 0.4 && !this.muted) {
        const base = 1600 + Math.random() * 1400;
        const notes = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < notes; i++) {
          this._tone(base * (1 + i * 0.12), 0.09, {
            type: 'sine', gain: 0.035, slideTo: base * 1.35, delay: i * 0.13
          });
        }
      }
    }

    // Ranas: sólo donde hay marisma y a partir del atardecer. Es el sonido que
    // le da carácter a esa zona y la distingue del lago con los ojos cerrados.
    this._frogTimer -= dt;
    if (this._frogTimer <= 0) {
      this._frogTimer = (0.9 + Math.random() * 1.6) / Math.max(0.15, frogs);
      if (frogs > 0.05 && nightFactor > 0.3 && !this.muted) {
        const base = 150 + Math.random() * 90;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          this._tone(base * (1 + Math.random() * 0.06), 0.075, {
            type: 'sawtooth', gain: 0.03 * Math.min(1, frogs), delay: i * 0.11, attack: 0.005
          });
        }
      }
    }

    this._cricketTimer -= dt;
    if (this._cricketTimer <= 0) {
      this._cricketTimer = 0.35 + Math.random() * 0.5;
      if (nightFactor > 0.45 && rain < 0.3 && !this.muted) {
        this._tone(4200 + Math.random() * 600, 0.035, { type: 'square', gain: 0.016 });
      }
    }
    if (this.music && music) this.music.update(dt, music);
  }

  /** Volumen propio de la música, aparte del general. */
  setMusicVolume(value) {
    this.musicVolume = clamp(value, 0, 1);
    this.music?.setVolume(this.musicVolume);
    this.music?.setEnabled(this.musicVolume > 0.001);
  }

  /** Baja la música un momento para que se oiga lo que acaba de pasar. */
  duckMusic(seconds = 2.5) { this.music?.duckFor(seconds); }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
  }

  setMuted(value) {
    this.muted = value;
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }
}
