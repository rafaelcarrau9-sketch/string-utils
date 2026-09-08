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
  footstep(surface) {
    if (surface === 'madera') this._tone(140 + Math.random() * 40, 0.07, { type: 'square', gain: 0.055 });
    else if (surface === 'agua') this._burst(0.2, { gain: 0.11, from: 1800, to: 400 });
    else this._burst(0.09, { gain: 0.06, from: 900, to: 200 });
  }

  // ------------------------------------------------------------- ambiente
  update(dt, { windSpeed = 2, rain = 0, nightFactor = 0, nearWater = 1, cloudiness = 0 } = {}) {
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

    this._cricketTimer -= dt;
    if (this._cricketTimer <= 0) {
      this._cricketTimer = 0.35 + Math.random() * 0.5;
      if (nightFactor > 0.45 && rain < 0.3 && !this.muted) {
        this._tone(4200 + Math.random() * 600, 0.035, { type: 'square', gain: 0.016 });
      }
    }
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
  }

  setMuted(value) {
    this.muted = value;
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }
}
