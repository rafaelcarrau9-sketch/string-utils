import * as THREE from 'three';
import { createRandom, makeValueNoise2D, fbm, clamp, lerp } from '../core/MathUtils.js';

/**
 * Fábrica de texturas procedurales.
 *
 * El juego no puede descargar imágenes (la página publicada bloquea cualquier
 * recurso externo que no sea un script), así que todos los mapas de color,
 * normal y rugosidad se generan por código sobre un canvas. Cada material
 * devuelve un juego completo de mapas para que el PBR de three responda bien
 * a la luz en vez de verse plano.
 *
 * Para sustituirlos más adelante por texturas reales basta con cambiar
 * `TextureLibrary.material()` por un cargador: el resto del juego sólo pide
 * materiales por nombre.
 */

function canvasOf(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

/** Convierte un campo de alturas en un mapa de normales tangenciales (sobel). */
function heightToNormal(height, size, strength = 2.2) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Pinta un canvas evaluando `fn(x, y) -> [r,g,b] 0..1` por píxel. */
function paint(size, fn) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = clamp(c[0], 0, 1) * 255;
      img.data[i + 1] = clamp(c[1], 0, 1) * 255;
      img.data[i + 2] = clamp(c[2], 0, 1) * 255;
      img.data[i + 3] = (c[3] === undefined ? 1 : clamp(c[3], 0, 1)) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function textureFrom(canvas, { srgb = false, repeat = 1, aniso = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Definición de cada superficie: color base, veta y respuesta a la luz. */
const SURFACES = {
  // Base neutra: el terreno la tiñe por vértice (arena, hierba, limo, roca)
  // para pasar de un material a otro sin costuras ni draw calls extra.
  suelo: {
    size: 256,
    base: [0.62, 0.6, 0.57],
    accent: [0.34, 0.33, 0.31],
    grain: (noise, x, y) =>
      fbm(noise, x * 0.07, y * 0.07, 5, 0.55) * 0.75 + fbm(noise, x * 0.3, y * 0.3, 2, 0.5) * 0.25,
    roughness: [0.78, 0.97],
    normalStrength: 1.9
  },
  tierra: {
    size: 256,
    base: [0.28, 0.21, 0.14],
    accent: [0.16, 0.12, 0.08],
    grain: (noise, x, y) => fbm(noise, x * 0.05, y * 0.05, 5, 0.55),
    roughness: [0.82, 0.98],
    normalStrength: 2.4
  },
  arena: {
    size: 256,
    base: [0.62, 0.55, 0.42],
    accent: [0.48, 0.42, 0.32],
    grain: (noise, x, y) => fbm(noise, x * 0.14, y * 0.14, 4, 0.5),
    roughness: [0.7, 0.92],
    normalStrength: 1.1
  },
  hierba: {
    size: 256,
    base: [0.19, 0.31, 0.13],
    accent: [0.11, 0.2, 0.08],
    grain: (noise, x, y) => fbm(noise, x * 0.09, y * 0.09, 5, 0.6),
    roughness: [0.78, 0.96],
    normalStrength: 1.8
  },
  roca: {
    size: 256,
    base: [0.42, 0.41, 0.39],
    accent: [0.2, 0.2, 0.21],
    grain: (noise, x, y) => {
      const base = fbm(noise, x * 0.035, y * 0.035, 5, 0.55);
      const cracks = Math.pow(1 - Math.abs(fbm(noise, x * 0.02, y * 0.02, 3, 0.5) - 0.5) * 2, 8);
      return clamp(base - cracks * 0.45, 0, 1);
    },
    roughness: [0.55, 0.88],
    normalStrength: 3.2
  },
  corteza: {
    size: 256,
    base: [0.3, 0.22, 0.16],
    accent: [0.13, 0.09, 0.06],
    grain: (noise, x, y) => {
      // Vetas verticales: mucha frecuencia en X, poca en Y.
      const v = fbm(noise, x * 0.28, y * 0.02, 4, 0.6);
      return clamp(v * 0.7 + fbm(noise, x * 0.06, y * 0.06, 3, 0.5) * 0.3, 0, 1);
    },
    roughness: [0.75, 0.98],
    normalStrength: 3
  },
  madera: {
    size: 256,
    base: [0.44, 0.32, 0.2],
    accent: [0.24, 0.16, 0.09],
    grain: (noise, x, y) => {
      const rings = Math.sin((y * 0.35 + fbm(noise, x * 0.02, y * 0.04, 3, 0.5) * 9)) * 0.5 + 0.5;
      const plank = (x % 64) < 2 ? 0.15 : 1;          // junta entre tablones
      return clamp(rings * 0.55 + 0.35, 0, 1) * plank;
    },
    roughness: [0.6, 0.9],
    normalStrength: 2
  }
};

export class TextureLibrary {
  constructor() {
    this.cache = new Map();
    this.noise = makeValueNoise2D(1337);
  }

  /** Devuelve (y cachea) un MeshStandardMaterial completo para una superficie. */
  material(name, { repeat = 8, color = 0xffffff, ...extra } = {}) {
    const key = `${name}:${repeat}:${color}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const def = SURFACES[name];
    if (!def) throw new Error(`Superficie desconocida: ${name}`);
    const { size } = def;

    const height = new Float32Array(size * size);
    const albedo = paint(size, (x, y) => {
      const g = def.grain(this.noise, x, y);
      height[y * size + x] = g;
      return [
        lerp(def.accent[0], def.base[0], g),
        lerp(def.accent[1], def.base[1], g),
        lerp(def.accent[2], def.base[2], g)
      ];
    });
    const rough = paint(size, (x, y) => {
      const g = height[y * size + x];
      const r = lerp(def.roughness[0], def.roughness[1], 1 - g);
      return [r, r, r];
    });

    const material = new THREE.MeshStandardMaterial({
      map: textureFrom(albedo, { srgb: true, repeat }),
      normalMap: textureFrom(heightToNormal(height, size, def.normalStrength), { repeat }),
      roughnessMap: textureFrom(rough, { repeat }),
      roughness: 1,
      metalness: 0,
      color,
      ...extra
    });
    material.normalScale.set(1, 1);
    // Compartido: lo entrega la biblioteca a varios sistemas y sólo ella lo
    // destruye. Sin esta marca, el primer sistema que se descarta al cambiar
    // de zona dejaba sin programa a los demás.
    material.userData.shared = true;
    this.cache.set(key, material);
    return material;
  }

  /** Normales de oleaje que teselan, para el shader de agua. */
  waterNormals(size = 512) {
    if (this.cache.has('waterNormals')) return this.cache.get('waterNormals');
    const height = new Float32Array(size * size);
    // Dos trenes de olas cruzados más ruido: evita el patrón repetido evidente.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        height[y * size + x] =
          Math.sin(u * 3 + Math.cos(v * 2) * 0.6) * 0.35 +
          Math.sin(v * 5 - u * 1.5) * 0.25 +
          fbm(this.noise, x * 0.05, y * 0.05, 4, 0.55) * 0.4;
      }
    }
    const tex = textureFrom(heightToNormal(height, size, 1.6), { repeat: 1, aniso: 8 });
    this.cache.set('waterNormals', tex);
    return tex;
  }

  /**
   * Profundidad del lago codificada en una textura (canal rojo, 0 en la
   * orilla y 1 en lo más hondo). El shader del agua la usa para decidir
   * cuánto se ve el fondo, sin necesidad de una segunda pasada de render.
   */
  depthMap(terrain, size = 512, cacheKey = 'depthMap') {
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const half = terrain.field.half;
    const maxDepth = terrain.field.maxDepth;
    const data = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = -half + (i / (size - 1)) * half * 2;
        const z = -half + (j / (size - 1)) * half * 2;
        const d = clamp(terrain.depthAt(x, z) / maxDepth, 0, 1);
        const k = (j * size + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = Math.round(d * 255);
        data[k + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.cache.set(cacheKey, tex);
    return tex;
  }

  /** Sprite de mata de hierba con alfa, para la vegetación instanciada. */
  grassBlade(size = 128) {
    if (this.cache.has('grassBlade')) return this.cache.get('grassBlade');
    const canvas = canvasOf(size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const rng = createRandom(7);
    for (let i = 0; i < 14; i++) {
      const x = size * (0.1 + rng() * 0.8);
      const h = size * (0.45 + rng() * 0.5);
      const lean = (rng() - 0.5) * size * 0.28;
      const w = size * (0.018 + rng() * 0.022);
      const g = 0.35 + rng() * 0.4;
      const grad = ctx.createLinearGradient(x, size, x + lean, size - h);
      grad.addColorStop(0, `rgba(${Math.round(38 * g)},${Math.round(62 * g)},${Math.round(24 * g)},1)`);
      grad.addColorStop(1, `rgba(${Math.round(96 * g)},${Math.round(132 * g)},${Math.round(48 * g)},0.92)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - w, size);
      ctx.quadraticCurveTo(x + lean * 0.4, size - h * 0.55, x + lean, size - h);
      ctx.quadraticCurveTo(x + lean * 0.5 + w, size - h * 0.5, x + w, size);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set('grassBlade', tex);
    return tex;
  }

  /** Mancha de follaje con alfa suave, para las copas de los árboles. */
  foliage(size = 128) {
    if (this.cache.has('foliage')) return this.cache.get('foliage');
    const rng = createRandom(23);
    const canvas = canvasOf(size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.6) * size * 0.44;
      const x = size / 2 + Math.cos(a) * r;
      const y = size / 2 + Math.sin(a) * r;
      const rad = size * (0.04 + rng() * 0.07);
      const shade = 0.45 + rng() * 0.55;
      ctx.fillStyle = `rgba(${Math.round(88 * shade)},${Math.round(134 * shade)},${Math.round(60 * shade)},0.95)`;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * 0.72, a, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set('foliage', tex);
    return tex;
  }

  /** Textura de nubes con alfa para la cúpula celeste. */
  clouds(size = 512) {
    if (this.cache.has('clouds')) return this.cache.get('clouds');
    const noise = makeValueNoise2D(99);
    const canvas = paint(size, (x, y) => {
      // Coordenadas envolventes para que no se vea la costura.
      const u = x / size, v = y / size;
      const n = fbm(noise, u * 6, v * 6, 5, 0.55);
      const mask = clamp((n - 0.42) * 3.4, 0, 1);
      const density = Math.pow(mask, 1.3);
      return [1, 1, 1, density * 0.85];
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.cache.set('clouds', tex);
    return tex;
  }

  /** Gota de lluvia alargada para el sistema de partículas. */
  raindrop(size = 32) {
    if (this.cache.has('raindrop')) return this.cache.get('raindrop');
    const canvas = canvasOf(size);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, 'rgba(200,225,245,0)');
    grad.addColorStop(0.5, 'rgba(210,232,250,0.75)');
    grad.addColorStop(1, 'rgba(200,225,245,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(size * 0.42, 0, size * 0.16, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set('raindrop', tex);
    return tex;
  }

  dispose() {
    this.cache.forEach((v) => v.dispose?.());
    this.cache.clear();
  }
}
