# Still Waters — simulador de pesca 3D

Simulador de pesca en primera persona que corre en el navegador. Proyecto
original: no reutiliza personajes, mapas, nombres, assets ni código de ningún
juego existente.

## Cómo ejecutarlo

**Opción rápida** — abrir `dist/index.html`. Es un único archivo que carga
three.js desde CDN; no necesita instalar nada, pero sí conexión a internet.

**Opción de desarrollo** — módulos ES sin empaquetar, para trabajar sobre el
código:

```bash
cd fishing3d
npm install          # sólo descarga three.js
npm run dev          # sirve en http://localhost:8080
```

Hace falta un servidor (no vale abrir `index.html` con doble clic): los módulos
ES no se cargan desde `file://`.

Para regenerar el archivo único tras tocar el código:

```bash
npm run build        # escribe dist/index.html
python3 build.py --local   # variante que usa node_modules, para probar sin CDN
```

Requiere un navegador con **WebGL 2** (Chrome o Firefox actualizados).

## Controles

| Tecla | Acción |
|---|---|
| `WASD` | Moverse (`Mayús` para correr) |
| Ratón | Mirar (clic en la pantalla para capturar el cursor) |
| Clic izq. mantenido | Cargar el lanzamiento; soltar para lanzar |
| Clic izq. | **Clavar** durante la picada |
| Clic der. mantenido | Recoger carrete |
| `W`/`S` y `A`/`D` (en la barca) | Bogar y virar |
| Rueda | Ajustar el freno |
| `E` | Subir o bajar de la barca |
| `Z` | Zonas de pesca (comprar acceso y viajar) |
| Ratón durante la pelea | Ladear la caña (presión lateral) |
| `R` | Recoger el sedal |
| `Tab` / `B` / `C` / `G` | Equipo / Tienda / Capturas / Estadísticas |
| `F` | Cambiar cámara (primera ↔ tercera persona) |
| `Esc` | Pausa |

## El modelo de pesca

El núcleo es una sola ecuación:

```
tensión = rigidez · (distancia_al_pez − hilo_soltado)
```

La línea sólo tira cuando hay **menos hilo fuera que distancia**. De ahí salen
los tres comportamientos que se esperan de un carrete, sin programarlos por
separado:

- **Recoger** acorta el hilo → sube la tensión → el pez viene hacia ti, pero
  sólo si la tensión supera su tirón.
- **El freno es un embrague**: mientras la carga lo supere, el carrete cede
  hilo y la tensión se queda clavada en el valor del freno. Las carreras del
  pez se pagan en metros, no en vida.
- **Holgura mantenida** → el anzuelo se desprende. El hilo que cede el freno
  no cuenta como holgura: ahí el pez está tirando.

Lo único que atraviesa el freno son los **picos** (embestidas, saltos): por eso
apretarlo al máximo es la forma más rápida de romper la línea.

### Presión lateral

Apuntar la caña **a un costado del pez**, y no de frente, es la técnica real
para cansarlo: se le tuerce la cabeza y pierde avance. Sale del propio giro de
la vista, sin añadir ningún control: el juego compara hacia dónde apunta la
caña con hacia dónde corre el pez.

| Pez | De frente | Presión contraria | Acompañando su carrera |
|---|---|---|---|
| Lucio 6,9 kg | 31 s | **25 s** | 39 s |
| Carpa 12,7 kg | 34 s | **25 s** | 43 s |

### Dos montajes

Los señuelos declaran su `rig`. Los de **señuelo** (cucharilla, vinilo, popper)
hay que trabajarlos recogiendo. Los de **flotador** (ninfa, boilie) se dejan
quietos: la boya cabecea en la superficie con el cebo suspendido debajo, y
**se hunde al picar** — el aviso llega por la boya antes que por el texto.

Números medidos en la simulación automática (`build.py` aparte, ver más abajo),
con una política de juego razonable:

| Pez | Equipo básico | Equipo medio | Equipo pesado |
|---|---|---|---|
| Perca 0,5–2,9 kg | cobrado, 19–21 s | — | — |
| Lucio 5–13 kg | cobrado, 25–31 s | cobrado, 20 s | — |
| Siluro 25 kg | — | cobrado, 31 s | — |
| Siluro 57 kg | — | **perdido** (37 m de hilo) | cobrado, 30 s |
| Siluro 57 kg, freno al máximo | — | **línea rota en 3 s** | — |

## Arquitectura

`three.js` 0.160 con módulos ES e import maps. Sin empaquetador: el proyecto se
ejecuta tal cual desde un servidor estático, y `build.py` genera el archivo
único sólo para distribuirlo.

```
src/
  core/       MathUtils, GeometryUtils, Settings, SaveSystem, Input, Game
  world/      Zones, Textures, TerrainShape, Terrain, WaterBody, SkyDome,
              Vegetation, Trees, Props, Boat
  weather/    TimeOfDay, Weather
  player/     Player
  fish/       FishData, Fish, FishManager
  fishing/    Line, Lure, Rod, FishingSystem
  gear/       GearData, Inventory, Equipment
  economy/    Economy
  ui/         UI
  audio/      AudioSystem
```

Reglas que sigue el proyecto:

