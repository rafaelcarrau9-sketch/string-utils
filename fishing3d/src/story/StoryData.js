/**
 * Campaña «El cuaderno de aguas».
 *
 * Todo el contenido narrativo vive aquí como datos puros: personajes, misiones,
 * objetivos, recompensas y diálogos. `QuestSystem` no sabe nada de esta
 * historia concreta — sólo interpreta estas estructuras—, así que ampliar la
 * campaña es escribir datos, no tocar código.
 *
 * Tipos de objetivo que entiende el sistema:
 *   catch      capturar una especie (species, minLength, minWeight, count, zone, night)
 *   catchAny   capturar peces cualesquiera (count, zone)
 *   discover   descubrir N especies distintas (count)
 *   visit      llegar a una zona (zone)
 *   talk       hablar con un personaje (npc)
 *   own        tener un objeto de equipo (category, item)
 *   level      alcanzar un nivel (value)
 *   money      llegar a una cantidad de dinero (value)
 *   deliver    entregar las páginas del cuaderno (count)
 */

export const NPCS = {
  tome: {
    id: 'tome',
    activity: 'vende',
    name: 'Tomé Roca',
    role: 'Embarcadero y tienda',
    zone: 'lago_niebla',
    anchor: 'muelle',
    palette: { coat: 0x6a4a30, trousers: 0x35322c, hat: 0x8f7a3f, skin: 0xc79b74 },
    shop: true,
    buysFish: true,
    greet: [
      'Tomé se limpia las manos en el mandil.',
      '—Así que tú eres quien ha heredado la cabaña de Remedios. Traes su misma cara de no saber por dónde empezar.',
      '—Yo compro lo que saques y vendo lo que necesites. Con eso ya tienes medio oficio.'
    ],
    idle: [
      '—Si el agua está plana, prueba a primera hora. Nunca falla.',
      '—Tu abuela vendía menos pescado que nadie y sabía más que todos. Piénsalo.',
      '—Los aparejos buenos no pescan solos, pero los malos sí que fallan solos.'
    ]
  },
  sabela: {
    id: 'sabela',
    activity: 'anota',
    name: 'Sabela Ferrer',
    role: 'Bióloga de la cuenca',
    zone: 'lago_niebla',
    anchor: 'campamento',
    palette: { coat: 0x2f5b63, trousers: 0x2b3138, hat: 0x9aa7ad, skin: 0xd9b48e },
    greet: [
      'Tiene la mesa llena de frascos y una libreta sujeta con una piedra.',
      '—Llevo dos años midiendo esta cuenca. Los peces se han movido y nadie me sabe decir por qué.',
      '—Si sacas algo, enséñamelo antes de venderlo. Un pez cuenta más de lo que parece.'
    ],
    idle: [
      '—El agua baja tres centímetros por semana. Eso no es sequía, eso es alguien abriendo una compuerta.',
      '—Cada especie tiene su franja de profundidad. Aprendértelas vale más que una caña cara.'
    ]
  },
  nuno: {
    id: 'nuno',
    activity: 'vigila',
    name: 'Nuno Aldaz',
    role: 'Guarda de la cuenca',
    zone: 'lago_niebla',
    anchor: 'cartel',
    palette: { coat: 0x3c4a2c, trousers: 0x2f3529, hat: 0x4a5535, skin: 0xb98b63 },
    sellsPermits: true,
    greet: [
      'Te mira el aparejo antes que la cara.',
      '—Guarda de la cuenca. Aquí se pesca con permiso, y el permiso lo doy yo.',
      '—El del lago lo tienes por ser de la familia. Los demás se pagan.'
    ],
    idle: [
      '—Yo no cierro tramos por gusto. Me los mandan cerrar.',
      '—Si ves la garganta desde el mirador, no vayas. No hay camino. Todavía.'
    ]
  },
  iria: {
    id: 'iria',
    activity: 'espera',
    name: 'Iria',
    role: 'Del pueblo de abajo',
    zone: 'rio_trenzado',
    anchor: 'campamento',
    palette: { coat: 0x8a4a52, trousers: 0x33384a, hat: 0xd9c07a, skin: 0xe0bb92 },
    greet: [
      'Está sentada en la grava con los pies en el agua.',
      '—¿Tú también buscas el pez ese que dicen? Mi abuelo dice que se lo inventó una señora.',
      '—Esa señora era tu abuela, ¿no? Pues yo sí me lo creo.'
    ],
    idle: [
      '—Si pisas fuerte se van todos. Lo sé porque a mí me pasa siempre.',
      '—Cuando llueve pican más. Eso lo sabe hasta mi gato.'
    ]
  },
  ovidio: {
    id: 'ovidio',
    activity: 'pesca',
    name: 'Ovidio Sanz',
    role: 'Vive en la marisma',
    zone: 'marisma_argan',
    anchor: 'campamento',
    palette: { coat: 0x4a4436, trousers: 0x3a3730, hat: 0x6d6047, skin: 0xb08758 },
    greet: [
      'No levanta la vista del sedal.',
      '—Cuarenta años aquí y sigo sin saber cuántos canales tiene esta marisma.',
      '—Tu abuela venía de noche. Nunca a pescar. Venía a mirar.'
    ],
    idle: [
      '—De noche la marisma es otra cosa. Y otra cosa es lo que pica.',
      '—Lo que buscas no está en la marisma. Pero la marisma te dirá por dónde.'
    ]
  },
  marga: {
    id: 'marga',
    activity: 'amarra',
    name: 'Marga Elizalde',
    role: 'Patrona del embalse',
    zone: 'embalse_alto',
    anchor: 'muelle',
    palette: { coat: 0x2c3f5e, trousers: 0x2a2f36, hat: 0xb8a06a, skin: 0xcf9f77 },
    greet: [
      'Ata un cabo sin mirarlo, de memoria.',
      '—Este embalse tiene diecisiete metros en el centro y una corriente de fondo que no sale en ningún mapa.',
      '—Si vas a pescar hondo, avísame antes. Prefiero saber dónde estás.'
    ],
    idle: [
      '—Bajo los diez metros el agua está a seis grados todo el año. Ahí abajo vive otra cosa.',
      '—La compuerta vieja da a la garganta. Hace años que nadie la abre.'
    ]
  }
};

