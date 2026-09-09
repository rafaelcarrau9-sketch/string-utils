/**
 * Zonas de pesca de la Cuenca de Valdés.
 *
 * Cada zona es un juego de parámetros: forma del agua, relieve, paleta,
 * especies presentes, ambiente y cómo se desbloquea. El mundo entero se
 * construye a partir de estos datos, así que añadir un mapa nuevo no toca ni
 * el motor ni la interfaz.
 *
 * `unlock` describe la puerta de entrada:
 *   { free: true }            se entra desde el principio
 *   { price, level }          hay que pagar el permiso y tener nivel
 *   { quest }                 la abre la historia, no el dinero
 */

export const ZONES = [
  {
    id: 'lago_niebla',
    name: 'Lago de la Niebla',
    short: 'El lago',
    description: 'Aguas mansas rodeadas de arboleda. Aquí tenía su cabaña la abuela.',
    unlock: { free: true },
    price: 0,
    terrain: { shape: 'lago', seed: 20260908, lakeRadius: 118, maxDepth: 9.5, hillHeight: 26,
      bedShallow: 0x7d7150, bedDeep: 0x3a3524 },
    species: ['perca_negra', 'trucha_arcoiris', 'carpa_comun', 'lucio', 'siluro', 'tenca', 'anguila'],
    vegetation: { grass: 1, trees: 420, conifer: 0.38 },
    palette: { grass: 0x53703a, water: 0x0d2630 },
    lighting: { ambient: 1, hemi: 1, sun: 1 },
    weather: 'despejado',
    startHour: 9.4,
    ambientNote: 'El agua huele a barro tibio y a juncos.'
  },
  {
    id: 'rio_trenzado',
    name: 'Río Trenzado',
    short: 'El río',
    description: 'Corriente viva entre gravas. El pez está donde el agua se remansa.',
    unlock: { price: 450, level: 2 },
    price: 450,
    terrain: { shape: 'rio', seed: 553021, lakeRadius: 150, maxDepth: 6.8, hillHeight: 30, channelWidth: 36, meander: 48,
      bedShallow: 0x9c9377, bedDeep: 0x55583f },   // grava clara
    species: ['barbo', 'trucha_comun', 'trucha_arcoiris', 'salmon', 'perca_negra', 'anguila'],
    vegetation: { grass: 0.9, trees: 470, conifer: 0.5 },
    palette: { grass: 0x50713c, water: 0x1d3b30 },
    lighting: { ambient: 1.05, hemi: 1.0, sun: 1.0 },
    weather: 'despejado',
    startHour: 8.1,
    ambientNote: 'El rumor del agua tapa cualquier otro ruido.'
  },
  {
    id: 'marisma_argan',
    name: 'Marisma de Argán',
    short: 'La marisma',
    description: 'Lámina somera sembrada de islotes. Cubre poco y esconde mucho.',
    unlock: { price: 1200, level: 4 },
    price: 1200,
    terrain: { shape: 'marisma', seed: 128877, lakeRadius: 152, maxDepth: 3.6, hillHeight: 16,
      bedShallow: 0x6a6a41, bedDeep: 0x333a24 },   // fango con vegetación
    species: ['tenca', 'anguila', 'lucio', 'carpa_comun', 'carpa_espejo', 'perca_negra'],
    vegetation: { grass: 1.25, trees: 300, conifer: 0.12 },
    palette: { grass: 0x4d6b33, water: 0x22301d },
    lighting: { ambient: 1.1, hemi: 1.15, sun: 0.95 },
    weather: 'niebla',
    startHour: 6.4,
    ambientNote: 'Niebla baja, ranas y un olor a agua parada.'
  },
  {
    id: 'embalse_alto',
    name: 'Embalse Alto',
    short: 'El embalse',
    description: 'Agua fría y honda entre coníferas. Menos peces, pero más grandes.',
    unlock: { price: 2600, level: 6 },
    price: 2600,
    terrain: { shape: 'lago', seed: 771145, lakeRadius: 146, maxDepth: 17, hillHeight: 44,
      bedShallow: 0x6e6f63, bedDeep: 0x24291f },   // roca sumergida
    species: ['trucha_arcoiris', 'trucha_comun', 'trucha_lacustre', 'lucio', 'lucioperca', 'siluro'],
    vegetation: { grass: 0.7, trees: 520, conifer: 0.82 },
    palette: { grass: 0x46613a, water: 0x0d2733 },
    lighting: { ambient: 1.0, hemi: 1.05, sun: 1.0 },
    weather: 'nubes',
    startHour: 7.2,
    ambientNote: 'El viento baja de la sierra y riza el agua sin descanso.'
  },
  {
    id: 'garganta',
    name: 'La Garganta',
    short: 'La garganta',
    description: 'Un tajo de roca donde el agua no ve el sol. Lo último que anotó Remedios.',
    unlock: { quest: 'cap5_garganta' },
    price: 0,
    terrain: { shape: 'garganta', seed: 990413, lakeRadius: 112, maxDepth: 24, hillHeight: 62, channelWidth: 27, meander: 30,
      bedShallow: 0x60625c, bedDeep: 0x14170f },   // pizarra
    species: ['lucioperca', 'siluro', 'trucha_lacustre', 'esturion', 'anguila', 'sombra_valdes'],
    vegetation: { grass: 0.35, trees: 260, conifer: 0.9 },
    palette: { grass: 0x3d5236, water: 0x11303a },
    // Las paredes tapan el cielo: sin este empujón la garganta es una foto en negro.
    lighting: { ambient: 2.6, hemi: 2.2, sun: 1.35, exposure: 1.35 },
    weather: 'nubes',
    startHour: 5.6,
    ambientNote: 'Aquí abajo el eco devuelve tu propia respiración.'
  }
];

export const ZONES_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export function zoneOf(id) {
  return ZONES_BY_ID[id] || ZONES[0];
}

/**
 * Por qué no se puede entrar todavía, o `null` si se puede.
 * `progress` es el objeto de progresión (nivel, dinero) y `quests` el diario.
 */
export function lockReason(zone, progress, quests) {
  if (zone.unlock.free) return null;
  if (zone.unlock.quest) {
    return quests?.isUnlocked?.(zone.unlock.quest)
      ? null
      : 'Aún no sabes cómo se llega hasta ahí';
  }
  if (zone.unlock.level && progress.level < zone.unlock.level) {
    return `Necesitas nivel ${zone.unlock.level}`;
  }
  return null;
}
