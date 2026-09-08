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
.sw-prompt .bite { color: var(--warn); animation: swpulse .45s ease-in-out infinite alternate; }
@keyframes swpulse { from { transform: scale(1); } to { transform: scale(1.05); } }
.sw-power { width: 260px; height: 10px; margin: 8px auto 0; border-radius: 99px;
  background: rgba(0,0,0,.55); border: 1px solid var(--edge); overflow: hidden; }
.sw-power i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--accent), var(--warn)); }

.sw-hintline { position: absolute; left: 50%; top: calc(50% + 28px); transform: translateX(-50%);
  font-size: 12.5px; font-weight: 550; color: #dbe7ee; text-shadow: 0 2px 8px rgba(0,0,0,.95);
  letter-spacing: .01em; }
.sw-toast { position: absolute; left: 50%; top: 90px; transform: translateX(-50%);
  background: var(--panel); border: 1px solid var(--edge); border-radius: 8px; padding: 8px 15px; font-size: 13px; }
.sw-toast.bad { border-color: rgba(226,96,74,.6); color: #ffc9bd; }

.sw-overlay { position: absolute; inset: 0; background: rgba(6,10,13,.82); backdrop-filter: blur(7px);
  display: flex; align-items: center; justify-content: center; pointer-events: auto; padding: 22px; }
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
      money: this._chip('Monedas', '60')
    };
    this.chips.money.classList.add('sw-money');
    Object.values(this.chips).forEach((c) => this.topbar.appendChild(c));
    this.root.appendChild(this.topbar);

    this.gearBox = el('div', 'sw-gear');
    this.root.appendChild(this.gearBox);

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
      </div>`;
    this.root.appendChild(this.tensionBox);

    this.prompt = el('div', 'sw-prompt');
    this.root.appendChild(this.prompt);

    this.hint = el('div', 'sw-hintline');
    this.root.appendChild(this.hint);

    this.toast = el('div', 'sw-toast');
    this.toast.style.display = 'none';
    this.root.appendChild(this.toast);
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

    this._updatePrompt(hud);
    this._updateToast(hud.message);
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
      case FishingState.FIGHTING:
        html = `<div class="small"><b>${hud.hooked?.name ?? ''}</b> · ${(hud.hooked?.weight ?? 0).toFixed(2)} kg
                — recoge sin pasarte de tensión</div>`;
        break;
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

  setCrosshairVisible(value) {
    this.crosshair.style.display = value ? 'block' : 'none';
  }

  // -------------------------------------------------------------- paneles
  _overlay(title, bodyNode, { onClose = null } = {}) {
    this.closePanel();
    const overlay = el('div', 'sw-overlay');
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

    this._overlay('Captura', body, { onClose: onRelease });
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
          b.addEventListener('click', () => { this.cb.onEquip?.(this.gearTab, item.id); render(); });
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

  showRecords(economy) {
    const body = el('div');
    const grid = el('div', 'sw-grid');
    SPECIES.forEach((species) => {
      const record = economy.records[species.id];
      const card = el('div', `sw-card${record ? '' : ' unknown'}`);
      card.innerHTML = record
        ? `<div class="t">${species.name}</div>
           <div class="m">${record.count} capturas · récord ${record.bestLength.toFixed(1)} cm / ${record.bestWeight.toFixed(2)} kg</div>`
        : `<div class="t">? ? ?</div><div class="m">Sin capturar</div>`;
      grid.appendChild(card);
    });
    body.appendChild(grid);
    this._overlay(`Capturas · ${economy.discovered}/${economy.speciesTotal}`, body);
  }

  showStats(economy) {
    const body = el('div', 'sw-stats');
    const s = economy.stats;
    const items = [
      ['Lances', s.casts],
      ['Picadas clavadas', s.hooked],
      ['Cobrados', s.landed],
      ['Perdidos', s.lost],
      ['Líneas rotas', s.lineBreaks],
      ['Peso total', `${s.totalWeight.toFixed(1)} kg`],
      ['Mayor captura', `${s.biggest.toFixed(2)} kg`],
      ['Efectividad', s.hooked ? `${Math.round((s.landed / s.hooked) * 100)}%` : '—']
    ];
    items.forEach(([k, v]) => {
      const stat = el('div', 'sw-stat');
      stat.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
      body.appendChild(stat);
    });
    this._overlay('Estadísticas', body);
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
    slider('Volumen', 'masterVolume', 0, 1, 0.05, settings.masterVolume, (v) => `${Math.round(v * 100)}%`);

    const hint = el('div', 'sw-hint');
    hint.style.marginTop = '14px';
    hint.innerHTML = 'La calidad se aplica al reiniciar el mundo desde el menú de pausa.';
    body.appendChild(hint);

    this._overlay('Configuración', body);
  }

  showPause({ onResume, onSave, onSettings, onReset }) {
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
      <b>C</b><span>Capturas</span>
      <b>G</b><span>Estadísticas</span>
      <b>F</b><span>Cambiar cámara</span>
      <b>Esc</b><span>Pausa</span>`;
    body.appendChild(keys);

    const actions = el('div', 'sw-actions');
    actions.style.marginTop = '18px';
    const mk = (label, cls, fn) => {
      const b = el('button', `sw-btn${cls}`, label);
      b.addEventListener('click', fn);
      return b;
    };
    actions.appendChild(mk('Continuar', '', () => { this.closePanel(); onResume(); }));
    actions.appendChild(mk('Guardar', ' ghost', onSave));
    actions.appendChild(mk('Configuración', ' ghost', () => { this.closePanel(); onSettings(); }));
    actions.appendChild(mk('Empezar de cero', ' ghost', onReset));
    body.appendChild(actions);

    this._overlay('Pausa', body, { onClose: onResume });
  }
}
