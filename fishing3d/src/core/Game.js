import * as THREE from 'three';

import { Input } from './Input.js';
import { SaveSystem } from './SaveSystem.js';
import { DEFAULT_SETTINGS, presetFor } from './Settings.js';
import { clamp } from './MathUtils.js';

import { TextureLibrary } from '../world/Textures.js';
import { Terrain } from '../world/Terrain.js';
import { WaterBody } from '../world/WaterBody.js';
import { SkyDome } from '../world/SkyDome.js';
import { Vegetation } from '../world/Vegetation.js';
import { Props } from '../world/Props.js';

import { TimeOfDay } from '../weather/TimeOfDay.js';
import { Weather } from '../weather/Weather.js';

import { Player } from '../player/Player.js';
import { FishManager } from '../fish/FishManager.js';
import { FishingSystem, FishingState } from '../fishing/FishingSystem.js';

import { Inventory } from '../gear/Inventory.js';
import { Equipment } from '../gear/Equipment.js';
import { Economy } from '../economy/Economy.js';

import { UI } from '../ui/UI.js';
import { AudioSystem } from '../audio/AudioSystem.js';

/**
 * Orquestador.
 *
 * Construye los sistemas, los conecta y ejecuta el bucle. Ningún sistema
 * conoce a los demás: el Game les pasa cada frame el contexto que necesitan
 * (hora, viento, posición del jugador…) y reparte los eventos.
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.save = new SaveSystem();
    this.settings = { ...DEFAULT_SETTINGS, ...(this.save.load()?.settings || {}) };
    this.preset = presetFor(this.settings);
    this.clock = new THREE.Clock();
    this.running = false;
    this.paused = false;
    this.autosaveTimer = 0;
    this.footstepTimer = 0;

    this._initRenderer();
    this._initWorld();
    this._initPlayer();
    this._initProgress();
    this._initFishing();
    this._initUI();
    this._bindInput();
    this._loadProgress();
  }

  // --------------------------------------------------------------- montaje
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.preset.antialias,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.preset.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // El cielo de Preetham emite valores muy altos: con exposición 1 se
    // satura a blanco y el lago lo refleja como una lámina de leche.
    this.renderer.toneMappingExposure = 0.34;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov, window.innerWidth / window.innerHeight, 0.08, 5000
    );

    window.addEventListener('resize', () => this._resize());
  }

  _initWorld() {
    this.textures = new TextureLibrary();
    this.time = new TimeOfDay({ hour: 9.4 });

    this.terrain = new Terrain(this.textures, { resolution: 300 });
    this.scene.add(this.terrain.mesh);

    this.water = new WaterBody(this.textures, {
      reflectionSize: this.preset.waterReflection,
      sunDirection: this.time.sunDirection
    });
    this.water.addTo(this.scene);

    this.sky = new SkyDome(this.scene, this.textures, this.preset);
    this.weather = new Weather(this.scene, this.textures, this.preset);
    this.vegetation = new Vegetation(this.scene, this.terrain, this.textures, this.preset);
    this.props = new Props(this.scene, this.terrain, this.textures, this.preset);
  }

  _initPlayer() {
    const spot = this.props.fishingSpots[0];
    const spawn = spot.position.clone().add(new THREE.Vector3(0, 0, 0));
    this.player = new Player(this.camera, this.terrain, {
      spawn,
      walkables: [this.props.group]
    });
    this.scene.add(this.player.rig);
    // Mirando al centro del lago.
    this.player.yaw = Math.atan2(-spawn.x, -spawn.z) + Math.PI;
    this.fishManager = new FishManager(this.scene, this.terrain);
  }

  _initProgress() {
    this.inventory = new Inventory();
    this.equipment = new Equipment(this.inventory);
    this.economy = new Economy();
  }

  _initFishing() {
    this.audio = new AudioSystem();
    this.fishing = new FishingSystem({
      scene: this.scene,
      camera: this.camera,
      terrain: this.terrain,
      water: this.water,
      fishManager: this.fishManager,
      equipment: this.equipment,
      events: {
        onCast: () => { this.economy.stats.casts++; this.audio.cast(); },
        onSplash: (p) => this.audio.splash(0.9),
        onBite: () => this.audio.bite(),
        onHookSet: () => { this.economy.stats.hooked++; this.audio.hookSet(); },
        onDragSlip: () => { if (Math.random() < 0.35) this.audio.dragSlip(); },
        onJump: (fish) => this.water.splash(fish.position, 1.1),
        onLineBreak: () => { this.economy.stats.lineBreaks++; this.economy.stats.lost++; this.audio.lineBreak(); },
        onFishLost: () => { this.economy.stats.lost++; },
        onLanded: (fish) => this._onLanded(fish)
      }
    });
  }

  _initUI() {
    this.ui = new UI({
      onEquip: (category, id) => { this.equipment.equip(category, id); this._persist(); },
      onBuy: (category, id) => {
        if (this.economy.buy(category, id)) {
          this.inventory.add(category, id);
          this.audio.coin();
          this._persist();
        }
      },
      onSetting: (key, value) => this._applySetting(key, value),
      onPanelOpen: () => { this.input.releaseLock(); this.ui.setCrosshairVisible(false); },
      onPanelClose: () => { this.ui.setCrosshairVisible(true); }
    });
  }

  _bindInput() {
    this.input = new Input(this.canvas);

    this.canvas.addEventListener('click', () => {
      if (!this.ui.isPanelOpen && !this.input.locked) {
        this.audio.init();
        this.input.requestLock();
      }
    });

    this.input.on('pointerdown', (e) => {
      if (this.ui.isPanelOpen || !this.input.locked) return;
      if (e.button === 0) {
        if (this.fishing.state === FishingState.BITE) this.fishing.strike();
        else this.fishing.beginCast();
      }
    });
    this.input.on('pointerup', (e) => {
      if (e.button === 0) this.fishing.releaseCast();
    });

    this.input.on('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'Escape': this._togglePause(); break;
        case 'Tab': this._panel(() => this.ui.showGear(this.inventory, this.equipment)); break;
        case 'KeyB': this._panel(() => this.ui.showShop(this.inventory, this.economy)); break;
        case 'KeyC': this._panel(() => this.ui.showRecords(this.economy)); break;
        case 'KeyG': this._panel(() => this.ui.showStats(this.economy)); break;
        case 'KeyR': if (!this.ui.isPanelOpen) this.fishing.reelIn(); break;
        case 'KeyF':
          this.player.setCameraMode(this.player.mode === 'first' ? 'third' : 'first');
          this.fishing.rod.setVisible(this.player.mode === 'first');
          break;
        default: break;
      }
    });
  }

  _panel(open) {
    if (this.ui.isPanelOpen) { this.ui.closePanel(); return; }
    open();
  }

  _togglePause() {
    if (this.ui.isPanelOpen) { this.ui.closePanel(); return; }
    this.ui.showPause({
      onResume: () => {},
      onSave: () => { this._persist(); this.fishing._say('Partida guardada'); },
      onSettings: () => this.ui.showSettings(this.settings),
      onReset: () => {
        this.save.clear();
        window.location.reload();
      }
    });
  }

  // -------------------------------------------------------------- eventos
  _onLanded(fish) {
    this.audio.landed();
    const result = this.economy.registerCatch(fish);
    this.ui.showCatch(fish, result, {
      onKeep: () => {
        this.economy.sell(result.value);
        this.audio.coin();
        this.fishing.finishCatch(true);
        this._persist();
      },
      onRelease: () => {
        this.fishing.finishCatch(false);
        this._persist();
      }
    });
  }

  _applySetting(key, value) {
    this.settings[key] = value;
    if (key === 'fov') {
      this.camera.fov = value;
      this.camera.updateProjectionMatrix();
    }
    if (key === 'masterVolume') this.audio.setVolume(value);
    this._persist();
  }

  // ----------------------------------------------------------- persistencia
  _persist() {
    this.save.save({
      settings: this.settings,
      inventory: this.inventory.toJSON(),
      equipment: this.equipment.toJSON(),
      economy: this.economy.toJSON(),
      world: { hour: this.time.hour, weather: this.weather.current }
    });
  }

  _loadProgress() {
    const data = this.save.load();
    if (!data) return;
    this.inventory = Inventory.fromJSON(data.inventory);
    this.equipment = Equipment.fromJSON(this.inventory, data.equipment);
    this.economy = new Economy(data.economy);
    this.fishing.equipment = this.equipment;
    if (data.world?.hour !== undefined) this.time.setHour(data.world.hour);
    if (data.world?.weather) this.weather.setWeather(data.world.weather);
    this.audio.setVolume(this.settings.masterVolume);
  }

  // ---------------------------------------------------------------- bucle
  start() {
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.simulate(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Un paso de simulación, independiente del dibujado.
   *
   * Separarlo permite ejecutar el juego a velocidad de cálculo (pruebas
   * automáticas, ajuste de equilibrio) sin pasar por la GPU, y deja la puerta
   * abierta a un paso fijo si en el futuro hace falta determinismo.
   */
  simulate(dt, { headless = false } = {}) {
    const panelOpen = this.ui.isPanelOpen;
    const controllable = headless || (!panelOpen && this.input.locked);

    if (controllable && !headless) {
      const mouse = this.input.consumeMouseDelta();
      this.player.look(mouse.dx, mouse.dy, this.settings.sensitivity, this.settings.invertY);
      if (mouse.wheel) this.fishing.adjustDrag(-mouse.wheel * 0.06);
      this.fishing.setRetrieve(this.input.mouse.right ? 1 : 0);
    } else if (!headless) {
      this.input.consumeMouseDelta();
      this.fishing.setRetrieve(0);
    }

    const moving = controllable && !headless
      ? this.player.update(dt, this.input)
      : { speed: 0, surface: this.player.surface, depth: 0 };

    this.time.update(panelOpen ? 0 : dt);
    this.weather.update(dt, this.player.position, this.time.fogColor);
    this.sky.update(this.time, this.weather, dt, this.player.position);

    const wind = new THREE.Vector3(
      this.weather.windDirection.x, 0, this.weather.windDirection.y
    ).multiplyScalar(this.weather.windSpeed);

    this.water.update(dt, {
      sunDirection: this.time.sunDirection,
      sunColor: this.time.sunColor,
      waterColor: new THREE.Color(0x0d2630).lerp(this.time.skyColor, 0.16),
      choppiness: this.weather.choppiness
    });
    this.vegetation.update(dt, wind, this.player.position);

    const context = {
      terrain: this.terrain,
      hour: this.time.hour,
      time: this.clock.elapsedTime,
      weatherModifier: this.weather.biteModifier,
      feeding: this.time.feedingFactor,
      wind,
      lookDelta: this.player.lookDelta,
      cameraPosition: this.player.position,
      lurePosition: this.fishing.lure.isFishable ? this.fishing.lure.position : null,
      lureAction: this.fishing.lure.action,
      onBite: () => {},
      onSpit: () => {}
    };

    if (!panelOpen) {
      this.fishing.update(dt, context);
      this.fishManager.update(dt, context);
    }

    if (!headless) {
      this._updateAudio(dt, moving);
      this.ui.update({
        fishing: this.fishing.hud,
        time: this.time,
        weather: this.weather,
        money: this.economy.money,
        equipment: this.equipment
      });
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 30) { this.autosaveTimer = 0; this._persist(); }
    }
  }

  _updateAudio(dt, moving) {
    const depthUnderPlayer = this.terrain.depthAt(this.player.position.x, this.player.position.z);
    const distanceToWater = clamp(1 - Math.max(0, this.player.position.y) / 12, 0.15, 1);
    this.audio.update(dt, {
      windSpeed: this.weather.windSpeed,
      rain: this.weather.rainAmount,
      nightFactor: this.time.nightFactor,
      nearWater: depthUnderPlayer > 0 ? 1 : distanceToWater,
      cloudiness: this.weather.cloudiness
    });

    if (moving.speed > 0.8) {
      this.footstepTimer -= dt * moving.speed;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 1.5;
        this.audio.footstep(moving.surface);
      }
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.fishing.dispose();
    this.fishManager.dispose();
    this.vegetation.dispose();
    this.props.dispose();
    this.water.dispose();
    this.sky.dispose();
    this.weather.dispose();
    this.terrain.dispose();
    this.textures.dispose();
    this.renderer.dispose();
  }
}
