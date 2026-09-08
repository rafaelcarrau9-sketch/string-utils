/**
 * Zonas de pesca.
 *
 * Cada zona es un juego de parámetros: forma del lago, paleta, especies
 * presentes y precio de acceso. El mundo entero se construye a partir de
 * estos datos, así que añadir una zona nueva no toca ni el motor ni la UI.
 */

export const ZONES = [
  {
    id: 'lago_niebla',
    name: 'Lago de la Niebla',
    description: 'Aguas mansas rodeadas de arboleda. El sitio donde se aprende.',
    price: 0,
    terrain: { seed: 20260908, lakeRadius: 118, maxDepth: 9.5, hillHeight: 26 },
    species: ['perca_negra', 'trucha_arcoiris', 'carpa_comun', 'lucio', 'siluro', 'tenca'],
    vegetation: { grass: 1, trees: 420, conifer: 0.38 },
    palette: { grass: 0x53703a, water: 0x0d2630 },
    weather: 'despejado',
    startHour: 9.4
  },
  {
    id: 'embalse_alto',
    name: 'Embalse Alto',
    description: 'Agua fría y honda entre coníferas. Menos peces, pero más grandes.',
    price: 2500,
    terrain: { seed: 771145, lakeRadius: 146, maxDepth: 16, hillHeight: 44 },
    species: ['trucha_arcoiris', 'trucha_comun', 'lucio', 'lucioperca', 'siluro'],
    vegetation: { grass: 0.7, trees: 520, conifer: 0.82 },
    palette: { grass: 0x46613a, water: 0x0a2028 },
    weather: 'nubes',
    startHour: 7.2
  }
];

export const ZONES_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export function zoneOf(id) {
  return ZONES_BY_ID[id] || ZONES[0];
}
