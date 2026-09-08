/** Utilidades numéricas compartidas. Sin dependencias de three. */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Interpolación exponencial independiente del framerate. */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const randRange = (rng, min, max) => min + rng() * (max - min);

/** Distribución sesgada hacia el extremo bajo: los ejemplares grandes son raros. */
export function skewedRandom(rng, min, max, bias = 2.2) {
  return min + (max - min) * Math.pow(rng(), bias);
}

/** Mulberry32: PRNG determinista y rápido, para mundos reproducibles. */
export function createRandom(seed = 1) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de valor 2D con interpolación suave. Base de todo el terreno. */
export function makeValueNoise2D(seed = 1) {
  const perm = new Uint8Array(512);
  const rng = createRandom(seed);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const hash = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;

  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

/** Suma de octavas. amplitude/frequency por octava con lacunaridad 2. */
export function fbm(noise, x, y, octaves = 4, persistence = 0.5) {
  let total = 0, amplitude = 1, frequency = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise(x * frequency, y * frequency) * amplitude;
    max += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / max;
}
