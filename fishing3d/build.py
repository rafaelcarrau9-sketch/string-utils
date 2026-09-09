#!/usr/bin/env python3
"""
Empaqueta el juego en un único HTML autocontenido (dist/index.html).

El navegador puede ejecutar los módulos ES tal cual desde un servidor local
(index.html), pero para publicarlo como una sola página hay que unirlos. Este
script concatena los módulos en orden de dependencias, quita los import/export
internos y deja una única importación de three desde CDN.

Falla de forma ruidosa si dos módulos declaran el mismo nombre en el ámbito
superior, que es el único riesgo real de concatenar.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
THREE_VERSION = "0.160.1"
CDN = f"https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}"

# Orden de dependencias: cada módulo sólo usa los anteriores.
MODULES = [
    "src/core/MathUtils.js",
    "src/core/GeometryUtils.js",
    "src/core/Settings.js",
    "src/core/Performance.js",
    "src/core/SaveSystem.js",
    "src/core/Input.js",
    "src/world/Zones.js",
    "src/world/Textures.js",
    "src/world/TerrainShape.js",
    "src/world/Terrain.js",
    "src/world/WaterBody.js",
    "src/world/SkyDome.js",
    "src/world/Vegetation.js",
    "src/world/GrassBlades.js",
    "src/world/Trees.js",
    "src/world/Props.js",
    "src/world/Boat.js",
    "src/weather/TimeOfDay.js",
    "src/weather/Weather.js",
    "src/fish/FishData.js",
    "src/fish/Fish.js",
    "src/fish/FishManager.js",
    "src/gear/GearData.js",
    "src/gear/Inventory.js",
    "src/gear/Equipment.js",
    "src/economy/Economy.js",
    "src/fishing/Line.js",
    "src/fishing/Lure.js",
    "src/fishing/Rod.js",
    "src/fishing/FishingSystem.js",
    "src/player/Player.js",
    "src/ui/Coach.js",
    "src/ui/UI.js",
    "src/audio/AudioSystem.js",
    "src/core/Game.js",
    "src/main.js",
]

IMPORT_RE = re.compile(r"^import\s.*?;\s*$", re.M | re.S)
DECL_RE = re.compile(r"^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)", re.M)


def strip_module_syntax(source: str) -> str:
    """Quita imports locales y la palabra `export`, dejando el código plano."""
    source = IMPORT_RE.sub("", source)
    source = re.sub(r"^export\s+(?=(const|let|var|function|class)\s)", "", source, flags=re.M)
    source = re.sub(r"^export\s*\{[^}]*\};?\s*$", "", source, flags=re.M)
    return source.strip()


def check_collisions(sources):
    seen = {}
    problems = []
    for path, source in sources:
        for match in DECL_RE.finditer(source):
            name = match.group(1)
            if name in seen:
                problems.append(f"  {name}: {seen[name]} y {path}")
            else:
                seen[name] = path
    return problems


def build(local=False):
    """`local=True` apunta el import map a node_modules para poder probarlo
    sin salir a Internet."""
    sources = []
    for rel in MODULES:
        path = ROOT / rel
        if not path.exists():
            sys.exit(f"Falta el módulo {rel}")
        sources.append((rel, strip_module_syntax(path.read_text(encoding="utf-8"))))

    problems = check_collisions(sources)
    if problems:
        sys.exit("Nombres duplicados en el ámbito superior:\n" + "\n".join(problems))

    body = "\n\n".join(
        f"/* ===== {rel} ===== */\n{source}" for rel, source in sources
    )

    bundle = (
        "import * as THREE from 'three';\n"
        "import { Water } from 'three/addons/objects/Water.js';\n"
        "import { Sky } from 'three/addons/objects/Sky.js';\n\n"
        + body
    )

    three_url = "../node_modules/three/build/three.module.js" if local else f"{CDN}/build/three.module.js"
    addons_url = "../node_modules/three/examples/jsm/" if local else f"{CDN}/examples/jsm/"

    template = (ROOT / "index.html").read_text(encoding="utf-8")
    head_styles = re.search(r"<style>(.*?)</style>", template, re.S).group(1)

    html = f"""<meta charset="utf-8">
<title>Still Waters</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #05080b; overflow: hidden; }}
{head_styles}
</style>

<canvas id="viewport"></canvas>
<div id="loading">
  <div class="spinner"></div>
  <h1>Still Waters</h1>
  <p id="loading-text">Cargando el lago…</p>
</div>

<script type="importmap">
{{
  "imports": {{
    "three": "{three_url}",
    "three/addons/": "{addons_url}"
  }}
}}
</script>

<script type="module">
{bundle}
</script>

<script>
  // Si el módulo no llega a arrancar (three.js bloqueado, WebGL 2 ausente),
  // el usuario vería una pantalla de carga eterna. Esto lo explica.
  setTimeout(function () {{
    if (window.game) return;
    var t = document.getElementById('loading-text');
    if (t) t.innerHTML = '<b>No se pudo iniciar.</b><br>' +
      'Necesita WebGL 2 y acceso a la librería three.js.<br>' +
      '<small>Prueba con Chrome o Firefox actualizados en un ordenador.</small>';
  }}, 20000);
</script>
"""

    out = ROOT / "dist" / ("index.local.html" if local else "index.html")
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    kb = len(html.encode("utf-8")) / 1024
    print(f"dist/{out.name} generado — {kb:.0f} KB, {len(MODULES)} módulos")
    return out


if __name__ == "__main__":
    build(local="--local" in sys.argv)