export const NPC_LIST = Object.values(NPCS);

/** Capítulos: sólo agrupan misiones para el diario. */
export const CHAPTERS = [
  { id: 1, title: 'La cabaña', subtitle: 'Lago de la Niebla' },
  { id: 2, title: 'Aguas que corren', subtitle: 'Río Trenzado' },
  { id: 3, title: 'Lo que la niebla tapa', subtitle: 'Marisma de Argán' },
  { id: 4, title: 'El agua fría', subtitle: 'Embalse Alto' },
  { id: 5, title: 'La Garganta', subtitle: 'El final del cuaderno' }
];

export const QUESTS = [
  // ---------------------------------------------------------- capítulo 1
  {
    id: 'cap1_llegada',
    chapter: 1, type: 'historia',
    npc: 'tome', turnIn: 'tome',
    title: 'Preséntate en el embarcadero',
    summary: 'Tomé lleva el embarcadero y la tienda. Habla con él antes de nada.',
    objectives: [{ kind: 'talk', npc: 'tome', label: 'Hablar con Tomé Roca' }],
    reward: { money: 40, xp: 10 },
    complete: [
      '—Bien. Ya nos conocemos.',
      '—Con lo que llevas puedes sacar percas y poco más. Cuando quieras algo mejor, ya sabes dónde estoy.'
    ]
  },
  {
    id: 'cap1_primera',
    chapter: 1, type: 'historia',
    npc: 'tome', turnIn: 'tome',
    requires: ['cap1_llegada'],
    title: 'Tres para empezar',
    summary: 'Saca tres peces del lago. Cualesquiera: lo que importa es coger el gesto.',
    objectives: [{ kind: 'catchAny', count: 3, zone: 'lago_niebla', label: 'Peces cobrados en el lago' }],
    reward: { money: 120, xp: 30, item: { category: 'lures', id: 'vinilo' } },
    complete: [
      '—Tres. No está mal para el primer día.',
      'Te tiende un vinilo con cabeza plomada, todavía en su bolsa.',
      '—Toma. Trabaja a media agua. Vas a necesitarlo antes de lo que crees.'
    ]
  },
  {
    id: 'cap1_cuaderno',
    chapter: 1, type: 'historia',
    npc: 'sabela', turnIn: 'sabela',
    requires: ['cap1_primera'],
    title: 'Una muestra para Sabela',
    summary: 'Sabela necesita una perca negra de al menos 40 cm para medirla.',
    objectives: [{ kind: 'catch', species: 'perca_negra', minLength: 40, count: 1, label: 'Perca negra de 40 cm o más' }],
    reward: { money: 160, xp: 45, page: 1 },
    complete: [
      'Mide el pez, apunta, y se queda mirando la libreta más tiempo del necesario.',
      '—Esta letra. Esta letra la conozco.',
      'Saca una hoja suelta, arrugada, de dentro de su cuaderno de campo.',
      '—Estaba entre mis papeles y nunca supe de quién era. Ahora sí: es de Remedios Valdés. Y le falta el resto.',
      '«Página 1 · La cuenca no es cinco aguas distintas. Es una sola que respira por cinco sitios.»'
    ]
  },
  {
    id: 'cap1_permiso',
    chapter: 1, type: 'historia',
    npc: 'nuno', turnIn: 'nuno',
    requires: ['cap1_cuaderno'],
    title: 'El permiso del río',
    summary: 'Nuno vende los permisos. Para el río pide nivel 2 y 450 monedas.',
    objectives: [{ kind: 'visit', zone: 'rio_trenzado', label: 'Llegar al Río Trenzado' }],
    reward: { xp: 40 },
    hint: 'Compra el permiso del río en el mapa (tecla Z) y viaja hasta allí.',
    complete: [
      '—Ya estás dentro. Por mí bien.',
      '—Pero te lo digo una vez: si el agua del río baja como está bajando, no es cosa del cielo.'
    ]
  },
  {
    id: 'sec_puestos',
    chapter: 1, type: 'exploracion',
    npc: 'tome', turnIn: 'tome',
    requires: ['cap1_primera'],
    title: 'Conocer el lago',
    summary: 'Tomé dice que quien sólo pesca desde el muelle no conoce el lago. Encuentra sus tres puestos.',
    objectives: [{ kind: 'spots', zone: 'lago_niebla', count: 3, label: 'Puestos del lago encontrados' }],
    reward: { money: 260, xp: 70, item: { category: 'lures', id: 'cucharilla_pesada' } },
    hint: 'Recorre la orilla: la hoya, el escalón y el juncal se marcan solos al llegar a ellos.',
    complete: [
      '—La hoya, el escalón y el juncal. Ya sabes dónde está el pescado en este lago.',
      'Rebusca en un cajón y saca una cucharilla del tamaño de un dedo.',
      '—Para la hoya. Baja rápido, que es lo que hace falta ahí.'
    ]
  },
  {
    id: 'sec_coleccion1',
    chapter: 1, type: 'coleccion',
    npc: 'sabela', turnIn: 'sabela',
    requires: ['cap1_cuaderno'],
    title: 'Censo de la cuenca',
    summary: 'Sabela quiere seis especies distintas anotadas en el registro.',
    objectives: [{ kind: 'discover', count: 6, label: 'Especies distintas descubiertas' }],
    reward: { money: 240, xp: 60 },
    complete: ['—Seis. Con esto ya puedo comparar con lo que había hace diez años. Gracias.']
  },

  // ---------------------------------------------------------- capítulo 2
  {
    id: 'cap2_barbo',
    chapter: 2, type: 'historia',
    npc: 'iria', turnIn: 'iria',
    requires: ['cap1_permiso'],
    title: 'Donde el agua se para',
    summary: 'Iria dice que los barbos están donde la corriente se remansa. Saca dos.',
    objectives: [{ kind: 'catch', species: 'barbo', count: 2, zone: 'rio_trenzado', label: 'Barbos de río cobrados' }],
    reward: { money: 180, xp: 55 },
    hint: 'En el río el señuelo se va con la corriente: lanza aguas arriba y déjalo bajar.',
    complete: [
      '—¡Te lo dije! En la curva de fuera hay más hondo.',
      '—Mi abuelo dice que eso lo sabía todo el mundo. Pero mi abuelo tampoco pesca nada.'
    ]
  },
  {
    id: 'cap2_salmon',
    chapter: 2, type: 'historia',
    npc: 'sabela', turnIn: 'sabela',
    requires: ['cap2_barbo'],
    title: 'El que sube',
    summary: 'Un salmón de 90 cm probaría que todavía remontan. Sabela lo necesita.',
    objectives: [{ kind: 'catch', species: 'salmon', minLength: 90, count: 1, label: 'Salmón de 90 cm o más' }],
    reward: { money: 420, xp: 110, page: 2 },
    complete: [
      '—Sube. Todavía sube. —Se sienta en la grava sin soltar el pez.',
      'Te da la segunda hoja, esta doblada en cuatro dentro de un sobre.',
      '«Página 2 · Donde el río se estrecha, el agua corre. Donde se ensancha, el agua piensa. Los peces grandes están siempre en la segunda.»'
    ]
  },
  {
    id: 'sec_concurso',
    chapter: 2, type: 'secundaria',
    npc: 'tome', turnIn: 'tome',
    requires: ['sec_puestos'],
    title: 'El concurso del embarcadero',
    summary: 'Tomé organiza concursos en el tablón. Gana uno.',
    objectives: [{ kind: 'tournament', count: 1, label: 'Concursos ganados' }],
    reward: { money: 350, xp: 100 },
    hint: 'Léelo en el tablón de cualquier zona: cinco minutos para batir la marca con un solo pez.',
    complete: [
      '—Ya te has llevado uno. Aquí se comenta durante semanas, avisado quedas.',
      '—Se abre uno cada rato y en cada agua tiene su marca. Cuanto más honda, más gorda.'
    ]
  },
  {
    id: 'sec_gato',
    chapter: 2, type: 'secundaria',
    npc: 'iria', turnIn: 'iria',
    requires: ['cap2_barbo'],
    title: 'La cena del gato',
    summary: 'Iria quiere una trucha para su gato. Dice que es urgente.',
    objectives: [{ kind: 'catch', species: 'trucha_comun', count: 1, label: 'Una trucha común' }],
    reward: { money: 90, xp: 25 },
    complete: ['—Perfecta. Se va a poner insoportable una semana. Gracias.']
  },
  {
    id: 'sec_equipo1',
    chapter: 2, type: 'equipo',
    npc: 'tome', turnIn: 'tome',
    requires: ['cap1_permiso'],
    title: 'Aparejo de verdad',
    summary: 'Tomé no te deja seguir con la caña de iniciación. Consigue una mejor.',
    objectives: [{ kind: 'own', category: 'rods', item: 'cana_ligera', label: 'Tener la caña ligera de lago' }],
    reward: { money: 150, xp: 40, item: { category: 'lines', id: 'nylon_028' } },
    complete: ['—Ya era hora. Toma hilo del 28, que con el del 22 me ibas a dar un disgusto.']
  },

  // ---------------------------------------------------------- capítulo 3
  {
    id: 'cap3_anguilas',
    chapter: 3, type: 'historia',
    npc: 'ovidio', turnIn: 'ovidio',
    requires: ['cap2_salmon'],
    title: 'Lo que sale de noche',
    summary: 'Ovidio pide tres anguilas, y sólo cuentan las de noche.',
    objectives: [{ kind: 'catch', species: 'anguila', count: 3, night: true, label: 'Anguilas cobradas de noche' }],
    reward: { money: 300, xp: 90 },
    hint: 'Descansa junto al fuego para saltar a la noche. Las anguilas quieren boilie o vinilo cerca del fondo.',
    complete: [
      '—Tres. De noche. Ya sabes lo que hay que saber de esta marisma.',
      '—Ahora escucha, que esto no lo repito: tu abuela no buscaba un pez. Buscaba por dónde se iba el agua.'
    ]
  },
  {
    id: 'cap3_espejo',
    chapter: 3, type: 'historia',
    npc: 'sabela', turnIn: 'sabela',
    requires: ['cap3_anguilas'],
    title: 'La carpa del canal',
    summary: 'Una carpa espejo confirmaría que el canal viejo sigue comunicado.',
    objectives: [{ kind: 'catch', species: 'carpa_espejo', count: 1, label: 'Una carpa espejo' }],
    reward: { money: 520, xp: 130, page: 3 },
    complete: [
      '—Escamas de espejo. Esta no ha nacido aquí: ha entrado desde arriba.',
      '«Página 3 · Si la marisma recibe peces del embalse, hay paso. Y si hay paso para ellos, lo hay para el agua.»'
    ]
  },
  {
    id: 'sec_coleccion2',
    chapter: 3, type: 'coleccion',
    npc: 'sabela', turnIn: 'sabela',
    requires: ['sec_coleccion1'],
    title: 'Censo ampliado',
    summary: 'Diez especies distintas en el registro. Sabela paga bien por ellas.',
    objectives: [{ kind: 'discover', count: 10, label: 'Especies distintas descubiertas' }],
    reward: { money: 700, xp: 150 },
    complete: ['—Diez. Esto ya no es una libreta, es un censo. Te lo pago como tal.']
  },

  // ---------------------------------------------------------- capítulo 4
  {
    id: 'cap4_lacustre',
    chapter: 4, type: 'historia',
    npc: 'marga', turnIn: 'marga',
    requires: ['cap3_espejo'],
    title: 'Fondo del embalse',
    summary: 'Marga quiere ver una trucha lacustre. Viven por debajo de los ocho metros.',
    objectives: [{ kind: 'catch', species: 'trucha_lacustre', count: 1, label: 'Una trucha lacustre' }],
    reward: { money: 600, xp: 140 },
    hint: 'Sube a la barca, boga al centro y usa cucharilla pesada. Necesitas hilo que aguante.',
    complete: [
      '—Del fondo del todo. Sabía que seguían ahí.',
      '—Te llevo yo la próxima vez. Hay un sitio que quiero que veas.'
    ]
  },
  {
    id: 'cap4_marga',
    chapter: 4, type: 'historia',
    npc: 'marga', turnIn: 'marga',
    requires: ['cap4_lacustre'],
    title: 'La compuerta vieja',
    summary: 'Cinco peces del embalse a cambio de que Marga te enseñe la compuerta.',
    objectives: [{ kind: 'catchAny', count: 5, zone: 'embalse_alto', label: 'Peces cobrados en el embalse' }],
    reward: { money: 450, xp: 120, page: 4 },
    complete: [
      'Te lleva en la barca hasta un muro de hormigón comido de musgo, con una compuerta cerrada.',
      '—Da a la garganta. Lleva veinte años cerrada y el agua sigue bajando igual.',
      'Entre las juntas hay una hoja de papel metida en una bolsa de plástico. La letra es la misma.',
      '«Página 4 · No la cierran para guardar agua. La cierran para que nadie baje a ver qué hay debajo.»'
    ]
  },

  {
    id: 'sec_barca',
    chapter: 4, type: 'equipo',
    npc: 'marga', turnIn: 'marga',
    requires: ['cap4_lacustre'],
    title: 'Un casco decente',
    summary: 'Marga no piensa dejarte salir al centro con esa barca de madera. Consigue una mejor.',
    objectives: [{ kind: 'own', category: 'boats', item: 'barca_aluminio', label: 'Tener la barca de aluminio' }],
    reward: { money: 400, xp: 90 },
    hint: 'Las embarcaciones se compran en la tienda, como el resto del aparejo.',
    complete: [
      '—Ahora sí. Con esa aguantas un día de viento sin achicar cada diez minutos.',
      '—Y si algún día te sobra el dinero, ponle un fueraborda: podrás curricar, avanzar despacio con el señuelo fuera. Es otra forma de pescar.'
    ]
  },

  // ---------------------------------------------------------- capítulo 5
  {
    id: 'cap5_garganta',
    chapter: 5, type: 'historia',
    npc: 'nuno', turnIn: 'nuno',
    requires: ['cap4_marga'],
    title: 'Las cuatro páginas',
    summary: 'Llévale a Nuno las cuatro páginas del cuaderno de Remedios.',
    objectives: [{ kind: 'deliver', count: 4, label: 'Páginas del cuaderno reunidas' }],
    reward: { xp: 200, unlockZone: 'garganta' },
    complete: [
      'Lee las cuatro sin decir nada. Cuando termina, se quita la gorra.',
      '—Yo firmé el cierre. Me dijeron que era por seguridad y firmé.',
      '—Hay una escala de servicio en la pared norte. Te abro la reja. Lo que veas ahí abajo, me lo cuentas a mí primero.'
    ]
  },
  {
    id: 'cap5_esturion',
    chapter: 5, type: 'historia',
    npc: 'sabela', turnIn: 'sabela',
    requires: ['cap5_garganta'],
    title: 'El que no debería estar',
    summary: 'En la garganta hay esturión. Llevaba décadas dado por desaparecido.',
    objectives: [{ kind: 'catch', species: 'esturion', count: 1, label: 'Un esturión del cañón' }],
    reward: { money: 1400, xp: 300 },
    complete: [
      '—Esto no es un pez. Esto es una prueba. —Le tiembla un poco la voz.',
      '—Con esto se para cualquier obra en la cuenca. Cualquiera.'
    ]
  },
  {
    id: 'cap5_sombra',
    chapter: 5, type: 'historia',
    npc: 'sabela', turnIn: 'sabela',
    requires: ['cap5_esturion'],
    title: 'La Sombra de Valdés',
    summary: 'Lo que Remedios pasó treinta años mirando. Sólo sale de noche, en lo más hondo.',
    objectives: [{ kind: 'catch', species: 'sombra_valdes', count: 1, label: 'La Sombra de Valdés' }],
    reward: { money: 5000, xp: 800, item: { category: 'rods', id: 'cana_pesada' } },
    hint: 'De noche cerrada, en el fondo de la garganta. Anzuelo grande —boilie o vinilo—, el aparejo más fuerte que tengas y el freno bien apretado.',
    complete: [
      'No cabe en la mesa. Sabela no la mide: la mira.',
      '—No estaba loca. Estaba sola, que no es lo mismo.',
      'En la última página, la que faltaba, hay una sola línea con la letra de Remedios:',
      '«Página 5 · No la pesques para enseñarla. Pésca la para saber que sigue ahí. Luego devuélvela.»'
    ]
  },
  {
    id: 'sec_explorador',
    chapter: 5, type: 'exploracion',
    npc: 'nuno', turnIn: 'nuno',
    requires: ['cap1_permiso'],
    title: 'Toda la cuenca',
    summary: 'Pisa las cinco aguas de la cuenca de Valdés.',
    objectives: [
      { kind: 'visit', zone: 'rio_trenzado', label: 'Río Trenzado' },
      { kind: 'visit', zone: 'marisma_argan', label: 'Marisma de Argán' },
      { kind: 'visit', zone: 'embalse_alto', label: 'Embalse Alto' },
      { kind: 'visit', zone: 'garganta', label: 'La Garganta' }
    ],
    reward: { money: 900, xp: 220 },
    complete: ['—Las cinco. Ya conoces la cuenca mejor que la mitad de mis compañeros.']
  }
];

export const QUESTS_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export const QUEST_TYPE_LABEL = {
  historia: 'Historia',
  secundaria: 'Secundaria',
  pesca: 'Pesca',
  exploracion: 'Exploración',
  coleccion: 'Colección',
  equipo: 'Equipo'
};

/** Texto del prólogo, al empezar partida nueva. */
export const PROLOGUE = [
  'Remedios Valdés pescó en esta cuenca durante cuarenta y un años.',
  'No dejó dinero. Dejó una cabaña con goteras, una caña de fibra y un cuaderno al que le faltan páginas.',
  'En la primera hoja que sí está, escribió: «El agua se va por algún sitio. Averígualo».'
];

/**
 * Todo el contenido narrativo en un solo objeto.
 *
 * El empaquetador aplana los módulos en un único ámbito, así que
 * `import * as Story` no sobrevive: este objeto hace el mismo papel y funciona
 * igual con módulos ES y con el paquete de un solo fichero.
 */
export const STORY = {
  NPCS, NPC_LIST, CHAPTERS, QUESTS, QUESTS_BY_ID, QUEST_TYPE_LABEL, PROLOGUE
};
