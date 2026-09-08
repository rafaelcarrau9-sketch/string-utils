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

try {
  if (loaderText) loaderText.textContent = 'Generando el lago…';
  const game = new Game(canvas);
  window.game = game;                     // útil para depurar desde la consola
  game.start();
  requestAnimationFrame(() => {
    loader?.classList.add('done');
    setTimeout(() => loader?.remove(), 700);
  });
} catch (error) {
  fail(error);
}
