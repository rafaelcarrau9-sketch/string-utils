/**
 * Calidad gráfica. Cada preset se traduce en decisiones concretas que los
 * sistemas leen al construirse (resolución de sombras, densidad de hierba,
 * tamaño del render target del reflejo del agua...).
 */

export const QUALITY_PRESETS = {
  bajo: {
    label: 'Bajo',
    pixelRatio: 0.75,
    shadows: false,
    shadowMapSize: 1024,
    waterReflection: 256,
    grassDensity: 0.25,
    viewDistance: 220,
    rainParticles: 1500,
    antialias: false
  },
  medio: {
    label: 'Medio',
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 2048,
    waterReflection: 512,
    grassDensity: 0.6,
    viewDistance: 320,
    rainParticles: 4000,
    antialias: true
  },
  alto: {
    label: 'Alto',
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 4096,
    waterReflection: 1024,
    grassDensity: 1,
    viewDistance: 450,
    rainParticles: 9000,
    antialias: true
  }
};

export const DEFAULT_SETTINGS = {
  quality: 'medio',
  fov: 70,
  sensitivity: 1,
  invertY: false,
  masterVolume: 0.8,
  showFps: false
};

export function presetFor(settings) {
  return QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.medio;
}
