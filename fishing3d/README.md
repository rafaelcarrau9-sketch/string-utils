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
| Rueda | Ajustar el freno |
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
  world/      Textures, TerrainShape, Terrain, WaterBody, SkyDome, Vegetation, Props
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

## Rendimiento

- Vegetación en `InstancedMesh` agrupada por celdas, con corte por distancia.
- Escena típica: ~300 000 triángulos en **~30 draw calls**.
- Tres presets de calidad que cambian resolución de sombras, tamaño del render
  target del reflejo, densidad de hierba y número de partículas de lluvia.
- El reflejo del agua es una segunda pasada de escena: es lo más caro del
  cuadro y lo primero que conviene bajar en equipos modestos.

## Qué falta

Ver el resumen de estado en la conversación del proyecto. En corto: falta un
segundo mapa, tercera persona expuesta al jugador (la cámara ya está preparada),
pesca desde la barca, y sustituir la vegetación de planos cruzados por modelos.
