import { makeValueNoise2D, fbm, smoothstep, clamp, lerp } from '../core/MathUtils.js';

/**
 * Campo de alturas del mapa. Módulo puro (sin three) para poder probarlo
 * y para que otros sistemas —IA de peces, colocación de vegetación, colisión
 * del jugador— consulten el relieve sin tocar la escena.
 *
 * Convenio: el nivel del agua es y = 0. Todo lo negativo está sumergido.
 *
 * Hay cuatro formas de agua, y no son variaciones cosméticas: cambian dónde
 * están los peces, cómo se lanza y hasta si hay corriente.
 *
 *   lago      cuenca redondeada, orilla suave, hoya en el centro
 *   rio       canal que serpentea de sur a norte, con corriente y pozas
 *   marisma   lámina ancha y somera sembrada de islotes
 *   garganta  cañón estrecho de paredes verticales y agua muy honda
 */

export const WATER_LEVEL = 0;

export function createHeightField({
  size = 520,            // lado del mapa en metros
  resolution = 320,      // vértices por lado
  seed = 20260908,
  shape = 'lago',
  lakeRadius = 118,      // radio medio del agua (también acota dónde nacen los peces)
  maxDepth = 9.5,        // profundidad máxima
  hillHeight = 26,
  channelWidth = 34,     // sólo río y garganta: media anchura del cauce
  meander = 46           // sólo río: cuánto se desvía el cauce
} = {}) {
  const noise = makeValueNoise2D(seed);
  const heights = new Float32Array(resolution * resolution);
  const step = size / (resolution - 1);
  const half = size / 2;

  /** Radio del agua para un ángulo dado: contorno irregular, no un círculo. */
  function shoreRadius(angle) {
    const wobble = fbm(noise, Math.cos(angle) * 2.4 + 40, Math.sin(angle) * 2.4 + 40, 3, 0.55);
    const lobe = Math.sin(angle * 2.0 + 0.7) * 0.09 + Math.sin(angle * 3.0 - 1.4) * 0.06;
    return lakeRadius * (0.78 + 0.42 * wobble + lobe);
  }

  /** Eje del cauce: x del centro del canal para una z dada. */
  function channelCenter(z) {
    return Math.sin(z * 0.0125) * meander
      + Math.sin(z * 0.0295 + 1.7) * meander * 0.35
      + (fbm(noise, z * 0.004 + 11, 3.5, 3, 0.5) - 0.5) * meander * 0.5;
  }

  /** Derivada del eje: sirve para saber hacia dónde corre el agua. */
  function channelSlope(z) {
    const d = 2;
    return (channelCenter(z + d) - channelCenter(z - d)) / (2 * d);
  }

  const SHAPES = {
    /** Cuenca clásica: repisa junto a la orilla, hoya en el centro. */
    lago(x, z, detail) {
      const dist = Math.hypot(x, z);
      const t = dist / shoreRadius(Math.atan2(z, x));
      if (t < 1) {
        const bowl = Math.pow(1 - t * t, 1.45);
        const shelf = smoothstep(1, 0.86, t) * 0.75;
        const bed = (fbm(noise, x * 0.021, z * 0.021, 4, 0.5) - 0.5) * 2.1 * (1 - t * 0.7);
        return -maxDepth * bowl + shelf + bed + detail * 0.35;
      }
      const rise = t - 1;
      return smoothstep(0, 0.05, rise) * 0.9
        + smoothstep(0.03, 0.42, rise) * 5.5
        + fbm(noise, x * 0.0075 + 5, z * 0.0075 + 5, 5, 0.52) * hillHeight * smoothstep(0.12, 1.1, rise)
        + detail;
    },

    /**
     * Canal que serpentea. La profundidad no es simétrica: el agua excava la
     * orilla exterior de cada curva y deposita grava en la interior, que es
     * exactamente donde un pescador busca las pozas.
     */
    rio(x, z, detail) {
      const center = channelCenter(z);
      const slope = channelSlope(z);
      const offset = x - center;
      // Ancho variable: estrechos rápidos y ensanches remansados.
      const width = channelWidth * (0.72 + fbm(noise, z * 0.006 + 31, 7.3, 3, 0.5) * 0.7);
      const t = Math.abs(offset) / width;

      if (t < 1) {
        // El signo de la pendiente dice hacia qué lado empuja la corriente.
        const outer = clamp(offset * slope * 0.09, -0.45, 0.45);
        const profile = Math.pow(1 - t * t, 0.9) * (1 + outer);
        // Pozas y tablas: el fondo sube y baja a lo largo del cauce.
        const pools = (fbm(noise, z * 0.012 + 3, x * 0.01, 3, 0.55) - 0.45) * maxDepth * 0.75;
        return -maxDepth * profile + pools + detail * 0.3;
      }
      const rise = t - 1;
      return smoothstep(0, 0.08, rise) * 1.1
        + smoothstep(0.05, 0.7, rise) * 6.5
        + fbm(noise, x * 0.0068 + 9, z * 0.0068 + 2, 5, 0.5) * hillHeight * smoothstep(0.2, 1.6, rise)
        + detail;
    },

    /**
     * Lámina ancha y somera con islotes de juncal. Casi todo cubre por la
     * rodilla; lo interesante son los canales entre islas.
     */
    marisma(x, z, detail) {
      const dist = Math.hypot(x, z);
      const t = dist / (shoreRadius(Math.atan2(z, x)) * 1.06);
      // Islotes: manchas de ruido que asoman por encima del agua.
      const isles = fbm(noise, x * 0.019 + 17, z * 0.019 + 17, 4, 0.55);
      const isleHeight = Math.pow(clamp((isles - 0.53) * 3.4, 0, 1), 1.35) * 2.2;
      if (t < 1) {
        const basin = Math.pow(1 - t * t, 0.55);
        // Canales: vetas hondas que cruzan la marisma.
        const veins = Math.pow(1 - Math.abs(fbm(noise, x * 0.0085, z * 0.0085, 3, 0.5) - 0.5) * 2, 7);
        const bed = -maxDepth * basin * (0.42 + veins * 0.85);
        return bed + isleHeight + detail * 0.4;
      }
      const rise = t - 1;
      return smoothstep(0, 0.06, rise) * 0.7
        + smoothstep(0.04, 0.5, rise) * 3.2
        + fbm(noise, x * 0.009 + 4, z * 0.009 + 8, 5, 0.5) * hillHeight * smoothstep(0.15, 1.2, rise)
        + isleHeight * 0.4 + detail;
    },

    /**
     * Cañón: agua muy honda entre paredes casi verticales. La escala se lee
     * mirando hacia arriba, no hacia los lados.
     */
    garganta(x, z, detail) {
      const center = channelCenter(z) * 0.55;
      const offset = x - center;
      const width = channelWidth * (0.85 + fbm(noise, z * 0.009 + 5, 2.2, 3, 0.5) * 0.4);
      const t = Math.abs(offset) / width;
      if (t < 1) {
        // Fondo casi plano, paredes que caen a plomo.
        const floor = Math.pow(1 - Math.pow(t, 5), 0.55);
        const rubble = (fbm(noise, x * 0.03, z * 0.02, 3, 0.5) - 0.5) * maxDepth * 0.2;
        return -maxDepth * floor + rubble + detail * 0.25;
      }
      const rise = t - 1;
      // Repisas escalonadas: la pared no es una rampa lisa.
      const ledges = Math.sin(rise * 9 + fbm(noise, x * 0.02, z * 0.02, 2, 0.5) * 4) * 1.6;
      return smoothstep(0, 0.03, rise) * 2.5
        + Math.pow(smoothstep(0.0, 0.9, rise), 0.65) * hillHeight
        + ledges * smoothstep(0.05, 0.35, rise)
        + detail * 1.4;
    }
  };

  const shapeFn = SHAPES[shape] || SHAPES.lago;

  function sample(x, z) {
    const detail = (fbm(noise, x * 0.055, z * 0.055, 3, 0.5) - 0.5) * 0.9;
    return shapeFn(x, z, detail);
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

  /**
   * Corriente en un punto, en m/s. Sólo el río la tiene: sigue el eje del
   * cauce, es más viva en el centro y en los estrechos, y se para en la orilla.
   * Devuelve `out` para no crear vectores en el bucle de simulación.
   */
  const flowSpeed = shape === 'rio' ? 1 : 0;
  function flowAt(x, z, out = { x: 0, z: 0 }) {
    out.x = 0; out.z = 0;
    if (!flowSpeed) return out;
    const center = channelCenter(z);
    const width = channelWidth * (0.72 + fbm(noise, z * 0.006 + 31, 7.3, 3, 0.5) * 0.7);
    const t = Math.abs(x - center) / width;
    if (t >= 1) return out;
    const depth = depthAt(x, z);
    if (depth < 0.15) return out;
    // Más rápido en el centro y donde el cauce se estrecha; las pozas hondas
    // van más lentas, que es lo que las hace buenas para pescar.
    const across = Math.pow(1 - t * t, 0.7);
    const narrow = clamp(channelWidth / width, 0.6, 1.6);
    const strength = 1.5 * across * narrow / (1 + depth * 0.10);
    const slope = channelSlope(z);
    const len = Math.hypot(slope, 1);
    out.x = (slope / len) * strength;
    out.z = (1 / len) * strength;      // el río corre hacia +Z
    return out;
  }

  return {
    heights, resolution, size, step, half, shape,
    lakeRadius, maxDepth, waterLevel: WATER_LEVEL, hasCurrent: flowSpeed > 0,
    heightAt, slopeAt, depthAt, isSubmerged, shoreRadius, flowAt, channelCenter
  };
}
