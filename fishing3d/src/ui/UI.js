import { CATALOG, CATEGORY_LABELS } from '../gear/GearData.js';
import { SPECIES } from '../fish/FishData.js';
import { FishingState } from '../fishing/FishingSystem.js';
import { QUALITY_PRESETS } from '../core/Settings.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Interfaz: HUD de pesca y pantallas (equipo, tienda, capturas, estadísticas,
 * ajustes y pausa).
 *
 * La UI no toca el estado del juego directamente: recibe datos en `update()` y
 * comunica intenciones por callbacks. Así se puede rediseñar sin arriesgar la
 * lógica.
 */

const CSS = `
.sw-root, .sw-root * { box-sizing: border-box; margin: 0; font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; }
.sw-root { position: fixed; inset: 0; pointer-events: none; color: #eef4f6; z-index: 10;
  --panel: rgba(14,19,24,.92); --edge: rgba(255,255,255,.12); --dim: #9fb0bb;
  --accent: #6fd3c7; --warn: #f2c14e; --bad: #e2604a; --good: #74d68a; }
.sw-root button { font: inherit; color: inherit; cursor: pointer; pointer-events: auto; }

.sw-crosshair { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px;
  border-radius: 50%; background: rgba(255,255,255,.75); box-shadow: 0 0 4px rgba(0,0,0,.8); }

.sw-topbar { position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 8px; align-items: center; }
.sw-chip { background: var(--panel); border: 1px solid var(--edge); border-radius: 8px;
  padding: 5px 11px; font-size: 12px; letter-spacing: .02em; display: flex; gap: 7px; align-items: baseline; backdrop-filter: blur(8px); }
.sw-chip b { font-variant-numeric: tabular-nums; font-weight: 600; }
.sw-chip .k { color: var(--dim); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; }
.sw-money b { color: var(--warn); }

.sw-gear { position: absolute; left: 16px; bottom: 16px; background: var(--panel);
  border: 1px solid var(--edge); border-radius: 10px; padding: 10px 13px; min-width: 205px; backdrop-filter: blur(8px); }
.sw-gear h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: var(--dim); font-weight: 500; margin-bottom: 6px; }
.sw-gear .row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; padding: 2px 0; }
.sw-gear .row span:last-child { color: var(--dim); font-variant-numeric: tabular-nums; }

.sw-tension { position: absolute; right: 18px; bottom: 16px; width: 190px; background: var(--panel);
  border: 1px solid var(--edge); border-radius: 10px; padding: 11px 13px; backdrop-filter: blur(8px); }
.sw-tension .label { display: flex; justify-content: space-between; font-size: 10px;
  text-transform: uppercase; letter-spacing: .12em; color: var(--dim); margin-bottom: 5px; }
.sw-tension .label b { color: #eef4f6; font-variant-numeric: tabular-nums; letter-spacing: 0; }
.sw-bar { height: 9px; border-radius: 99px; background: rgba(255,255,255,.09); overflow: hidden; position: relative; }
.sw-bar i { display: block; height: 100%; width: 0; background: var(--good); transition: width .06s linear, background .2s; }
.sw-bar .mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: rgba(255,255,255,.8); }
.sw-tension .sub { margin-top: 9px; }

.sw-prompt { position: absolute; left: 50%; bottom: 88px; transform: translateX(-50%); text-align: center; width: 460px; }
.sw-prompt .big { font-size: 26px; font-weight: 700; letter-spacing: .01em; text-shadow: 0 2px 12px rgba(0,0,0,.9); }
.sw-prompt .small { font-size: 13px; color: #d6e2e8; text-shadow: 0 2px 8px rgba(0,0,0,.9); margin-top: 3px; }
.sw-prompt .side { font-size: 12px; font-weight: 600; margin-top: 5px;
  text-shadow: 0 2px 8px rgba(0,0,0,.95); letter-spacing: .01em; }
.sw-prompt .side.good { color: var(--good); }
.sw-prompt .side.bad { color: var(--bad); }
.sw-prompt .side.neutral { color: var(--dim); }
.sw-prompt .side .ar { font-size: 15px; vertical-align: -1px; }
.sw-prompt .bite { color: var(--warn); animation: swpulse .45s ease-in-out infinite alternate; }
@keyframes swpulse { from { transform: scale(1); } to { transform: scale(1.05); } }
.sw-power { width: 260px; height: 10px; margin: 8px auto 0; border-radius: 99px;
  background: rgba(0,0,0,.55); border: 1px solid var(--edge); overflow: hidden; }
.sw-power i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--accent), var(--warn)); }

.sw-fade { position: absolute; inset: 0; background: #05080b; opacity: 0; pointer-events: none;
  transition: opacity .55s ease; }
.sw-fade.on { opacity: 1; }
.sw-coach { position: absolute; left: 50%; bottom: 152px; transform: translateX(-50%);
  width: min(560px, 88vw); background: var(--panel); border: 1px solid var(--accent);
  border-left-width: 3px; border-radius: 9px; padding: 10px 14px; font-size: 13.5px;
  line-height: 1.5; backdrop-filter: blur(8px); box-shadow: 0 10px 30px -12px #000; }
.sw-fps { position: absolute; right: 16px; top: 14px; font-family: ui-monospace, monospace;
  font-size: 11px; color: var(--dim); background: var(--panel); border: 1px solid var(--edge);
  border-radius: 6px; padding: 3px 8px; }
.sw-hintline { position: absolute; left: 50%; top: calc(50% + 28px); transform: translateX(-50%);
  font-size: 12.5px; font-weight: 550; color: #dbe7ee; text-shadow: 0 2px 8px rgba(0,0,0,.95);
  letter-spacing: .01em; }
.sw-toast { position: absolute; left: 50%; top: 90px; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--edge); border-radius: 8px; padding: 8px 15px; font-size: 13px; }
.sw-toast.bad { border-color: rgba(226,96,74,.6); color: #ffc9bd; }

.sw-overlay { position: absolute; inset: 0; background: rgba(6,10,13,.82); backdrop-filter: blur(7px);
  display: flex; align-items: center; justify-content: center; pointer-events: auto; padding: 22px; }
.sw-overlay.bottom { align-items: flex-end; backdrop-filter: none;
  background: linear-gradient(180deg, rgba(6,10,13,0) 0%, rgba(6,10,13,.2) 55%, rgba(6,10,13,.88) 100%);
  padding-bottom: 26px; }
.sw-panel { background: #0e1318; border: 1px solid var(--edge); border-radius: 14px;
  width: min(760px, 100%); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 30px 80px -30px #000; }
.sw-panel > header { display: flex; align-items: center; justify-content: space-between;
  padding: 15px 18px; border-bottom: 1px solid var(--edge); }
.sw-panel h2 { font-size: 17px; font-weight: 650; }
.sw-panel .body { padding: 16px 18px 20px; overflow-y: auto; }
.sw-close { background: none; border: none; font-size: 22px; line-height: 1; color: var(--dim); padding: 2px 6px; }
.sw-tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.sw-tabs button { background: rgba(255,255,255,.05); border: 1px solid var(--edge); border-radius: 7px;
  padding: 7px 13px; font-size: 12px; font-weight: 550; }
.sw-tabs button[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: #06231f; }

.sw-item { display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 11px 13px; border: 1px solid var(--edge); border-radius: 9px; margin-bottom: 7px; background: rgba(255,255,255,.03); }
.sw-item .t { font-size: 14px; font-weight: 600; }
.sw-item .d { font-size: 11.5px; color: var(--dim); margin-top: 3px; line-height: 1.45; }
.sw-item .stats { font-size: 11px; color: var(--accent); margin-top: 4px; font-variant-numeric: tabular-nums; }
.sw-item .act { display: flex; gap: 6px; flex-shrink: 0; }
.sw-btn { background: var(--accent); border: 1px solid var(--accent); color: #06231f;
  border-radius: 7px; padding: 7px 13px; font-size: 12px; font-weight: 650; white-space: nowrap; }
.sw-btn.ghost { background: transparent; color: #eef4f6; border-color: var(--edge); }
.sw-btn:disabled { opacity: .35; cursor: not-allowed; }
.sw-item.equipped { border-color: rgba(111,211,199,.55); }
.sw-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--accent); }

.sw-cta { display: block; width: 100%; padding: 13px; font-size: 15px; border-radius: 10px; }
.sw-catch { text-align: center; }
.sw-catch .name { font-size: 26px; font-weight: 700; }
.sw-catch .latin { font-style: italic; color: var(--dim); font-size: 13px; margin-top: 2px; }
.sw-catch .measures { display: flex; gap: 26px; justify-content: center; margin: 18px 0; }
.sw-catch .measures div { font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: .1em; }
.sw-catch .measures b { display: block; font-size: 25px; color: #eef4f6; letter-spacing: 0; font-variant-numeric: tabular-nums; }
.sw-catch .badges { display: flex; gap: 7px; justify-content: center; margin-bottom: 16px; flex-wrap: wrap; }
.sw-badge { font-size: 10px; text-transform: uppercase; letter-spacing: .11em; padding: 4px 10px;
  border-radius: 99px; border: 1px solid currentColor; }
.sw-actions { display: flex; gap: 9px; justify-content: center; }

.sw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.sw-card { border: 1px solid var(--edge); border-radius: 9px; padding: 11px 12px; background: rgba(255,255,255,.03); }
.sw-card .t { font-size: 13px; font-weight: 600; }
.sw-card .m { font-size: 11px; color: var(--dim); margin-top: 3px; font-variant-numeric: tabular-nums; }
.sw-card.unknown { opacity: .45; }
.sw-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 9px; }
.sw-stat { border: 1px solid var(--edge); border-radius: 9px; padding: 11px 12px; }
.sw-stat .k { font-size: 10px; text-transform: uppercase; letter-spacing: .11em; color: var(--dim); }
.sw-stat .v { font-size: 21px; font-weight: 650; font-variant-numeric: tabular-nums; margin-top: 3px; }
.sw-field { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--edge); }
.sw-field:last-child { border-bottom: none; }
.sw-field label { font-size: 13px; }
.sw-field input[type=range] { width: 180px; pointer-events: auto; }
.sw-hint { font-size: 12px; color: var(--dim); line-height: 1.6; }
.sw-keys { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; font-size: 12.5px; margin-top: 6px; }
.sw-keys b { color: var(--accent); font-weight: 600; }

/* ---- diálogo ---- */
.sw-dialogue { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%);
  width: min(720px, 92vw); background: var(--panel); border: 1px solid var(--edge);
  border-radius: 12px; padding: 16px 20px 14px; pointer-events: auto;
  backdrop-filter: blur(10px); box-shadow: 0 24px 60px -22px #000; }
.sw-dialogue .who { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: var(--accent); }
.sw-dialogue .who span { color: var(--dim); text-transform: none; letter-spacing: .02em; margin-left: 8px; font-size: 11.5px; }
.sw-dialogue .line { font-size: 15px; line-height: 1.62; margin-top: 8px; min-height: 52px; }
.sw-dialogue .line em { color: var(--accent); font-style: normal; }
.sw-dialogue .foot { display: flex; justify-content: space-between; align-items: center;
  gap: 12px; margin-top: 12px; }
.sw-dialogue .adv { font-size: 11.5px; color: var(--dim); }
.sw-choices { display: flex; flex-wrap: wrap; gap: 7px; }
.sw-choices button { background: rgba(255,255,255,.05); border: 1px solid var(--edge);
  border-radius: 8px; padding: 8px 14px; font-size: 12.5px; font-weight: 550; }
.sw-choices button.primary { background: var(--accent); border-color: var(--accent); color: #06231f; }

/* ---- seguimiento de misión en el HUD ---- */
.sw-track { position: absolute; right: 18px; top: 56px; width: 232px; background: var(--panel);
  border: 1px solid var(--edge); border-left: 3px solid var(--warn); border-radius: 10px;
  padding: 10px 13px; backdrop-filter: blur(8px); }
.sw-track .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: .14em; color: var(--warn); }
.sw-track .t { font-size: 13px; font-weight: 620; margin-top: 3px; line-height: 1.35; }
.sw-track .o { font-size: 11.5px; color: var(--dim); margin-top: 6px; display: flex;
  justify-content: space-between; gap: 8px; line-height: 1.4; }
.sw-track .o.done { color: var(--good); text-decoration: line-through; }
.sw-track .o b { font-variant-numeric: tabular-nums; color: #eef4f6; flex-shrink: 0; }
.sw-track .where { font-size: 11px; color: var(--accent); margin-top: 7px; }

/* ---- nivel ---- */
.sw-level { display: flex; flex-direction: column; gap: 3px; min-width: 150px; }
.sw-event { position: absolute; left: 50%; top: 56px; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--warn); border-radius: 99px;
  padding: 5px 15px; font-size: 12px; letter-spacing: .01em; backdrop-filter: blur(8px);
  color: #ffe6ab; }
.sw-level .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sw-xpbar { height: 4px; border-radius: 99px; background: rgba(255,255,255,.13); overflow: hidden; }
.sw-xpbar i { display: block; height: 100%; background: var(--accent); transition: width .3s; }

/* ---- avisos de progreso ---- */
.sw-notes { position: absolute; left: 50%; top: 128px; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px; width: 460px; }
.sw-note { background: var(--panel); border: 1px solid var(--edge); border-left: 3px solid var(--accent);
  border-radius: 8px; padding: 8px 14px; font-size: 12.5px; backdrop-filter: blur(8px);
  animation: swin .35s ease both; max-width: 100%; text-align: center; }
.sw-note.gold { border-left-color: var(--warn); }
.sw-note.good { border-left-color: var(--good); }
@keyframes swin { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

/* ---- diario y enciclopedia ---- */
.sw-quest { border: 1px solid var(--edge); border-radius: 10px; padding: 12px 14px;
  margin-bottom: 8px; background: rgba(255,255,255,.03); }
.sw-quest.tracked { border-color: rgba(242,193,78,.6); }
.sw-quest.done { opacity: .5; }
.sw-quest .head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.sw-quest .t { font-size: 14px; font-weight: 620; }
.sw-quest .meta { font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; color: var(--dim); margin-top: 3px; }
.sw-quest .d { font-size: 12px; color: var(--dim); margin-top: 6px; line-height: 1.5; }
.sw-quest .obj { font-size: 12px; margin-top: 7px; display: flex; justify-content: space-between; gap: 10px; }
.sw-quest .obj.ok { color: var(--good); }
.sw-quest .obj b { font-variant-numeric: tabular-nums; }
.sw-quest .rw { font-size: 11.5px; color: var(--warn); margin-top: 8px; }
.sw-quest .hint { font-size: 11.5px; color: var(--accent); margin-top: 6px; font-style: italic; }
.sw-chaptitle { font-size: 11px; text-transform: uppercase; letter-spacing: .14em;
  color: var(--accent); margin: 16px 0 8px; }
.sw-chaptitle:first-child { margin-top: 0; }

.sw-fish { border: 1px solid var(--edge); border-radius: 10px; padding: 12px 13px;
  background: rgba(255,255,255,.03); }
.sw-fish.unknown { opacity: .42; }
.sw-fish .t { font-size: 13.5px; font-weight: 620; display: flex; align-items: baseline; gap: 7px; }
.sw-fish .lat { font-style: italic; color: var(--dim); font-size: 11px; margin-top: 2px; }
.sw-fish .r { font-size: 9.5px; text-transform: uppercase; letter-spacing: .1em; padding: 2px 7px;
  border-radius: 99px; border: 1px solid currentColor; flex-shrink: 0; }
.sw-fish .r.comun { color: var(--dim); }
.sw-fish .r.raro { color: var(--accent); }
.sw-fish .r.legendario { color: var(--warn); }
.sw-fish .g { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 11.5px;
  margin-top: 8px; color: var(--dim); }
.sw-fish .g b { color: #eef4f6; font-weight: 550; font-variant-numeric: tabular-nums; }
.sw-swatch { width: 11px; height: 11px; border-radius: 3px; display: inline-block; vertical-align: -1px; }

/* ---- menú principal ---- */
.sw-menu { position: absolute; inset: 0; pointer-events: auto; display: flex;
  flex-direction: column; align-items: center; justify-content: center; gap: 26px;
  background: radial-gradient(ellipse at 50% 40%, rgba(10,18,24,.72), rgba(4,7,10,.96)); }
.sw-menu h1 { font-size: 46px; font-weight: 300; letter-spacing: .16em; text-transform: uppercase; }
.sw-menu .sub { font-size: 13px; color: var(--dim); letter-spacing: .06em; margin-top: -18px; }
.sw-menu .acts { display: flex; flex-direction: column; gap: 9px; width: 268px; }
.sw-menu .acts button { padding: 12px; border-radius: 9px; font-size: 14px; }
.sw-menu .save { font-size: 11.5px; color: var(--dim); text-align: center; line-height: 1.6; }
.sw-prologue { max-width: 560px; text-align: center; font-size: 15px; line-height: 1.75; color: #cfdde5; }
`;

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
};

