/**
 * Catálogo de equipo. Datos puros: la caña, el carrete, la línea y el señuelo
 * son cuatro ejes independientes y sus estadísticas se combinan en
 * `Equipment.stats`.
 *
 * Cañas      → potencia (lanzamiento), resistencia (tensión que aguanta), sensibilidad (aviso de picada).
 * Carretes   → capacidad de línea, velocidad de recogida, freno máximo.
 * Líneas     → resistencia en kg, diámetro (más fino = más lejos, menos aguante), elasticidad (amortigua tirones).
 * Señuelos   → peso (distancia), profundidad de trabajo, acción y atractivo.
 *
 * `rig` distingue dos formas de pescar: 'senuelo' hay que trabajarlo
 * recogiendo, y 'flotador' se deja quieto con el cebo suspendido — el aviso
 * es la boya hundiéndose.
 */

export const RODS = [
  { id: 'cana_iniciacion', name: 'Caña de iniciación', power: 1.0, length: 1.98, strength: 5.5, sensitivity: 0.55, price: 0,
    description: 'Fibra de vidrio pesada. Cumple, sin más.' },
  { id: 'cana_ligera', name: 'Caña ligera de lago', power: 1.25, length: 2.13, strength: 7.0, sensitivity: 0.78, price: 320,
    description: 'Puntera sensible: notas la picada mucho antes.' },
  { id: 'cana_carbono', name: 'Caña de carbono', power: 1.5, length: 2.44, strength: 9.5, sensitivity: 0.9, price: 1400,
    description: 'Ligera y con reserva de potencia para peces grandes.' },
  { id: 'cana_pesada', name: 'Caña de acción pesada', power: 1.78, length: 2.7, strength: 14, sensitivity: 0.82, price: 4200,
    description: 'Para siluros y lucios de talla. Poco fina, mucha fuerza.' }
];

export const REELS = [
  { id: 'carrete_basico', name: 'Carrete básico', capacity: 90, retrieve: 0.62, maxDrag: 3.0, durability: 0.6, price: 0,
    description: 'Recuperación lenta y freno justo.' },
  { id: 'carrete_medio', name: 'Carrete de aluminio', capacity: 140, retrieve: 0.85, maxDrag: 5.5, durability: 0.8, price: 380,
    description: 'Freno progresivo y recogida decente.' },
  { id: 'carrete_avanzado', name: 'Carrete de competición', capacity: 200, retrieve: 1.1, maxDrag: 9.0, durability: 0.95, price: 1800,
    description: 'Freno fino y mucha recogida por vuelta.' },
  { id: 'carrete_pesado', name: 'Carrete de gran pez', capacity: 300, retrieve: 0.95, maxDrag: 15, durability: 1.0, price: 5200,
    description: 'Pensado para frenar carreras largas sin fundirse.' }
];

export const LINES = [
  { id: 'nylon_022', name: 'Nailon 0,22 mm', strength: 4.0, diameter: 0.22, elasticity: 0.85, price: 0,
    description: 'Elástico y perdonavidas, pero se rompe pronto.' },
  { id: 'nylon_028', name: 'Nailon 0,28 mm', strength: 6.5, diameter: 0.28, elasticity: 0.8, price: 140,
    description: 'Más aguante a cambio de algo de distancia.' },
  { id: 'fluoro_026', name: 'Fluorocarbono 0,26 mm', strength: 7.5, diameter: 0.26, elasticity: 0.5, price: 620,
    description: 'Casi invisible bajo el agua. Poco elástico: cuidado con los tirones.' },
  { id: 'trenzado_020', name: 'Trenzado 0,20 mm', strength: 13, diameter: 0.20, elasticity: 0.12, price: 1900,
    description: 'Sin elasticidad: transmite todo y aguanta mucho, pero no perdona un frenazo.' }
];

export const LURES = [
  { id: 'cucharilla', name: 'Cucharilla giratoria', rig: 'senuelo', weightG: 8, workingDepth: 1.6, action: 0.85, attraction: 1.0, price: 0,
    description: 'Vibración constante al recoger. Versátil.' },
  { id: 'vinilo', name: 'Vinilo con cabeza plomada', rig: 'senuelo', weightG: 14, workingDepth: 3.2, action: 0.7, attraction: 1.1, price: 90,
    description: 'Trabaja a media agua. Muy imitativo.' },
  { id: 'popper', name: 'Popper de superficie', rig: 'senuelo', weightG: 11, workingDepth: 0.3, action: 1.0, attraction: 0.95, price: 160,
    description: 'Chapotea en superficie. Espectacular al amanecer.' },
  { id: 'ninfa', name: 'Ninfa bajo flotador', rig: 'flotador', weightG: 4, workingDepth: 2.0, action: 0.45, attraction: 1.05, price: 120,
    description: 'Se deja quieta a media agua bajo la boya. Discreta y muy imitativa.' },
  { id: 'cucharilla_pesada', name: 'Cucharilla pesada', rig: 'senuelo', weightG: 24, workingDepth: 5.0, action: 0.8, attraction: 0.9, price: 340,
    description: 'Baja rápido: la herramienta para el fondo.' },
  { id: 'boilie', name: 'Boilie con flotador', rig: 'flotador', weightG: 18, workingDepth: 7.5, action: 0.1, attraction: 1.2, price: 210,
    description: 'Cebo quieto cerca del fondo. Paciencia, pero peces grandes.' }
];

/**
 * Embarcaciones.
 *
 * No son un adorno de progresión: cambian a dónde se puede llegar y cuándo.
 * `stability` es el oleaje que aguantan antes de tener que volver a resguardo;
 * `troll` permite avanzar con el sedal fuera, que es la única forma de peinar
 * una tabla de agua honda buscando peces grandes.
 */
export const BOATS = [
  { id: 'barca_remos', name: 'Barca de remos', speed: 3.6, turn: 1.15, stability: 0.45, troll: false, price: 0,
    description: 'La de siempre. Sirve para cruzar, no para faenar con mal tiempo.' },
  { id: 'barca_aluminio', name: 'Barca de aluminio', speed: 4.8, turn: 1.35, stability: 0.75, troll: false, price: 900,
    description: 'Más ligera y más seca. Aguanta oleaje que a la de madera la manda a puerto.' },
  { id: 'lancha_motor', name: 'Lancha con fueraborda', speed: 7.2, turn: 1.6, stability: 1.0, troll: true, price: 3800,
    description: 'Llega al otro extremo en un minuto y permite curricar: avanzar despacio con el señuelo fuera.' }
];

export const CATALOG = { rods: RODS, reels: REELS, lines: LINES, lures: LURES, boats: BOATS };

export const CATEGORY_LABELS = {
  rods: 'Cañas',
  reels: 'Carretes',
  lines: 'Líneas',
  lures: 'Señuelos',
  boats: 'Embarcaciones'
};

export function findItem(category, id) {
  return (CATALOG[category] || []).find((item) => item.id === id) || null;
}