- **Ningún sistema conoce a los demás.** `Game` los construye y les pasa cada
  fotograma el contexto que necesitan (hora, viento, posición del jugador).
- **Los datos van aparte de la lógica.** Especies (`FishData`) y equipo
  (`GearData`) son tablas planas: añadir un pez o una caña no toca el motor.
- **Simulación separada del dibujado.** `Game.simulate(dt)` avanza el mundo sin
  tocar la GPU, lo que permite ejecutar partidas completas a velocidad de
  cálculo para probar y ajustar el equilibrio.
- **Forma del terreno sin dependencias.** `TerrainShape.js` no importa three, así
  que el relieve se puede consultar y probar fuera del navegador.

### Sin assets externos

La página publicada no puede descargar imágenes, así que **todo el material se
genera por código**: los mapas de color, normales y rugosidad de tierra, arena,
hierba, roca, corteza y madera salen de ruido fBm sobre un canvas, igual que las
normales del oleaje, las matas de hierba, el follaje, las nubes y la lluvia. El
audio es igual: viento, agua, lluvia, pájaros y grillos son ruido filtrado y
osciladores con envolvente.

Para sustituirlos por texturas reales basta con cambiar `TextureLibrary.material()`
por un cargador; el resto del juego sólo pide materiales por nombre.

## Zonas

Una zona es un juego de parámetros en `Zones.js`: forma del lago, paleta,
especies presentes, densidad de vegetación y precio de acceso. `Game.travelTo()`
rehace la geografía —terreno, agua, vegetación, arbolado, construcciones,
barca y población— y conserva jugador, dinero, equipo y registro de capturas.

| Zona | Precio | Calado | Especies |
|---|---|---|---|
| Lago de la Niebla | gratis | 9,5 m | perca negra, trucha arcoíris, carpa, lucio, siluro, tenca |
| Embalse Alto | 2 500 | 16 m | trucha arcoíris, trucha común, lucio, lucioperca, siluro |

Añadir una tercera no toca ni el motor ni la interfaz: basta una entrada más en
`ZONES` (y, si se quiere, especies nuevas en `FishData`).

## El agua

Reflejo planar real mediante cámara espejo, y **transparencia según la
profundidad**: un mapa del calado del lago, horneado del propio campo de
alturas, decide cuánto se ve el fondo. No hace falta una segunda pasada de
render.

La transparencia se modula además con el Fresnel del shader, elevado a una
potencia: a rasante el lago sigue siendo un espejo —que es lo que se ve desde
la orilla— y sólo mirando hacia abajo se transparenta el bajío. Junto al borde
hay una franja clara donde la lámina fina moja la arena.

## La barca

Fondeada en la orilla oeste. Con `E` se sube y con `W`/`S` se boga; `A`/`D`
viran, y virar sólo tiene efecto con algo de arrancada. No entra donde no hay
calado —encalla suavemente— y para bajarse hace falta orilla al lado: en medio
del lago el juego lo impide.

Importa porque las especies de fondo (el siluro vive entre 4,5 y 9,5 m) no
pican desde la orilla. Doce segundos bogando desde el fondeadero llevan a más
de 6 m de calado.

## Rendimiento y primeros pasos

**La calidad se ajusta sola.** El juego mide sus fotogramas por segundo en
ventanas de dos segundos: si baja de 32 durante dos ventanas seguidas, baja un
escalón (resolución de render, sombras, distancias de dibujado, lluvia); si
pasa de 56 durante seis ventanas, vuelve a subir. Elegir calidad a mano en
Configuración desactiva el ajuste. Ahí mismo se puede mostrar el contador de fps.

**Avisos de aprendizaje.** En partida nueva sale una tarjeta con las tres
acciones básicas, y a partir de ahí los consejos aparecen cuando hacen falta
—al picar, al pelear, al romper la línea, al acercarse a la barca— una sola vez
cada uno, y se recuerdan en la partida guardada. Son condiciones sobre el
estado, no una secuencia fija: quien enganche un pez antes de leer nada recibe
igualmente el consejo de la pelea.

## Rendimiento

- Vegetación en `InstancedMesh` agrupada por celdas, con corte por distancia.
- **LOD real en el arbolado**: cerca, tronco con ramas y copa de varios
  volúmenes; lejos, un cartel con la mancha de follaje. El cambio se hace
  escalando a cero las instancias del nivel que no toca, y sólo se recalcula
  cuando el jugador se ha movido 6 m.
- Escena típica: ~300 000 triángulos en **~30 draw calls**.
- Tres presets de calidad que cambian resolución de sombras, tamaño del render
  target del reflejo, densidad de hierba y número de partículas de lluvia.
- El reflejo del agua es una segunda pasada de escena: es lo más caro del
  cuadro y lo primero que conviene bajar en equipos modestos.

## Qué falta

- Refracción con desplazamiento real (hoy hay transparencia por profundidad,
  que resuelve la lectura pero no dobla la imagen del fondo).
- Cascadas de sombra, para que el arbolado lejano proyecte bien.
- Más zonas: hay dos, y el sistema admite las que se quieran.
- Peces visibles sólo a menos de 45 m.
- Hierba, juncos y arbustos siguen siendo planos cruzados y volúmenes simples;
  el arbolado ya no.