export class UI {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.openPanel = null;
    this.shopTab = 'rods';
    this.gearTab = 'rods';

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = el('div', 'sw-root');
    document.body.appendChild(this.root);

    this.crosshair = el('div', 'sw-crosshair');
    this.root.appendChild(this.crosshair);

    this.topbar = el('div', 'sw-topbar');
    this.chips = {
      time: this._chip('Hora', '07:30'),
      weather: this._chip('Tiempo', 'Despejado'),
      money: this._chip('Monedas', '60'),
      level: this._levelChip()
    };
    this.chips.money.classList.add('sw-money');
    Object.values(this.chips).forEach((c) => this.topbar.appendChild(c));
    this.root.appendChild(this.topbar);

    this.gearBox = el('div', 'sw-gear');
    this.root.appendChild(this.gearBox);

    this.trackBox = el('div', 'sw-track');
    this.trackBox.style.display = 'none';
    this.root.appendChild(this.trackBox);

    this.notes = el('div', 'sw-notes');
    this.root.appendChild(this.notes);

    this.eventBox = el('div', 'sw-event');
    this.eventBox.style.display = 'none';
    this.root.appendChild(this.eventBox);

    this.tensionBox = el('div', 'sw-tension');
    this.tensionBox.innerHTML = `
      <div class="label"><span>Tensión</span><b class="t-val">0.0 kg</b></div>
      <div class="sw-bar"><i class="t-fill"></i><div class="mark"></div></div>
      <div class="sub">
        <div class="label"><span>Freno</span><b class="d-val">1.4 kg</b></div>
        <div class="sw-bar"><i class="d-fill" style="background:var(--warn)"></i></div>
      </div>
      <div class="sub">
        <div class="label"><span>Hilo fuera</span><b class="l-val">0 m</b></div>
      </div>
      <div class="sub fight-only">
        <div class="label"><span>Pez agotado</span><b class="f-val">0 %</b></div>
        <div class="sw-bar"><i class="f-fill" style="background:var(--good)"></i></div>
      </div>
      <div class="sub fight-only">
        <div class="label"><span>Anzuelo</span><b class="h-val">100 %</b></div>
        <div class="sw-bar"><i class="h-fill" style="background:var(--good)"></i></div>
      </div>`;
    this.root.appendChild(this.tensionBox);

