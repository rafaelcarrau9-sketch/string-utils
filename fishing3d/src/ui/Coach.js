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
    id: 'bombeo',
    when: (s) => s.canPump,
    text: 'La caña está cargada: <b>suelta el clic derecho</b>. Al enderezarse te devuelve hilo gratis, sin pelear contra el freno. Cargar y soltar —bombear— cansa al pez mucho antes que dar manivela sin parar.'
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
    id: 'bajio',
    when: (s) => s.lureDepth !== null && s.lureDepth < 1 && s.fishingState === 'fishing',
    text: 'Tu señuelo está en medio metro de agua: ahí no hay nada. Camina hasta la punta del muelle o busca calado antes de lanzar.'
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
    when: (s) => s.money >= 600 && s.level >= 2,
    text: 'Con Z abres el mapa de la cuenca: allí se compran los permisos de las otras aguas.'
  },
  {
    id: 'personajes',
    when: (s) => s.nearNpc,
    text: 'Hay alguien delante. Pulsa E para hablar: la gente da encargos, compra pescado y cuenta cosas.'
  },
  {
    id: 'diario',
    when: (s) => s.questsActive >= 1,
    text: 'Con J abres el diario: qué llevas entre manos, qué falta y quién te lo pidió.'
  },
  {
    id: 'enciclopedia',
    when: (s) => s.discovered >= 3,
    text: 'Con C abres la enciclopedia. Cada especie que cobras abre su ficha: dónde vive, a qué hora y con qué señuelo.'
  },
  {
    id: 'corriente',
    when: (s) => s.hasCurrent && s.fishingState === 'fishing',
    text: 'Aquí hay corriente: el señuelo baja solo. Lanza aguas arriba y déjalo trabajar hacia ti.'
  },
  {
    id: 'anzuelo',
    when: (s) => s.lastEvent === 'hookPull',
    text: 'El anzuelo se ha abierto: ese pez es demasiado para tu aparejo. Caña más fuerte, freno mayor y un señuelo más grande.'
  },
  {
    id: 'suceso',
    when: (s) => s.worldEvent,
    text: 'Algo está pasando en el agua. Estos ratos duran poco y cambian mucho lo que pica: aprovéchalos.'
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
