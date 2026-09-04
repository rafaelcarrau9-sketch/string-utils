# string-utils

A tiny collection of string helper functions, used as a practice project for
learning the pull request workflow — plus **Pesca**, a terminal fishing game.

## Pesca

Un juego de pesca para la terminal: lanzas, esperas la picada, clavas a tiempo
y peleas con el pez hasta subirlo a bordo sin romper el sedal.

```bash
python -m fishing_game
```

Opciones: `--save RUTA` (por defecto `~/.pesca/partida.json`), `--seed N` para
una partida reproducible, `--no-color` y `--fast` (sin esperas).

### Cómo se juega

1. **Elige cebo.** Cuanto mejor es el cebo, más raro es lo que pica — y menos
   basura. Se gasta una unidad por lanzamiento. Se puede pescar sin cebo, pero
   casi todo será una bota vieja.
2. **Clava a tiempo.** Cuando aparece `PICA!` tienes entre 0,7 y 2,2 segundos
   para pulsar ENTER, según la especie. El cebo te da un poco de margen.
3. **Pelea.** Cada ronda eliges una de tres acciones:
   - **Recoger** — ganas metros, pero tensas el sedal.
   - **Soltar hilo** — bajas mucho la tensión y pierdes algunos metros.
   - **Aguantar** — apenas tensas y el pez se cansa.

   Si la tensión llega al límite de tu caña, el sedal se rompe. Si tardas más
   de 14 rondas, el anzuelo se suelta. La clave es recoger cuando el pez
   descansa y soltar hilo cuando embiste.
4. **Vende y mejora.** Los peces van a la nevera (caben 8). Se venden en la
   tienda, y con el dinero compras cañas mejores, cebos y acceso a zonas nuevas.

### Progresión

| Zona | Precio | Caña recomendada |
|---|---|---|
| Lago Sereno | gratis | Caña de bambú |
| Río Bravo | 150 | Caña de fibra |
| Muelle Viejo | 500 | Caña de carbono |
| Mar Abierto | 1800 | Caña de carbono / titanio |
| El Abismo | 6000 | Caña de titanio |

Hay 38 especies repartidas por las cinco zonas (más la basura), y el bestiario
guarda cuántas has pescado de cada una y tu récord de peso. La partida se
guarda sola después de cada lance, compra o viaje.

### Estructura del código

- `fishing_game/catalog.py` — los datos del mundo: especies, zonas, cañas y cebos.
- `fishing_game/engine.py` — las reglas: qué pica, cuánto pesa y el combate.
  Todas las funciones reciben un `random.Random`, así que con una semilla la
  partida es reproducible.
- `fishing_game/state.py` — dinero, equipo, nevera, bestiario y el guardado en
  disco (escritura atómica, y los saves viejos se cargan ignorando lo que ya no
  existe en el catálogo).
- `fishing_game/cli.py` — la interfaz de terminal, separada de las reglas.

El equilibrio está ajustado con simulación: con la caña adecuada para la zona,
un jugador que juegue bien cobra casi todos los peces comunes, un 85-100% de
los raros y entre un 55% y un 85% de los legendarios; recoger sin parar rompe
el sedal en cuanto el pez tiene algo de fuerza.

## String helpers

- `reverse_string(text)` — returns the string reversed.
- `is_palindrome(text)` — returns `True` if the string reads the same forwards and backwards (ignoring case and spaces).
- `count_vowels(text)` — returns the number of vowels (a, e, i, o, u) in the string.

## Running the tests

```bash
python -m pytest
```
