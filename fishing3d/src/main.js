import { Game } from './core/Game.js';

/** Punto de entrada: monta el juego y quita la pantalla de carga. */
const canvas = document.getElementById('viewport');
const loader = document.getElementById('loading');
const loaderText = document.getElementById('loading-text');

function fail(error) {
  console.error(error);
  if (loaderText) {
    loaderText.innerHTML = `<b>No se pudo iniciar el juego.</b><br>${error.message}<br>
      <small>Requiere un navegador con WebGL 2.</small>`;
  }
}

/**
 * Arranque por fases.
 *
 * Construir el mundo lleva un par de segundos: generar el relieve, pintar las
 * texturas y sembrar la vegetación. Sin decir en qué va, la pantalla de carga
 * parece un cuelgue. Cada fase cede el hilo al navegador para que la barra se
 * pinte de verdad en vez de saltar del 0 al 100 al final.
 */
const PHASES = [
  'Levantando el relieve…',
  'Generando texturas…',
  'Sembrando la orilla…',
  'Soltando los peces…',
  'Colocando a la gente…'
];

const bar = document.getElementById('loading-bar');
const setProgress = (i) => {
  const pct = Math.round((i / PHASES.length) * 100);
  if (loaderText) loaderText.textContent = PHASES[Math.min(i, PHASES.length - 1)];
  if (bar) bar.style.width = `${pct}%`;
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  try {
    for (let i = 0; i < 2; i++) { setProgress(i); await nextFrame(); }
    const game = new Game(canvas);
    window.game = game;                   // útil para depurar desde la consola
    for (let i = 2; i < PHASES.length; i++) { setProgress(i); await nextFrame(); }
    if (bar) bar.style.width = '100%';
    game.start();
    await nextFrame();
    loader?.classList.add('done');
    setTimeout(() => loader?.remove(), 700);
  } catch (error) {
    fail(error);
  }
}

boot();