    this.prompt = el('div', 'sw-prompt');
    this.root.appendChild(this.prompt);

    this.hint = el('div', 'sw-hintline');
    this.root.appendChild(this.hint);

    this.coachBox = el('div', 'sw-coach');
    this.coachBox.style.display = 'none';
    this.root.appendChild(this.coachBox);

    this.fpsBox = el('div', 'sw-fps');
    this.fpsBox.style.display = 'none';
    this.root.appendChild(this.fpsBox);

    this.fadeBox = el('div', 'sw-fade');
    this.root.appendChild(this.fadeBox);

    this.toast = el('div', 'sw-toast');
    this.toast.style.display = 'none';
    this.root.appendChild(this.toast);
  }

  /** Chip de nivel con su barra de experiencia. */
  _levelChip() {
    const chip = el('div', 'sw-chip');
    chip.innerHTML = `<div class="sw-level">
      <div class="top"><span class="k">Nivel <b class="lv">1</b></span><b class="ti" style="font-size:10.5px;color:var(--dim);font-weight:500;white-space:nowrap">Novato</b></div>
      <div class="sw-xpbar"><i></i></div></div>`;
    return chip;
  }

  setLevel(level, title, [have, need]) {
    const lv = this.chips.level.querySelector('.lv');
    if (lv.textContent !== String(level)) lv.textContent = level;
    const ti = this.chips.level.querySelector('.ti');
    if (ti.textContent !== title) ti.textContent = title;
    this.chips.level.querySelector('.sw-xpbar i').style.width =
      `${clamp(have / Math.max(1, need), 0, 1) * 100}%`;
  }

  _chip(key, value) {
    const chip = el('div', 'sw-chip');
    chip.innerHTML = `<span class="k">${key}</span><b>${value}</b>`;
    return chip;
  }

  setChip(name, value) {
    const b = this.chips[name]?.querySelector('b');
    if (b && b.textContent !== String(value)) b.textContent = value;
  }

  // ------------------------------------------------------------------ HUD
  update(data) {
    const { fishing, time, weather, money, equipment, hint = '' } = data;
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    this.setChip('time', time.label);
    this.setChip('weather', weather.label);
    this.setChip('money', money);

    const s = equipment.stats;
    this.gearBox.innerHTML = `
      <h4>Montaje</h4>
      <div class="row"><span>${equipment.rod.name}</span><span>${s.castDistance.toFixed(0)} m</span></div>
      <div class="row"><span>${equipment.reel.name}</span><span>freno ${s.maxDrag.toFixed(1)} kg</span></div>
      <div class="row"><span>${equipment.line.name}</span><span>${s.lineStrength.toFixed(1)} kg</span></div>
      <div class="row"><span>${equipment.lure.name}</span><span>${equipment.lure.workingDepth.toFixed(1)} m</span></div>`;

    const hud = fishing;
    // El panel de tensión sólo importa con el aparejo fuera. En reposo estorba.
    const relevante = hud.state !== FishingState.IDLE && hud.state !== FishingState.AIMING;
    const quiere = relevante && !this._hudHidden ? 'block' : 'none';
    if (this.tensionBox.style.display !== quiere) this.tensionBox.style.display = quiere;
    if (!relevante) { this._updatePrompt(hud); this._updateToast(hud.message); return; }

    const ratio = clamp(hud.tensionRatio, 0, 1);
    const fill = this.tensionBox.querySelector('.t-fill');
    fill.style.width = `${ratio * 100}%`;
    fill.style.background = ratio > 0.82 ? 'var(--bad)' : ratio > 0.55 ? 'var(--warn)' : 'var(--good)';
    this.tensionBox.querySelector('.t-val').textContent = `${hud.tension.toFixed(1)} kg`;
    this.tensionBox.querySelector('.mark').style.left =
      `${clamp(hud.drag / Math.max(0.1, hud.lineStrength), 0, 1) * 100}%`;
    this.tensionBox.querySelector('.d-fill').style.width = `${hud.dragSetting * 100}%`;
    this.tensionBox.querySelector('.d-val').textContent = `${hud.drag.toFixed(1)} kg`;
    this.tensionBox.querySelector('.l-val').textContent =
      `${hud.lineOut.toFixed(0)} / ${hud.capacity} m`;

    // Durante la pelea el jugador necesita ver las dos cuentas atrás que
    // deciden el desenlace: lo que le queda al pez y lo que le queda al
    // anzuelo. Sin esto, perder una captura parece arbitrario.
    const luchando = hud.state === FishingState.FIGHTING && hud.hooked;
    const verPelea = luchando ? 'block' : 'none';
    this.tensionBox.querySelectorAll('.fight-only').forEach((n) => {
      if (n.style.display !== verPelea) n.style.display = verPelea;
    });
    if (luchando) {
      const cansancio = clamp(1 - hud.hooked.stamina, 0, 1);
      const fFill = this.tensionBox.querySelector('.f-fill');
      fFill.style.width = `${cansancio * 100}%`;
      fFill.style.background = cansancio > 0.7 ? 'var(--good)' : 'var(--warn)';
      this.tensionBox.querySelector('.f-val').textContent = `${Math.round(cansancio * 100)} %`;

      const hold = clamp(hud.hooked.hookHold ?? 1, 0, 1);
      const hFill = this.tensionBox.querySelector('.h-fill');
      hFill.style.width = `${hold * 100}%`;
      hFill.style.background = hold < 0.35 ? 'var(--bad)' : hold < 0.65 ? 'var(--warn)' : 'var(--good)';
      this.tensionBox.querySelector('.h-val').textContent = `${Math.round(hold * 100)} %`;
    }

    this._updatePrompt(hud);
    this._updateToast(hud.message);
    if (data.fps !== undefined) {
      this.fpsBox.style.display = 'block';
      this.fpsBox.textContent = `${data.fps} fps · ${data.quality}`;
    } else if (this.fpsBox.style.display !== 'none') {
      this.fpsBox.style.display = 'none';
    }
  }

  _updatePrompt(hud) {
    let html = '';
    switch (hud.state) {
      case FishingState.IDLE:
        html = `<div class="small">Mantén <b>clic izquierdo</b> para cargar el lanzamiento</div>`;
        break;
      case FishingState.AIMING:
        html = `<div class="small">Suelta para lanzar</div>
                <div class="sw-power"><i style="width:${hud.power * 100}%"></i></div>`;
        break;
      case FishingState.CASTING:
        html = `<div class="small">…</div>`;
        break;
      case FishingState.FISHING:
        html = `<div class="small">Mantén <b>clic derecho</b> para recoger · rueda para el freno</div>`;
        break;
      case FishingState.BITE:
        html = `<div class="big bite">¡PICADA!</div><div class="small">Clic izquierdo para clavar</div>`;
        break;
      case FishingState.FIGHTING: {
        const h = hud.hooked;
        const counter = h?.counterPressure ?? 0;
        const side = h?.sidePressure ?? 0;
        let tip, cls;
        if (counter > 0.25) { tip = 'Buena presión lateral · lo estás cansando'; cls = 'good'; }
        else if (counter < -0.25) { tip = 'Estás acompañando su carrera · ladea la caña al otro lado'; cls = 'bad'; }
        else { tip = 'Ladea la caña a un costado del pez para cansarlo'; cls = 'neutral'; }
        const arrow = side > 0.15 ? '▶' : side < -0.15 ? '◀' : '●';
        html = `<div class="small"><b>${h?.name ?? ''}</b> · ${(h?.weight ?? 0).toFixed(2)} kg
                — recoge sin pasarte de tensión</div>
                <div class="side ${cls}"><span class="ar">${arrow}</span> ${tip}</div>`;
        break;
      }
      default:
        html = '';
    }
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  _updateToast(message) {
    if (!message) { this.toast.style.display = 'none'; return; }
    this.toast.style.display = 'block';
    this.toast.textContent = message.text;
    this.toast.className = `sw-toast${message.kind === 'bad' ? ' bad' : ''}`;
  }

  /** Muestra un aviso de aprendizaje; `null` lo retira. */
  showCoach(text) {
    if (!text) { this.coachBox.style.display = 'none'; return; }
    this.coachBox.style.display = 'block';
    this.coachBox.innerHTML = text;
  }

  showWelcome(onStart) {
    const body = el('div', 'help');
    body.innerHTML = `
      <p>Estás en el muelle del <b>Lago de la Niebla</b>, delante de la cabaña de tu abuela.
      Con esto ya puedes pescar:</p>
      <div class="sw-keys" style="margin:12px 0 14px">
        <b>Clic izq. mantenido</b><span>Carga el lanzamiento; al soltar, lanza. Cuanto más cargues, más lejos.</span>
        <b>Clic izq.</b><span>Clavar cuando pique. La ventana es corta.</span>
        <b>Clic der. mantenido</b><span>Recoger. Vigila la tensión: si se dispara, suelta.</span>
        <b>E</b><span>Hablar con la gente y usar lo que tengas delante.</span>
        <b>J</b><span>Diario: qué misión llevas y qué falta.</span>
      </div>
      <p class="sw-hint">Hay tres personas en la orilla esperando a que te presentes.
      <b>Esc</b> muestra todos los controles.</p>`;
    const go = el('button', 'sw-btn sw-cta', 'Empezar a pescar');
    go.style.marginTop = '16px';
    go.addEventListener('click', () => { this.closePanel(); onStart?.(); });
    body.appendChild(go);
    this._overlay('Aguas de Valdés', body, { onClose: onStart });
  }

  /** Funde a negro, ejecuta `during` y vuelve. Para saltos de tiempo. */
  fadeThrough(during, { hold = 620 } = {}) {
    this.fadeBox.classList.add('on');
    setTimeout(() => {
      during?.();
      setTimeout(() => this.fadeBox.classList.remove('on'), 260);
    }, hold);
  }

  setCrosshairVisible(value) {
    this.crosshair.style.display = value ? 'block' : 'none';
  }

  // -------------------------------------------------------------- paneles
  _overlay(title, bodyNode, { onClose = null, placement = 'center' } = {}) {
    this.closePanel();
    const overlay = el('div', `sw-overlay${placement === 'bottom' ? ' bottom' : ''}`);
    const panel = el('div', 'sw-panel');
    const header = el('header');
    header.appendChild(el('h2', null, title));
    const close = el('button', 'sw-close', '&times;');
    close.addEventListener('click', () => { this.closePanel(); onClose?.(); });
    header.appendChild(close);
    const body = el('div', 'body');
    body.appendChild(bodyNode);
    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    this.root.appendChild(overlay);
    this.openPanel = { overlay, onClose };
    this.cb.onPanelOpen?.();
    return { overlay, body };
  }

  closePanel() {
    if (!this.openPanel) return;
    this.root.removeChild(this.openPanel.overlay);
    const cb = this.openPanel.onClose;
    this.openPanel = null;
    this.cb.onPanelClose?.();
    cb?.();
  }

  get isPanelOpen() { return !!this.openPanel; }

  /** Cierra todo lo que puede estar tapando el juego. */
  closeAll() {
    this.closeDialogue();
    this.closePanel();
    this._closeMenu();
  }

  showCatch(fish, result, { onKeep, onRelease }) {
    const body = el('div', 'sw-catch');
    const badges = [];
    if (result.isNew) badges.push('<span class="sw-badge" style="color:var(--accent)">Especie nueva</span>');
    if (result.isRecord) badges.push('<span class="sw-badge" style="color:var(--warn)">Récord personal</span>');
    if (fish.trophy > 0.8) badges.push('<span class="sw-badge" style="color:var(--good)">Ejemplar de trofeo</span>');

    body.innerHTML = `
      <div class="name">${fish.species.name}</div>
      <div class="latin">${fish.species.latin}</div>
      <div class="measures">
        <div>Longitud<b>${fish.length.toFixed(1)} cm</b></div>
        <div>Peso<b>${fish.weight.toFixed(2)} kg</b></div>
        <div>Valor<b>${result.value}</b></div>
      </div>
      <div class="badges">${badges.join('')}</div>`;

    const actions = el('div', 'sw-actions');
    const keep = el('button', 'sw-btn', `Quedárselo · ${result.value} monedas`);
    const release = el('button', 'sw-btn ghost', 'Devolver al agua');
    keep.addEventListener('click', () => { this.closePanel(); onKeep(); });
    release.addEventListener('click', () => { this.closePanel(); onRelease(); });
    actions.appendChild(keep);
    actions.appendChild(release);
    body.appendChild(actions);

    this._overlay('Captura', body, { onClose: onRelease, placement: 'bottom' });
  }

  showGear(inventory, equipment) {
    const body = el('div');
    const render = () => {
      body.innerHTML = '';
      const tabs = el('div', 'sw-tabs');
      Object.keys(CATALOG).forEach((category) => {
        const b = el('button', null, CATEGORY_LABELS[category]);
        b.setAttribute('aria-selected', String(this.gearTab === category));
        b.addEventListener('click', () => { this.gearTab = category; render(); });
        tabs.appendChild(b);
      });
      body.appendChild(tabs);

      inventory.list(this.gearTab).forEach((item) => {
        const equipped = equipment.equipped[this.gearTab] === item.id;
        const row = el('div', `sw-item${equipped ? ' equipped' : ''}`);
        row.innerHTML = `<div><div class="t">${item.name}</div>
          <div class="d">${item.description}</div>
          <div class="stats">${this._itemStats(this.gearTab, item)}</div></div>`;
        const act = el('div', 'act');
        if (equipped) {
          act.appendChild(el('span', 'sw-tag', 'Equipado'));
        } else {
          const b = el('button', 'sw-btn', 'Equipar');
          b.addEventListener('click', () => {
            if (this.cb.onEquip?.(this.gearTab, item.id) !== false) render();
          });
          act.appendChild(b);
        }
        row.appendChild(act);
        body.appendChild(row);
      });
    };
    render();
    this._overlay('Equipo', body);
  }

  _itemStats(category, item) {
    switch (category) {
      case 'rods': return `potencia ${item.power} · resistencia ${item.strength} kg · sensibilidad ${(item.sensitivity * 100).toFixed(0)}%`;
      case 'reels': return `${item.capacity} m · recogida ${item.retrieve} · freno máx ${item.maxDrag} kg`;
      case 'lines': return `${item.strength} kg · ⌀ ${item.diameter} mm · elasticidad ${(item.elasticity * 100).toFixed(0)}%`;
      case 'lures': return `${item.weightG} g · trabaja a ${item.workingDepth} m · acción ${(item.action * 100).toFixed(0)}%`;
      case 'boats': return `${item.speed} m/s · aguanta oleaje ${(item.stability * 100).toFixed(0)}%` +
        (item.troll ? ' · permite curricar' : '');
      default: return '';
    }
  }

  showShop(inventory, economy) {
    const body = el('div');
    const render = () => {
      body.innerHTML = '';
      const money = el('div', 'sw-hint', `Monedas disponibles: <b style="color:var(--warn)">${economy.money}</b>`);
      money.style.marginBottom = '12px';
      body.appendChild(money);

      const tabs = el('div', 'sw-tabs');
      Object.keys(CATALOG).forEach((category) => {
        const b = el('button', null, CATEGORY_LABELS[category]);
        b.setAttribute('aria-selected', String(this.shopTab === category));
        b.addEventListener('click', () => { this.shopTab = category; render(); });
        tabs.appendChild(b);
      });
      body.appendChild(tabs);

      CATALOG[this.shopTab].forEach((item) => {
        const owned = inventory.has(this.shopTab, item.id);
        const row = el('div', `sw-item${owned ? ' equipped' : ''}`);
        row.innerHTML = `<div><div class="t">${item.name}</div>
          <div class="d">${item.description}</div>
          <div class="stats">${this._itemStats(this.shopTab, item)}</div></div>`;
        const act = el('div', 'act');
        if (owned) {
          act.appendChild(el('span', 'sw-tag', 'En propiedad'));
        } else {
          const b = el('button', 'sw-btn', `${item.price}`);
          b.disabled = !economy.canAfford(item.price);
          b.addEventListener('click', () => { this.cb.onBuy?.(this.shopTab, item.id); render(); });
          act.appendChild(b);
        }
        row.appendChild(act);
        body.appendChild(row);
      });
    };
    render();
    this._overlay('Tienda del embarcadero', body);
  }

  showStats(economy, extras = {}) {
    const { totalQuests = 0, totalSpecies = 0, totalZones = 0 } = extras;
    const body = el('div');
    const s = economy.stats;
    const [have, need] = economy.levelProgress;

    const cabecera = el('div', 'sw-hint');
    cabecera.innerHTML = `Nivel <b>${economy.level}</b> · <b>${economy.title}</b> ·
      ${have}/${need} XP hasta el siguiente`;
    cabecera.style.marginBottom = '14px';
    body.appendChild(cabecera);

    const grupos = [
      ['Progreso', [
        ['Nivel', economy.level],
        ['Experiencia', economy.xp],
        ['Misiones completadas', `${s.questsDone ?? 0}${totalQuests ? ` / ${totalQuests}` : ''}`],
        ['Especies descubiertas', `${economy.discovered}${totalSpecies ? ` / ${totalSpecies}` : ''}`],
        ['Aguas visitadas', `${economy.zonesVisited.size}${totalZones ? ` / ${totalZones}` : ''}`],
        ['Monedas ganadas', economy.earned ?? 0]
      ]],
      ['Pesca', [
        ['Lances', s.casts],
        ['Picadas clavadas', s.hooked],
        ['Cobrados', s.landed],
        ['Perdidos', s.lost],
        ['Líneas rotas', s.lineBreaks],
        ['Efectividad', s.hooked ? `${Math.round((s.landed / s.hooked) * 100)}%` : '—']
      ]],
      ['Récords', [
        ['Peso total', `${s.totalWeight.toFixed(1)} kg`],
        ['Mayor captura', `${s.biggest.toFixed(2)} kg`],
        ['Especie del récord', s.biggestSpecies ?? '—'],
        ['Mayor longitud', s.longest ? `${s.longest.toFixed(1)} cm` : '—']
      ]]
    ];
    for (const [titulo, items] of grupos) {
      body.appendChild(el('div', 'sw-chaptitle', titulo));
      const grid = el('div', 'sw-stats');
      items.forEach(([k, v]) => {
        const stat = el('div', 'sw-stat');
        stat.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
        grid.appendChild(stat);
      });
      body.appendChild(grid);
    }
    this._overlay('Estadísticas', body);
  }

  /**
   * Mapa de la cuenca. Cada zona dice qué la abre: dinero y nivel, o la propia
   * historia. Una zona cerrada por historia no se compra: se cuenta qué falta.
   */
  showZones(zones, economy, currentId, extras = {}) {
    const { quests = null, lockReason = () => null, speciesKnown = () => 0 } = extras;
    const body = el('div');
    const render = () => {
      body.innerHTML = '';
      const money = el('div', 'sw-hint',
        `Monedas: <b style="color:var(--warn)">${economy.money}</b> · Nivel <b>${economy.level}</b> (${economy.title})`);
      money.style.marginBottom = '12px';
      body.appendChild(money);

      zones.forEach((zone) => {
        const unlocked = economy.unlockedZones.includes(zone.id);
        const here = zone.id === currentId;
        const visited = economy.zonesVisited.has(zone.id);
        const motivo = lockReason(zone, economy, quests);
        const row = el('div', `sw-item${here ? ' equipped' : ''}`);
        const conocidas = speciesKnown(zone);
        const detalle = visited
          ? `${conocidas}/${zone.species.length} especies registradas · hasta ${zone.terrain.maxDepth} m`
          : `${zone.species.length} especies · hasta ${zone.terrain.maxDepth} m de calado`;
        row.innerHTML = `<div><div class="t">${zone.name}</div>
          <div class="d">${zone.description}</div>
          <div class="stats">${detalle}</div></div>`;
        const act = el('div', 'act');
        if (here) {
          act.appendChild(el('span', 'sw-tag', 'Estás aquí'));
        } else if (unlocked) {
          const go = el('button', 'sw-btn', 'Viajar');
          go.addEventListener('click', () => this.cb.onTravel?.(zone.id));
          act.appendChild(go);
        } else if (motivo) {
          const tag = el('span', 'sw-tag', motivo);
          tag.style.color = 'var(--dim)';
          tag.style.maxWidth = '150px';
          tag.style.textAlign = 'right';
          act.appendChild(tag);
        } else {
          const buy = el('button', 'sw-btn', `Permiso · ${zone.price}`);
          buy.disabled = !economy.canAfford(zone.price);
          buy.addEventListener('click', () => {
            if (this.cb.onUnlockZone?.(zone.id)) render();
          });
          act.appendChild(buy);
        }
        row.appendChild(act);
        body.appendChild(row);
      });
    };
    render();
    this._overlay('Cuenca de Valdés', body);
  }

  // ------------------------------------------------------------- narrativa
  /**
   * Caja de diálogo. Pasa las líneas una a una con clic o espacio, y al final
   * muestra las opciones (aceptar misión, entregar, tienda, despedirse).
   *
   * No es un panel modal como los demás: el mundo se sigue viendo detrás,
   * porque el personaje está delante del jugador y hay que verlo gesticular.
   */
  showDialogue({ name, role, lines, options = [], onAdvance = null, onClose = null }) {
    this.closeDialogue();
    const box = el('div', 'sw-dialogue');
    box.innerHTML = `<div class="who">${name}${role ? `<span>${role}</span>` : ''}</div>
      <div class="line"></div>
      <div class="foot"><div class="sw-choices"></div><div class="adv"></div></div>`;
    const lineNode = box.querySelector('.line');
    const choices = box.querySelector('.sw-choices');
    const adv = box.querySelector('.adv');
    this.root.appendChild(box);
    this._setHudVisible(false);

    let index = 0;
    const paint = () => {
      lineNode.innerHTML = lines[index] ?? '';
      const last = index >= lines.length - 1;
      adv.textContent = last ? '' : `Clic o espacio · ${index + 1}/${lines.length}`;
      choices.innerHTML = '';
      if (!last) return;
      options.forEach((opt, i) => {
        const b = el('button', i === 0 ? 'primary' : null, opt.label);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (opt.keepOpen) { opt.action?.(); return; }
          this.closeDialogue();
          opt.action?.();
        });
        choices.appendChild(b);
      });
      if (!options.length) {
        const b = el('button', 'primary', 'Cerrar');
        b.addEventListener('click', () => this.closeDialogue());
        choices.appendChild(b);
      }
    };
    this.dialogue = {
      box, onClose,
      advance: () => {
        if (index < lines.length - 1) { index++; paint(); onAdvance?.(index); return true; }
        return false;
      }
    };
    box.addEventListener('click', () => this.dialogue?.advance());
    paint();
    this.cb.onDialogueOpen?.();
    return this.dialogue;
  }

  advanceDialogue() { return this.dialogue?.advance() ?? false; }

  /**
   * Durante una conversación el HUD estorba: tapa al personaje y compite con
   * el texto. Se apaga todo menos la barra superior, que da contexto.
   */
  _setHudVisible(on, { topbar = true } = {}) {
    const v = on ? '' : 'none';
    if (!topbar || on) this.topbar.style.display = on ? '' : 'none';
    this.gearBox.style.display = v;
    this.hint.style.display = v;
    this.prompt.style.display = v;
    this.crosshair.style.display = v;
    this._hudHidden = !on;
    if (!on) {
      this.tensionBox.style.display = 'none';
      this.trackBox.style.display = 'none';
      this.eventBox.style.display = 'none';
    }
  }

  get isDialogueOpen() { return !!this.dialogue; }

  closeDialogue() {
    if (!this.dialogue) return;
    const cb = this.dialogue.onClose;
    this.root.removeChild(this.dialogue.box);
    this.dialogue = null;
    this._setHudVisible(true);
    cb?.();
    this.cb.onDialogueClose?.();
  }

  /** Aviso efímero en el centro: objetivo cumplido, nivel, página encontrada. */
  note(text, kind = '') {
    const node = el('div', `sw-note${kind ? ' ' + kind : ''}`, text);
    this.notes.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity .5s ease';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 520);
    }, 3400);
    while (this.notes.children.length > 4) this.notes.firstChild.remove();
  }

  /** Recuadro de seguimiento de la misión en curso. */
  /** Aviso del suceso en curso. Vacío lo esconde. */
  setWorldEvent(text) {
    const quiere = text && !this._hudHidden ? 'block' : 'none';
    if (this.eventBox.style.display !== quiere) this.eventBox.style.display = quiere;
    if (text && this.eventBox.textContent !== text) this.eventBox.textContent = text;
  }

  setTrackedQuest(quest, quests, zoneName) {
    if (!quest || this._hudHidden) {
      if (this.trackBox.style.display !== 'none') this.trackBox.style.display = 'none';
      return;
    }
    const counters = quests.counters(quest.id);
    const objetivos = quest.objectives.map((o, i) => {
      const need = o.count ?? 1;
      const have = Math.min(counters[i], need);
      const done = have >= need;
      const cifra = need > 1 ? `<b>${have}/${need}</b>` : (done ? '<b>✓</b>' : '');
      return `<div class="o${done ? ' done' : ''}"><span>${o.label}</span>${cifra}</div>`;
    }).join('');
    const html = `<div class="k">Misión en curso</div>
      <div class="t">${quest.title}</div>${objetivos}
      ${quest.hint ? `<div class="where">${quest.hint}</div>` : ''}`;
    if (this.trackBox.innerHTML !== html) this.trackBox.innerHTML = html;
    if (this.trackBox.style.display !== 'block') this.trackBox.style.display = 'block';
  }

  /** Diario de misiones, agrupado por capítulo. */
  showQuests(quests, storyData) {
    const { QUESTS, CHAPTERS, QUEST_TYPE_LABEL, NPCS } = storyData;
    const body = el('div');
    const render = () => {
      body.innerHTML = '';
      const resumen = el('div', 'sw-hint');
      const hechas = QUESTS.filter((q) => quests.completed.has(q.id)).length;
      resumen.innerHTML = `<b>${hechas}/${QUESTS.length}</b> misiones completadas ·
        <b>${quests.pages.length}/5</b> páginas del cuaderno de Remedios`;
      resumen.style.marginBottom = '14px';
      body.appendChild(resumen);

      let algo = false;
      for (const chapter of CHAPTERS) {
        const visibles = QUESTS.filter((q) => q.chapter === chapter.id &&
          quests.stateOf(q.id) !== 'bloqueada');
        if (!visibles.length) continue;
        algo = true;
        body.appendChild(el('div', 'sw-chaptitle',
          `Capítulo ${chapter.id} · ${chapter.title} — ${chapter.subtitle}`));
        for (const q of visibles) {
          const state = quests.stateOf(q.id);
          const done = state === 'completada';
          const card = el('div', `sw-quest${done ? ' done' : ''}${quests.tracked === q.id ? ' tracked' : ''}`);
          const counters = quests.counters(q.id);
          const objetivos = done ? '' : q.objectives.map((o, i) => {
            const need = o.count ?? 1;
            const have = Math.min(counters[i], need);
            return `<div class="obj${have >= need ? ' ok' : ''}"><span>${o.label}</span><b>${have}/${need}</b></div>`;
          }).join('');
          const rw = q.reward ?? {};
          const premios = [
            rw.money ? `${rw.money} monedas` : null,
            rw.xp ? `${rw.xp} XP` : null,
            rw.item ? 'objeto' : null,
            rw.page ? `página ${rw.page}` : null,
            rw.unlockZone ? 'zona nueva' : null
          ].filter(Boolean).join(' · ');
          const estado = done ? 'Completada'
            : state === 'porEntregar' ? `Vuelve con ${NPCS[q.turnIn]?.name ?? '—'}`
            : state === 'disponible' ? `Habla con ${NPCS[q.npc]?.name ?? '—'}` : 'En curso';
          card.innerHTML = `<div class="head"><div>
              <div class="t">${q.title}</div>
              <div class="meta">${QUEST_TYPE_LABEL[q.type] ?? q.type} · ${estado}</div>
            </div></div>
            <div class="d">${q.summary}</div>${objetivos}
            ${!done && q.hint ? `<div class="hint">${q.hint}</div>` : ''}
            ${premios && !done ? `<div class="rw">Recompensa: ${premios}</div>` : ''}`;
          if (state === 'activa' || state === 'porEntregar') {
            const b = el('button', 'sw-btn ghost', quests.tracked === q.id ? 'Siguiendo' : 'Seguir');
            b.style.marginTop = '9px';
            b.addEventListener('click', () => {
              quests.track(quests.tracked === q.id ? null : q.id);
              render();
            });
            card.appendChild(b);
          }
          body.appendChild(card);
        }
      }
      if (!algo) body.appendChild(el('div', 'sw-hint', 'Todavía no has hablado con nadie. Busca a alguien en el embarcadero.'));
    };
    render();
    this._overlay('Diario', body);
  }

  /**
   * Enciclopedia de peces. Lo que no se ha capturado sale en gris y sin datos:
   * la ficha es la recompensa de haberlo pescado.
   */
  showJournal(economy, species, extras = {}) {
    const { RARITY_LABEL = {}, zonesOf = () => [], lureName = (x) => x } = extras;
    const body = el('div');
    const total = species.length;
    const vistas = species.filter((s) => economy.records[s.id]?.count).length;

    const resumen = el('div', 'sw-hint');
    resumen.innerHTML = `<b>${vistas}/${total}</b> especies registradas. Cada ficha se completa al cobrar el primer ejemplar.`;
    resumen.style.marginBottom = '14px';
    body.appendChild(resumen);

    const grid = el('div', 'sw-grid');
    grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(232px,1fr))';
    species.forEach((sp) => {
      const rec = economy.records[sp.id];
      const known = !!rec?.count;
      const card = el('div', `sw-fish${known ? '' : ' unknown'}`);
      if (!known) {
        card.innerHTML = `<div class="t"><span class="sw-swatch" style="background:#3a4148"></span>
          <span>Sin descubrir</span><span class="r ${sp.rarity}">${RARITY_LABEL[sp.rarity] ?? sp.rarity}</span></div>
          <div class="lat">Cóbrala una vez para abrir su ficha</div>`;
        grid.appendChild(card);
        return;
      }
      const zonas = zonesOf(sp.id);
      const mejores = Object.entries(sp.lures).sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([id]) => lureName(id)).join(', ');
      const horas = Object.entries(sp.activity).sort((a, b) => b[1] - a[1])[0][0];
      const horaLabel = { madrugada: 'Madrugada', manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' }[horas];
      card.innerHTML = `<div class="t">
          <span class="sw-swatch" style="background:#${sp.color.toString(16).padStart(6, '0')}"></span>
          <span>${sp.name}</span><span class="r ${sp.rarity}">${RARITY_LABEL[sp.rarity] ?? sp.rarity}</span></div>
        <div class="lat">${sp.latin}</div>
        <div class="g">
          <span>Talla</span><b>${sp.lengthRange[0]}–${sp.lengthRange[1]} cm</b>
          <span>Calado</span><b>${sp.depth[0]}–${sp.depth[1]} m</b>
          <span>Actividad</span><b>${horaLabel}</b>
          <span>Señuelos</span><b>${mejores}</b>
          <span>Dónde</span><b>${zonas.join(', ') || '—'}</b>
          <span>Capturas</span><b>${rec.count}</b>
          <span>Tu récord</span><b>${rec.bestLength.toFixed(1)} cm · ${rec.bestWeight.toFixed(2)} kg</b>
        </div>`;
      grid.appendChild(card);
    });
    body.appendChild(grid);
    this._overlay('Enciclopedia de peces', body);
  }

  /** Menú principal. `save` es null en partida nueva. */
  showMainMenu({ save, onContinue, onNew, onSettings }) {
    this.closePanel();
    const menu = el('div', 'sw-menu');
    menu.innerHTML = `<h1>Aguas de Valdés</h1><div class="sub">El cuaderno de Remedios</div>`;
    const acts = el('div', 'acts');
    if (save) {
      const cont = el('button', 'sw-btn', 'Continuar');
      cont.addEventListener('click', () => { this._closeMenu(); onContinue(); });
      acts.appendChild(cont);
    }
    const nuevo = el('button', `sw-btn${save ? ' ghost' : ''}`, save ? 'Partida nueva' : 'Empezar');
    nuevo.addEventListener('click', () => {
      if (save && !nuevo.dataset.confirm) {
        nuevo.dataset.confirm = '1';
        nuevo.textContent = '¿Seguro? Se borra la partida';
        return;
      }
      this._closeMenu(); onNew();
    });
    acts.appendChild(nuevo);
    const cfg = el('button', 'sw-btn ghost', 'Ajustes');
    cfg.addEventListener('click', () => onSettings());
    acts.appendChild(cfg);
    menu.appendChild(acts);

    if (save) {
      const info = el('div', 'save');
      info.innerHTML = `Nivel ${save.level} · ${save.money} monedas · ${save.species} especies<br>${save.zone}`;
      menu.appendChild(info);
    }
    this.root.appendChild(menu);
    this.menu = menu;
    this._setHudVisible(false, { topbar: false });
    this.setCrosshairVisible(false);
  }

  _closeMenu() {
    if (!this.menu) return;
    this.root.removeChild(this.menu);
    this.menu = null;
    this._setHudVisible(true);
    this.setCrosshairVisible(true);
  }

  get isMenuOpen() { return !!this.menu; }

  /** Prólogo: se lee una vez, al empezar de cero. */
  showPrologue(lines, onDone) {
    this.closePanel();
    const menu = el('div', 'sw-menu');
    const text = el('div', 'sw-prologue', lines.map((l) => `<p style="margin-bottom:14px">${l}</p>`).join(''));
    menu.appendChild(text);
    const b = el('button', 'sw-btn', 'Empezar');
    b.style.padding = '12px 34px';
    b.addEventListener('click', () => { this._closeMenu(); onDone(); });
    menu.appendChild(b);
    this.root.appendChild(menu);
    this.menu = menu;
    this._setHudVisible(false, { topbar: false });
    this.setCrosshairVisible(false);
  }

  showSettings(settings) {
    const body = el('div');
    const quality = el('div', 'sw-field');
    quality.innerHTML = '<label>Calidad gráfica</label>';
    const buttons = el('div', 'sw-tabs');
    buttons.style.margin = '0';
    Object.entries(QUALITY_PRESETS).forEach(([key, preset]) => {
      const b = el('button', null, preset.label);
      b.setAttribute('aria-selected', String(settings.quality === key));
      b.addEventListener('click', () => {
        this.cb.onSetting?.('quality', key);
        [...buttons.children].forEach((c) => c.setAttribute('aria-selected', String(c === b)));
      });
      buttons.appendChild(b);
    });
    quality.appendChild(buttons);
    body.appendChild(quality);

    const slider = (label, key, min, max, step, value, format) => {
      const field = el('div', 'sw-field');
      field.innerHTML = `<label>${label}</label>`;
      const wrap = el('div');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step; input.value = value;
      const out = el('span', null, format(value));
      out.style.cssText = 'margin-left:10px;color:var(--dim);font-size:12px';
      input.addEventListener('input', () => {
        out.textContent = format(Number(input.value));
        this.cb.onSetting?.(key, Number(input.value));
      });
      wrap.appendChild(input);
      wrap.appendChild(out);
      field.appendChild(wrap);
      body.appendChild(field);
    };
    slider('Campo de visión', 'fov', 55, 100, 1, settings.fov, (v) => `${v}°`);
    slider('Sensibilidad', 'sensitivity', 0.2, 3, 0.1, settings.sensitivity, (v) => v.toFixed(1));
    slider('Volumen general', 'masterVolume', 0, 1, 0.05, settings.masterVolume, (v) => `${Math.round(v * 100)}%`);
    slider('Música', 'musicVolume', 0, 1, 0.05, settings.musicVolume ?? 0.5, (v) => `${Math.round(v * 100)}%`);

    const toggle = (label, key, value, note) => {
      const field = el('div', 'sw-field');
      field.innerHTML = `<label>${label}${note ? `<div class="sw-hint" style="margin-top:2px">${note}</div>` : ''}</label>`;
      const btn = el('button', 'sw-btn' + (value ? '' : ' ghost'), value ? 'Activado' : 'Desactivado');
      btn.addEventListener('click', () => {
        const next = btn.textContent === 'Desactivado';
        btn.textContent = next ? 'Activado' : 'Desactivado';
        btn.className = 'sw-btn' + (next ? '' : ' ghost');
        this.cb.onSetting?.(key, next);
      });
      field.appendChild(btn);
      body.appendChild(field);
    };
    toggle('Calidad automática', 'autoQuality', settings.autoQuality !== false,
      'Baja la calidad sola si el juego no va fluido, y la sube si sobra margen.');
    toggle('Mostrar fps', 'showFps', !!settings.showFps);

    const hint = el('div', 'sw-hint');
    hint.style.marginTop = '14px';
    hint.innerHTML = 'Elegir calidad a mano desactiva el ajuste automático.';
    body.appendChild(hint);

    this._overlay('Configuración', body);
  }

  showPause({ onResume, onSave, onSettings, onMenu, onReset }) {
    const body = el('div');
    const keys = el('div', 'sw-keys');
    keys.innerHTML = `
      <b>WASD</b><span>Moverse (Mayús para correr)</span>
      <b>Ratón</b><span>Mirar</span>
      <b>Clic izq. (mantener)</b><span>Cargar y lanzar</span>
      <b>Clic izq.</b><span>Clavar durante la picada</span>
      <b>Clic der. (mantener)</b><span>Recoger carrete</span>
      <b>Rueda</b><span>Ajustar el freno</span>
      <b>R</b><span>Recoger el sedal</span>
      <b>Tab</b><span>Equipo</span>
      <b>B</b><span>Tienda</span>
      <b>C</b><span>Enciclopedia de peces</span>
      <b>J</b><span>Diario de misiones</span>
      <b>Z</b><span>Mapa de la cuenca</span>
      <b>E</b><span>Hablar, interactuar, barca</span>
      <b>Q</b><span>Guardar o sacar la caña</span>
      <b>G</b><span>Estadísticas</span>
      <b>F</b><span>Cambiar cámara</span>
      <b>Esc</b><span>Pausa</span>`;
    body.appendChild(keys);

    const actions = el('div', 'sw-actions');
    actions.style.cssText = 'margin-top:18px;flex-wrap:wrap';
    const mk = (label, cls, fn) => {
      const b = el('button', `sw-btn${cls}`, label);
      b.addEventListener('click', fn);
      return b;
    };
    actions.appendChild(mk('Continuar', '', () => { this.closePanel(); onResume(); }));
    actions.appendChild(mk('Guardar', ' ghost', onSave));
    actions.appendChild(mk('Configuración', ' ghost', () => { this.closePanel(); onSettings(); }));
    actions.appendChild(mk('Menú principal', ' ghost', () => { this.closePanel(); onMenu?.(); }));
    actions.appendChild(mk('Empezar de cero', ' ghost', onReset));
    body.appendChild(actions);

    this._overlay('Pausa', body, { onClose: onResume });
  }
}
