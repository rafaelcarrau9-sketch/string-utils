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
    schooling: true,          // anda en grupo
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
    schooling: true,          // anda en grupo
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
    schooling: true,          // anda en grupo
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
    schooling: true,          // anda en grupo
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
    id: 'barbo',
    schooling: true,          // anda en grupo
    name: 'Barbo de río',
    latin: 'Barbus barbus',
    rarity: 'comun',
    lengthRange: [28, 84],
    weightPerLength: 0.0000165,
    depth: [1.0, 4.0],
    prefersCover: false,
    prefersCurrent: true,
    activity: { madrugada: 1.1, manana: 1.2, tarde: 1.2, noche: 0.6 },
    lures: { ninfa: 1.5, boilie: 1.4, vinilo: 0.9, cucharilla: 0.7, cucharilla_pesada: 0.8, popper: 0.3 },
    color: 0x9a8552,
    belly: 0.9,
    speed: 3.6,
    stamina: 1.6,
    strength: 1.4,
    fight: { runs: 5, jumpChance: 0.04, headshake: 0.7 },
    price: 20
  },
  {
    id: 'salmon',
    schooling: true,          // anda en grupo
    name: 'Salmón atlántico',
    latin: 'Salmo salar',
    rarity: 'raro',
    lengthRange: [55, 132],
    weightPerLength: 0.0000112,
    depth: [1.5, 6.5],
    prefersCover: false,
    prefersCurrent: true,
    activity: { madrugada: 1.5, manana: 1.2, tarde: 0.8, noche: 0.5 },
    lures: { cucharilla: 1.7, ninfa: 1.5, vinilo: 1.2, cucharilla_pesada: 1.1, popper: 0.5, boilie: 0.2 },
    color: 0x94a2ac,
    belly: 0.97,
    speed: 6.2,
    stamina: 1.9,
    strength: 1.9,
    fight: { runs: 6, jumpChance: 0.75, headshake: 1.2 },
    price: 62
  },
  {
    id: 'anguila',
    name: 'Anguila',
    latin: 'Anguilla anguilla',
    rarity: 'comun',
    lengthRange: [35, 118],
    weightPerLength: 0.0000021,
    depth: [0.4, 3.0],
    prefersCover: true,
    activity: { madrugada: 1.2, manana: 0.4, tarde: 0.5, noche: 2.1 },
    lures: { boilie: 1.7, vinilo: 1.3, ninfa: 1.1, cucharilla: 0.4, cucharilla_pesada: 0.5, popper: 0.15 },
    color: 0x35392c,
    belly: 0.72,
    speed: 2.8,
    stamina: 2.0,
    strength: 1.25,
    fight: { runs: 4, jumpChance: 0.0, headshake: 2.4 },
    price: 30
  },
  {
    id: 'carpa_espejo',
    name: 'Carpa espejo',
    latin: 'Cyprinus carpio var.',
    rarity: 'raro',
    lengthRange: [48, 104],
    weightPerLength: 0.0000305,
    depth: [1.2, 4.5],
    prefersCover: true,
    activity: { madrugada: 1.25, manana: 0.95, tarde: 1.1, noche: 1.0 },
    lures: { boilie: 2.1, ninfa: 1.15, vinilo: 0.5, cucharilla: 0.3, popper: 0.2, cucharilla_pesada: 0.4 },
    color: 0xa8894a,
    belly: 0.93,
    speed: 2.9,
    stamina: 2.1,
    strength: 1.75,
    fight: { runs: 6, jumpChance: 0.04, headshake: 0.45 },
    price: 55
  },
  {
    id: 'trucha_lacustre',
    name: 'Trucha lacustre',
    latin: 'Salvelinus namaycush',
    rarity: 'raro',
    lengthRange: [45, 108],
    weightPerLength: 0.0000131,
    depth: [8, 20],
    prefersCover: false,
    activity: { madrugada: 1.4, manana: 1.0, tarde: 0.9, noche: 1.1 },
    lures: { cucharilla_pesada: 1.9, vinilo: 1.4, cucharilla: 1.0, ninfa: 0.6, boilie: 0.3, popper: 0.15 },
    color: 0x5d6b62,
    belly: 0.9,
    speed: 4.8,
    stamina: 1.8,
    strength: 1.8,
    fight: { runs: 5, jumpChance: 0.25, headshake: 1.1 },
    price: 70
  },
  {
    id: 'esturion',
    name: 'Esturión del cañón',
    latin: 'Acipenser sturio',
    rarity: 'legendario',
    lengthRange: [110, 260],
    weightPerLength: 0.0000062,
    depth: [12, 24],
    prefersCover: false,
    activity: { madrugada: 1.4, manana: 0.6, tarde: 0.7, noche: 1.7 },
    lures: { boilie: 1.8, vinilo: 1.3, cucharilla_pesada: 1.2, cucharilla: 0.3, ninfa: 0.4, popper: 0.1 },
    color: 0x4c5148,
    belly: 0.8,
    speed: 3.4,
    stamina: 3.0,
    strength: 3.2,
    fight: { runs: 7, jumpChance: 0.02, headshake: 0.6 },
    price: 90
  },
  {
    id: 'sombra_valdes',
    gated: true,               // no existe hasta que la historia la nombra
    name: 'Sombra de Valdés',
    latin: 'Silurus umbra (sin describir)',
    rarity: 'legendario',
    lengthRange: [190, 268],
    weightPerLength: 0.0000079,
    depth: [14, 24],
    prefersCover: false,
    activity: { madrugada: 1.2, manana: 0.2, tarde: 0.3, noche: 2.4 },
    lures: { vinilo: 1.6, boilie: 1.5, cucharilla_pesada: 1.4, cucharilla: 0.3, ninfa: 0.2, popper: 0.1 },
    color: 0x24261f,
    belly: 0.7,
    speed: 4.2,
    stamina: 2.9,
    strength: 3.9,
    fight: { runs: 8, jumpChance: 0.08, headshake: 1.4 },
    price: 150
  },
  {
    id: 'trucha_comun',
    schooling: true,          // anda en grupo
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

/**
 * Lo que paga un ejemplar.
 *
 * Sublineal en el peso, como el precio real del pescado: un ejemplar del doble
 * de kilos no vale el doble. Con la relación lineal anterior, un pez de ciento
 * cuarenta kilos pagaba noventa mil monedas —veinte veces el equipo más caro
 * del juego— y la economía se venía abajo con una sola captura.
 */
export function valueFor(species, weightKg) {
  return Math.max(1, Math.round(species.price * Math.pow(Math.max(0.05, weightKg), 0.72) * 1.9));
}

/** Cuántos puntos de experiencia da cobrar un ejemplar. */
const XP_BY_RARITY = { comun: 8, raro: 22, legendario: 90 };
export function xpFor(species, trophy = 0) {
  return Math.round((XP_BY_RARITY[species.rarity] ?? 8) * (1 + trophy * 1.1));
}

export const RARITY_LABEL = { comun: 'Común', raro: 'Raro', legendario: 'Legendario' };
