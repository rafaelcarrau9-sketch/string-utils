/**
 * Catálogo de especies.
 *
 * Todo lo que distingue a un pez de otro vive aquí como datos: tamaño, fuerza,
 * hábitat, horario, señuelos preferidos y carácter de pelea. Añadir una
 * especie nueva no requiere tocar ni el motor ni la IA.
 *
 * - `depth`: franja de profundidad preferida en metros.
 * - `activity`: multiplicador por franja horaria (madrugada, mañana, tarde, noche).
 * - `lures`: afinidad por tipo de señuelo (1 = indiferente).
 * - `fight`: cómo se comporta al estar enganchado.
 */

export const SPECIES = [
  {
    id: 'perca_negra',
    name: 'Perca negra',
    latin: 'Micropterus salmoides',
    rarity: 'comun',
    lengthRange: [24, 58],          // cm
    weightPerLength: 0.000018,       // kg = k * cm^3
    depth: [0.8, 4.5],
    prefersCover: true,              // junto a juncos y estructura
    activity: { madrugada: 0.7, manana: 1.25, tarde: 1.15, noche: 0.5 },
    lures: { cucharilla: 1.35, vinilo: 1.5, popper: 1.4, cucharilla_pesada: 0.8, ninfa: 0.7, boilie: 0.5 },
    color: 0x3f5a33,
    belly: 0.82,
    speed: 3.4,
    stamina: 1.1,
    strength: 1.15,
    fight: { runs: 3, jumpChance: 0.45, headshake: 1.3 },
    price: 14
  },
  {
    id: 'trucha_arcoiris',
    name: 'Trucha arcoíris',
    latin: 'Oncorhynchus mykiss',
    rarity: 'comun',
    lengthRange: [22, 52],
    weightPerLength: 0.0000135,
    depth: [1.5, 6],
    prefersCover: false,
    activity: { madrugada: 1.3, manana: 1.2, tarde: 0.9, noche: 0.55 },
    lures: { cucharilla: 1.5, ninfa: 1.6, vinilo: 0.9, popper: 0.7, cucharilla_pesada: 1.0, boilie: 0.4 },
    color: 0x6b7d86,
    belly: 0.95,
    speed: 4.6,
    stamina: 1.25,
    strength: 0.95,
    fight: { runs: 4, jumpChance: 0.6, headshake: 1.0 },
    price: 18
  },
  {
    id: 'carpa_comun',
    name: 'Carpa común',
    latin: 'Cyprinus carpio',
    rarity: 'comun',
    lengthRange: [35, 92],
    weightPerLength: 0.000027,
    depth: [1.0, 5.0],
    prefersCover: true,
    activity: { madrugada: 1.1, manana: 1.0, tarde: 1.15, noche: 0.85 },
    lures: { boilie: 1.9, ninfa: 1.1, vinilo: 0.6, cucharilla: 0.4, popper: 0.3, cucharilla_pesada: 0.5 },
    color: 0x8a6f38,
    belly: 0.9,
    speed: 2.6,
    stamina: 1.7,
    strength: 1.45,
    fight: { runs: 5, jumpChance: 0.05, headshake: 0.5 },
    price: 12
  },
  {
    id: 'lucio',
    name: 'Lucio',
    latin: 'Esox lucius',
    rarity: 'raro',
    lengthRange: [45, 118],
    weightPerLength: 0.0000098,
    depth: [1.2, 5.5],
    prefersCover: true,
    activity: { madrugada: 1.2, manana: 1.1, tarde: 1.25, noche: 0.6 },
    lures: { cucharilla_pesada: 1.8, vinilo: 1.6, cucharilla: 1.2, popper: 1.1, ninfa: 0.4, boilie: 0.2 },
    color: 0x4a5c30,
    belly: 0.88,
    speed: 5.2,
    stamina: 1.35,
    strength: 1.7,
    fight: { runs: 4, jumpChance: 0.3, headshake: 1.8 },
    price: 34
  },
  {
    id: 'siluro',
    name: 'Siluro',
    latin: 'Silurus glanis',
    rarity: 'raro',
    lengthRange: [70, 205],
    weightPerLength: 0.0000073,
    depth: [4.5, 9.5],
    prefersCover: false,
    activity: { madrugada: 1.3, manana: 0.6, tarde: 0.8, noche: 1.8 },
    lures: { vinilo: 1.5, boilie: 1.4, cucharilla_pesada: 1.3, cucharilla: 0.6, ninfa: 0.4, popper: 0.3 },
    color: 0x3a3529,
    belly: 0.78,
    speed: 3.0,
    stamina: 2.4,
    strength: 2.6,
    fight: { runs: 6, jumpChance: 0.02, headshake: 0.8 },
    price: 46
  },
  {
    id: 'tenca',
    name: 'Tenca',
    latin: 'Tinca tinca',
    rarity: 'comun',
    lengthRange: [20, 46],
    weightPerLength: 0.000024,
    depth: [0.5, 2.5],
    prefersCover: true,
    activity: { madrugada: 1.2, manana: 1.0, tarde: 1.0, noche: 0.7 },
    lures: { boilie: 1.6, ninfa: 1.4, vinilo: 0.7, cucharilla: 0.35, popper: 0.25, cucharilla_pesada: 0.3 },
    color: 0x3f4a26,
    belly: 0.86,
    speed: 2.4,
    stamina: 1.2,
    strength: 1.0,
    fight: { runs: 3, jumpChance: 0.03, headshake: 0.6 },
    price: 11
  },
  {
    id: 'trucha_comun',
    name: 'Trucha común',
    latin: 'Salmo trutta',
    rarity: 'comun',
    lengthRange: [26, 68],
    weightPerLength: 0.0000142,
    depth: [2.5, 9],
    prefersCover: false,
    activity: { madrugada: 1.35, manana: 1.15, tarde: 0.85, noche: 0.6 },
    lures: { cucharilla: 1.5, ninfa: 1.55, vinilo: 1.1, cucharilla_pesada: 1.2, popper: 0.6, boilie: 0.35 },
    color: 0x7a6a4a,
    belly: 0.92,
    speed: 4.4,
    stamina: 1.4,
    strength: 1.2,
    fight: { runs: 4, jumpChance: 0.5, headshake: 1.1 },
    price: 26
  },
  {
    id: 'lucioperca',
    name: 'Lucioperca',
    latin: 'Sander lucioperca',
    rarity: 'raro',
    lengthRange: [38, 96],
    weightPerLength: 0.0000112,
    depth: [5, 14],
    prefersCover: true,
    activity: { madrugada: 1.5, manana: 0.8, tarde: 0.9, noche: 1.6 },
    lures: { vinilo: 1.9, cucharilla_pesada: 1.5, cucharilla: 0.9, ninfa: 0.5, popper: 0.4, boilie: 0.3 },
    color: 0x6b6440,
    belly: 0.9,
    speed: 4.0,
    stamina: 1.5,
    strength: 1.5,
    fight: { runs: 5, jumpChance: 0.12, headshake: 1.5 },
    price: 42
  }
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Franja horaria para las tablas de actividad. */
export function timeBand(hour) {
  if (hour < 6) return 'madrugada';
  if (hour < 12) return 'manana';
  if (hour < 20) return 'tarde';
  return 'noche';
}

/** Peso realista a partir de la longitud (relación cúbica típica). */
export function weightFor(species, lengthCm) {
  return species.weightPerLength * Math.pow(lengthCm, 3);
}

export function valueFor(species, weightKg) {
  return Math.max(1, Math.round(species.price * weightKg * 1.6));
}
