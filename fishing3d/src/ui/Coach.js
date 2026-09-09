/**
 * Avisos de aprendizaje.
 *
 * El juego tiene bastantes sistemas y ninguno se explica solo. Estos avisos
 * salen una única vez, en el momento en que hacen falta, y se recuerdan en la
 * partida guardada para no repetirse nunca más.
 *
 * Cada aviso es una condición sobre el estado del juego, no una secuencia
 * fija: si alguien engancha un pez antes de leer nada, el consejo de la pelea
 * le llega igual.
 */

const TIPS = [
  {
    id: 'picada',
    when: (s) => s.fishingState === 'bite',
    text: 'Clic izquierdo AHORA para clavar — la ventana es de poco más de un segundo.'
  },
  {
    id: 'pelea',
    when: (s) => s.fishingState === 'fighting',
    text: 'Recoge con clic derecho, pero suelta cuando la tensión suba. Ladea la caña a un costado del pez para cansarlo.'
  },
  {
    id: 'freno',
    when: (s) => s.lastEvent === 'lineBreak',
    text: 'La línea ha reventado: baja el freno con la rueda del ratón para que ceda hilo antes de romper.'
  },
  {
    id: 'holgura',
    when: (s) => s.lastEvent === 'fishLost',
    text: 'Se soltó el anzuelo: si dejas demasiada holgura, el pez se libera. Mantén algo de tensión.'
  },
  {
    id: 'vender',
    when: (s) => s.lastEvent === 'landed',
    text: 'Cobrado. Con B abres la tienda: mejores cañas llegan más lejos y mejores líneas aguantan más.'
  },
  {
    id: 'cebo',
    when: (s) => s.casts >= 4 && s.landed === 0,
    text: 'Prueba otro señuelo (Tab): cada especie tiene sus preferencias y su profundidad.'
  },
  {
    id: 'barca',
    when: (s) => s.nearBoat,
    text: 'Con E subes a la barca. Los peces de fondo, como el siluro, no pican desde la orilla.'
  },
  {
    id: 'zonas',
    when: (s) => s.money >= 2500,
    text: 'Ya te llega para otra zona de pesca: pulsa Z.'
  },
  {
    id: 'flotador',
    when: (s) => s.rig === 'flotador' && s.fishingState === 'fishing',
    text: 'Montaje de flotador: no hace falta recoger. Espera y vigila la boya — se hundirá al picar.'
  }
];

const DISPLAY_SECONDS = 7;

export class Coach {
  constructor(seen = []) {
    this.seen = new Set(seen);
    this.current = null;
    this.timer = 0;
    this.enabled = true;
  }

  /** Devuelve el texto de un aviso nuevo, o null. */
  check(state, dt) {
    if (this.current) {
      this.timer -= dt;
      if (this.timer <= 0) this.current = null;
      return null;
    }
    if (!this.enabled) return null;

    for (const tip of TIPS) {
      if (this.seen.has(tip.id)) continue;
      if (!tip.when(state)) continue;
      this.seen.add(tip.id);
      this.current = tip.text;
      this.timer = DISPLAY_SECONDS;
      return tip.text;
    }
    return null;
  }

  get text() { return this.current; }

  toJSON() { return [...this.seen]; }
}
