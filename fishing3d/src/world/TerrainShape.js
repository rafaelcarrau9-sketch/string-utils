import { makeValueNoise2D, fbm, smoothstep, clamp, lerp } from '../core/MathUtils.js';

/**
 * Campo de alturas del mapa. Módulo puro (sin three) para poder probarlo
 * y para que otros sistemas —IA de peces, colocación de vegetación, colisión
 * del jugador— consulten el relieve sin tocar la escena.
 *
 * Convenio: el nivel del agua es y = 0. Todo lo negativo está sumergido.
 */

export const WATER_LEVEL = 0;

export function createHeightField({
  size = 520,            // lado del mapa en metros
  resolution = 320,      // vértices por lado
  seed = 20260908,
  lakeRadius = 118,      // radio medio del lago
  maxDepth = 9.5,        // profundidad máxima en el centro
  hillHeight = 26
} = {}) {
  const noise = makeValueNoise2D(seed);
  const heights = new Float32Array(resolution * resolution);
  const step = size / (resolution - 1);
  const half = size / 2;

  /** Radio del lago para un ángulo dado: contorno irregular, no un círculo. */
  function shoreRadius(angle) {
    const wobble = fbm(noise, Math.cos(angle) * 2.4 + 40, Math.sin(angle) * 2.4 + 40, 3, 0.55);
    const lobe = Math.sin(angle * 2.0 + 0.7) * 0.09 + Math.sin(angle * 3.0 - 1.4) * 0.06;
    return lakeRadius * (0.78 + 0.42 * wobble + lobe);
  }

  function sample(x, z) {
    const dist = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const shore = shoreRadius(angle);
    const t = dist / shore;
    const detail = (fbm(noise, x * 0.055, z * 0.055, 3, 0.5) - 0.5) * 0.9;

    if (t < 1) {
      // Cuenca: repisa poco profunda junto a la orilla y hoya en el centro.
      const bowl = Math.pow(1 - t * t, 1.45);
      const shelf = smoothstep(1, 0.86, t) * 0.75;   // bajío pegado a la orilla
      const bed = (fbm(noise, x * 0.021, z * 0.021, 4, 0.5) - 0.5) * 2.1 * (1 - t * 0.7);
      return -maxDepth * bowl + shelf + bed + detail * 0.35;
    }

    const rise = t - 1;
    const beach = smoothstep(0, 0.05, rise) * 0.9;
    const bank = smoothstep(0.03, 0.42, rise) * 5.5;
    const hills = fbm(noise, x * 0.0075 + 5, z * 0.0075 + 5, 5, 0.52) * hillHeight
      * smoothstep(0.12, 1.1, rise);
    return beach + bank + hills + detail;
  }

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      heights[j * resolution + i] = sample(-half + i * step, -half + j * step);
    }
  }

  /** Altura interpolada bilinealmente en coordenadas de mundo. */
  function heightAt(x, z) {
    const fx = clamp((x + half) / step, 0, resolution - 1.001);
    const fz = clamp((z + half) / step, 0, resolution - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = heights[j * resolution + i];
    const h10 = heights[j * resolution + i + 1];
    const h01 = heights[(j + 1) * resolution + i];
    const h11 = heights[(j + 1) * resolution + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  /** Pendiente 0..1 (0 llano, 1 pared). Se usa para texturizar y para andar. */
  function slopeAt(x, z) {
    const d = step;
    const dx = heightAt(x + d, z) - heightAt(x - d, z);
    const dz = heightAt(x, z + d) - heightAt(x, z - d);
    return clamp(Math.hypot(dx, dz) / (2 * d) / 2.2, 0, 1);
  }

  const depthAt = (x, z) => Math.max(0, WATER_LEVEL - heightAt(x, z));
  const isSubmerged = (x, z) => heightAt(x, z) < WATER_LEVEL;

  return {
    heights, resolution, size, step, half,
    lakeRadius, maxDepth, waterLevel: WATER_LEVEL,
    heightAt, slopeAt, depthAt, isSubmerged, shoreRadius
  };
}
