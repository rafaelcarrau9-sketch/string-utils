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
import { Trees } from '../world/Trees.js';
import { GrassBlades } from '../world/GrassBlades.js';
import { AmbientLife } from '../world/AmbientLife.js';
import { CameraFx } from '../player/CameraFx.js';
import { InteractionSystem } from '../world/InteractionSystem.js';
import { Boat } from '../world/Boat.js';
import { ZONES, zoneOf, lockReason } from '../world/Zones.js';
import { NpcCrew } from '../world/Npc.js';
import { Props } from '../world/Props.js';

import { TimeOfDay } from '../weather/TimeOfDay.js';
import { Weather } from '../weather/Weather.js';

import { Player } from '../player/Player.js';
import { FishManager } from '../fish/FishManager.js';
import { FishingSystem, FishingState } from '../fishing/FishingSystem.js';

import { Inventory } from '../gear/Inventory.js';
import { Equipment } from '../gear/Equipment.js';
import { Economy } from '../economy/Economy.js';

import { QuestSystem } from '../story/QuestSystem.js';
import { EventSystem } from '../story/Events.js';
import { Tournament } from '../story/Tournament.js';
import { Commissions } from '../story/Commissions.js';
import { STORY } from '../story/StoryData.js';
import { SPECIES, SPECIES_BY_ID, RARITY_LABEL } from '../fish/FishData.js';
import { findItem } from '../gear/GearData.js';
import { UI } from '../ui/UI.js';
import { Coach } from '../ui/Coach.js';
import { Performance } from './Performance.js';
import { AudioSystem } from '../audio/AudioSystem.js';

/**
 * Exposición base del render. Las zonas la modulan: la garganta necesita más
 * porque sus paredes tapan el cielo.
 */
const BASE_EXPOSURE = 0.85;

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
    this._celebrating = 0;

    this._initRenderer();
    this._initWorld();
    this._initPlayer();
    this._initProgress();
    this._initFishing();
    this.cameraFx = new CameraFx(this.camera, { baseFov: this.settings.fov });
    // Una sola fuente de verdad para "qué caña se ve": la del modelo de primera
    // persona o la que sujeta el cuerpo, nunca las dos.
    this.player.onModeChange = (mode) => this.fishing.rod.setVisible(mode === 'first');
    this.fishing.onBoard = () => this.player.platform === this.boat;

    this.interaction = new InteractionSystem(this.camera);
    // El mundo se construye antes que este sistema, así que la primera zona
    // hay que registrarla aquí; los viajes posteriores lo hacen en _buildZone.
    this._registerInteractables();
    this._initUI();
    this._initPerformance();
    this._bindInput();
    this._loadProgress();
    this._openMainMenu();
  }

  /**
   * Menú de entrada. Es lo primero que se ve: dice si hay partida guardada, en
   * qué punto quedó, y separa «continuar» de «empezar de cero» sin que el
   * jugador tenga que borrar nada a mano.
   */
  _openMainMenu() {
    const data = this.save.load();
    const resumen = data ? {
      level: this.economy.level,
      money: this.economy.money,
      species: this.economy.discovered,
      zone: zoneOf(data.world?.zone ?? 'lago_niebla').name
    } : null;
    this.ui.showMainMenu({
      save: resumen,
      onContinue: () => this._beginPlay(),
      onNew: () => {
        // Sin partida previa no hay nada que borrar ni que recargar: se juega.
        if (!data) { this._beginPlay(); return; }
        this.save.clear();
        window.location.reload();
      },
      onSettings: () => this.ui.showSettings(this.settings)
    });
  }

  /** Del menú al juego: prólogo la primera vez, y a pescar. */
  _beginPlay() {
    this.audio.init();
    if (!this.quests.seenPrologue) {
      this.quests.seenPrologue = true;
      this.ui.showPrologue(STORY.PROLOGUE, () => {
        this.ui.showWelcome(() => this.input.requestLock());
        this._persist();
      });
      return;
    }
    this.input.requestLock();
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
    this.renderer.toneMappingExposure = BASE_EXPOSURE;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov, window.innerWidth / window.innerHeight, 0.08, 5000
    );

    window.addEventListener('resize', () => this._resize());
  }

  _initWorld() {
    this.textures = new TextureLibrary();
    this.time = new TimeOfDay({ hour: 9.4 });
    this.sky = new SkyDome(this.scene, this.textures, this.preset);
    this.weather = new Weather(this.scene, this.textures, this.preset);
    // Un rayo cercano se siente: sacude la vista y, si estás en mitad del agua
    // con una barca de madera, el juego te lo dice.
    this.weather.onBolt = (closeness) => {
      if (closeness < 0.55) return;
      this.cameraFx?.addShake(0.25 + closeness * 0.7);
      if (closeness > 0.75 && this.player?.platform === this.boat) {
        this.fishing?._say('Ha caído cerca. Con esta tormenta, en el agua no se está bien', 'bad');
      }
    };
    this._buildZone(zoneOf('lago_niebla'));
    this.sky.setZoneLighting(this.zone.lighting);
  }

  /**
   * Construye (o reconstruye) el mundo de una zona.
   *
   * Cielo, clima, jugador, dinero y equipo sobreviven al cambio: sólo se
   * rehace la geografía. Es lo que permite añadir mapas sin tocar el motor.
   */
  _buildZone(zone) {
    this.zone = zone;
    this._disposeZone();
    // Cada agua tiene su color: el verde del río no es el azul del embalse.
    this._zoneWater = new THREE.Color(zone.palette?.water ?? 0x0d2630);
    this._waterColor ??= new THREE.Color();
    this.sky?.setZoneLighting(zone.lighting);
    this.renderer.toneMappingExposure = BASE_EXPOSURE * (zone.lighting?.exposure ?? 1);

    this.terrain = new Terrain(this.textures, { resolution: 300, ...zone.terrain });
    this.scene.add(this.terrain.mesh);

    this.water = new WaterBody(this.textures, {
      reflectionSize: this.preset.waterReflection,
      sunDirection: this.time.sunDirection,
      terrain: this.terrain,
      zoneId: zone.id
    });
    this.water.addTo(this.scene);

    this.vegetation = new Vegetation(this.scene, this.terrain, this.textures, this.preset, {
      seed: zone.terrain.seed + 1, density: zone.vegetation.grass
    });
    this.grass = new GrassBlades(this.scene, this.terrain, this.preset, {
      seed: zone.terrain.seed + 5, density: zone.vegetation.grass
    });
    this.trees = new Trees(this.scene, this.terrain, this.textures, this.preset, {
      seed: zone.terrain.seed + 2, count: zone.vegetation.trees, conifer: zone.vegetation.conifer
    });
    this.props = new Props(this.scene, this.terrain, this.textures, this.preset);
    this.boat = new Boat(this.scene, this.terrain, this.textures, this.preset, {
      position: this.props.boatAnchor, heading: Math.PI * 0.62
    });
    this.fishManager = new FishManager(this.scene, this.terrain, {
      seed: zone.terrain.seed + 3,
      species: zone.species,
      // La Sombra no está en el agua hasta que la historia la pone ahí: si el
      // jugador la pescase de casualidad, el final perdería todo su sentido.
      allowGated: (id) => id !== 'sombra_valdes' || !!this.quests?.accepted?.has('cap5_sombra'),
      anchor: this.props.fishingSpots[0]?.position ?? null,
      hotspots: this.props.hotspots ?? []
    });
    this.crew = new NpcCrew(
      this.scene,
      STORY.NPC_LIST.filter((n) => n.zone === zone.id),
      this.props,
      this.preset
    );
    if (this.interaction) this._registerInteractables();
    this.ambient = new AmbientLife(this.scene, this.terrain, this.water, {
      seed: zone.terrain.seed + 7, audio: this.audio, life: zone.life
    });
  }

  _disposeZone() {
    if (!this.terrain) return;
    this.fishManager?.dispose();
    this.crew?.dispose();
    this.ambient?.dispose();
    this.boat?.dispose();
    this.props?.dispose();
    this.trees?.dispose();
    this.grass?.dispose();
    this.vegetation?.dispose();
    if (this.water) {
      this.scene.remove(this.water.water);
      this.scene.remove(this.water.rippleGroup);
      this.water.dispose();
    }
    this.scene.remove(this.terrain.mesh);
    this.terrain.dispose();
  }

  /** Viaja a otra zona: rehace el mundo y recoloca al jugador en su muelle. */
  travelTo(zoneId) {
    const zone = zoneOf(zoneId);
    if (zone.id === this.zone?.id) return;
    const busy = this._busyMessage('viajar');
    if (busy) { this.fishing._say(busy, 'bad'); return; }
    if (this.fishing.state !== 'idle') this.fishing.reelIn('Recoges el sedal antes de viajar');
    if (this.player.platform) { this.boat.leave(); this.player.setPlatform(null); }

    this._buildZone(zone);

    // Los sistemas que guardaban referencias al mundo anterior se reenganchan.
    this.player.terrain = this.terrain;
    this.player.walkables = [this.props.group];
    this.fishing.terrain = this.terrain;
    this.fishing.water = this.water;
    this.fishing.fishManager = this.fishManager;

    this.scene.updateMatrixWorld(true);
    const spot = this.props.fishingSpots[0];
    this.player.teleport(spot.position.clone());
    this.player.yaw = this._bestViewFrom(spot.position);
    this.time.setHour(zone.startHour);
    this.weather.setWeather(zone.weather);
    const primeraVez = this.economy.visit(zone.id);
    this.quests.notify('visit', { zone: zone.id });
    this._persist();
    this.fishing._say(`Has llegado a ${zone.name}`);
    if (primeraVez) {
      this.ui?.note(`${zone.name} — ${zone.ambientNote ?? ''}`, 'gold');
      this.economy.addXp(45);
    }
  }

  /**
   * Hacia dónde mirar desde un puesto: el rumbo con más agua pescable delante.
   * Apuntar siempre al centro del mapa dejaba al jugador mirando una pared en
   * el cañón y la orilla de enfrente en el río.
   */
  _bestViewFrom(position) {
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < 32; i++) {
      const yaw = (i / 32) * Math.PI * 2;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let score = 0;
      for (const d of [6, 12, 20, 30, 44]) {
        const depth = this.terrain.depthAt(position.x + fx * d, position.z + fz * d);
        // Se premia el agua pescable; lo demasiado somero y la tierra restan.
        score += depth > 0.5 ? Math.min(depth, 6) : -2;
      }
      if (score > bestScore) { bestScore = score; best = yaw; }
    }
    return best;
  }

  _initPlayer() {
    const spot = this.props.fishingSpots[0];
    const spawn = spot.position.clone().add(new THREE.Vector3(0, 0, 0));
    this.player = new Player(this.camera, this.terrain, {
      spawn,
      walkables: [this.props.group]
    });
    this.scene.add(this.player.rig);
    this.player.yaw = this._bestViewFrom(spawn);
  }

  _initProgress() {
    this.inventory = new Inventory();
    this.equipment = new Equipment(this.inventory);
    this.economy = new Economy();
    this.quests = new QuestSystem(null, this._questEvents());
    this.tournament = new Tournament(null, this._tournamentEvents());
    this.commissions = new Commissions();
    this.worldEvents = new EventSystem({
      onStart: (e) => {
        this.ui?.note(`${e.title} — ${e.text}`, 'gold');
        this.audio?.worldEvent();
      },
      onEnd: () => this.ui?.note('El agua vuelve a su ritmo de siempre')
    });
  }

  /**
   * El diario avisa; el juego traduce esos avisos en dinero, experiencia,
   * objetos y mensajes. Así el sistema de misiones no sabe nada de economía.
   */
  _questEvents() {
    return {
      onAccept: (quest) => {
        this.ui?.note(`Nueva misión: ${quest.title}`, 'gold');
        this.audio?.questAccept();
      },
      onProgress: (quest, i, value) => {
        const o = quest.objectives[i];
        const need = o.count ?? 1;
        if (value >= need) {
          this.ui?.note(`Objetivo cumplido: ${o.label}`, 'good');
          this.audio?.objective();
        }
      },
      onReady: (quest) => {
        const npc = STORY.NPCS[quest.turnIn];
        this.ui?.note(`«${quest.title}» lista. Vuelve con ${npc?.name ?? 'quien te la dio'}.`, 'good');
        this.audio?.objective();
      },
      onComplete: (quest, reward) => this._grantReward(quest, reward)
    };
  }

  /** Una captura contra el encargo aceptado, si encaja. */
  _submitCommission(fish, night) {
    const r = this.commissions.submit(fish, this.zone.id, night);
    if (!r) return;
    if (!r.done) {
      this.ui?.note(`Encargo: ${r.progreso}/${r.total}`, 'good');
      this.audio?.objective();
      return;
    }
    this.economy.sell(r.reward);
    const subida = this.economy.addXp(r.xp);
    if (subida) this._onLevelUp(subida);
    this.audio?.questDone();
    this._celebrate(6);
    this.ui?.note(`Encargo entregado a ${r.client}: ${r.text} · ${r.reward} monedas`, 'gold');
    this.quests.notify('commission', { value: this.commissions.done });
    this._persist();
  }

  _tournamentEvents() {
    return {
      onStart: (t) => {
        this.ui?.note(
          `Concurso abierto en ${t.zoneName}. Cinco minutos para batir ${t.target.toFixed(2)} kg.`, 'gold');
        this.audio?.worldEvent();
        this._celebrate(4);
      },
      onLead: (t) => {
        this.ui?.note(`Nueva marca tuya: ${t.best.species} de ${t.best.weight.toFixed(2)} kg`, 'good');
        this.audio?.objective();
      },
      onFinish: (r) => this._closeTournament(r)
    };
  }

  /** Fin del concurso: se paga, se cuenta y se guarda. */
  _closeTournament(r) {
    if (r.pago > 0) {
      this.economy.sell(r.pago);
      this.economy.addXp(Math.round(r.pago * 0.25));
      this.audio?.questDone();
      this._celebrate(9);
    } else {
      this.audio?.lineBreak();
    }
    const marca = r.best
      ? `${r.best.species} de ${r.best.weight.toFixed(2)} kg (marca: ${r.target.toFixed(2)} kg)`
      : `sin captura (marca: ${r.target.toFixed(2)} kg)`;
    this.ui?.note(
      `Concurso terminado · ${marca} · ${r.veredicto}${r.pago ? ` · ${r.pago} monedas` : ''}`,
      r.pago ? 'gold' : ''
    );
    if (r.recordDeZona && r.best) {
      this.ui?.note(`Récord del concurso en ${r.zoneName}: ${r.best.weight.toFixed(2)} kg`, 'good');
    }
    this.quests.notify('tournament', { value: this.tournament.wins });
    this._persist();
  }

  /** Aplica la recompensa de una misión y lo cuenta por pantalla. */
  _grantReward(quest, reward) {
    const partes = [];
    if (reward.money) { this.economy.sell(reward.money); partes.push(`${reward.money} monedas`); }
    if (reward.xp) {
      const subida = this.economy.addXp(reward.xp);
      partes.push(`${reward.xp} XP`);
      if (subida) this._onLevelUp(subida);
    }
    if (reward.item) {
      this.inventory.add(reward.item.category, reward.item.id);
      const item = findItem(reward.item.category, reward.item.id);
      if (item) partes.push(item.name);
      this.quests.notify('own', { category: reward.item.category, item: reward.item.id });
    }
    if (reward.unlockZone && !this.economy.unlockedZones.includes(reward.unlockZone)) {
      this.economy.unlockedZones.push(reward.unlockZone);
      partes.push(`acceso a ${zoneOf(reward.unlockZone).name}`);
    }
    if (reward.page) partes.push(`página ${reward.page} del cuaderno`);
    this.economy.stats.questsDone = (this.economy.stats.questsDone ?? 0) + 1;
    if (reward.page) this.audio?.page(); else this.audio?.questDone();
    this._celebrate(reward.page ? 14 : 8);
    this.ui?.note(`Misión completada: ${quest.title}${partes.length ? ' · ' + partes.join(' · ') : ''}`, 'gold');
    this.quests.notify('deliver', { value: this.quests.pages.length });
    this._persist();
    if (quest.id === 'cap6_cabana') this._showEpilogue();
  }

  /** Recuento de la temporada al cerrar la campaña. */
  _showEpilogue() {
    this._celebrate(30);
    this.input.releaseLock();
    // Se espera a que el diálogo se cierre para no encadenar dos pantallas.
    setTimeout(() => {
      this.ui.closeDialogue();
      this.ui.showEpilogue({
        level: this.economy.level,
        title: this.economy.title,
        landed: this.economy.stats.landed,
        species: this.economy.discovered,
        totalSpecies: SPECIES.length,
        biggest: this.economy.stats.biggest,
        quests: this.economy.stats.questsDone ?? 0,
        totalQuests: STORY.QUESTS.length,
        earned: this.economy.earned
      }, () => this.input.requestLock());
    }, 400);
  }

  /** Un momento importante: la música se aparta y luego celebra. */
  _celebrate(seconds = 12) {
    this._celebrating = seconds;
    this.audio?.duckMusic(3);
  }

  _onLevelUp(level) {
    this.ui?.note(`¡Nivel ${level}! Ahora eres ${this.economy.title}`, 'gold');
    this.audio?.levelUp();
    this._celebrate(10);
    this.quests.notify('level', { value: level });
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
        onCast: (power) => {
          this.economy.stats.casts++;
          this.audio.cast();
          this.cameraFx.addFovKick(2.5 + power * 3.5);
        },
        onSplash: (p) => {
          this.audio.splash(0.9);
          // Cada caída del señuelo castiga un poco ese rincón del agua.
          this.fishManager.addPressure(p.x, p.z, 0.35);
        },
        onBite: () => this.audio.bite(),
        onHookSet: () => {
          this.economy.stats.hooked++;
          this.audio.hookSet();
          this.cameraFx.addShake(0.35);
          this.cameraFx.addFovKick(-3);
        },
        onDragSlip: () => { if (Math.random() < 0.35) this.audio.dragSlip(); },
        onJump: (fish) => {
          this.water.splash(fish.position, 1.1);
          this.audio.thrash(clamp(0.4 + fish.weight * 0.06, 0.4, 1.4));
          this.cameraFx.addShake(0.18);
        },
        onRun: () => this.cameraFx.addShake(0.12),
        onPump: (metros) => {
          // Recuperar hilo bombeando se oye y se nota: es la recompensa de
          // haber soltado en el momento justo.
          this.audio.reelTick(1);
          this.audio.dragSlip();
          this.cameraFx.addFovKick(-1.4 - metros * 2);
        },
        onLineBreak: (fish) => {
          this.economy.stats.lineBreaks++; this.economy.stats.lost++;
          this.lastEvent = 'lineBreak'; this.audio.lineBreak();
          this.cameraFx.addShake(0.9);
          // Un pez que se suelta con el anzuelo puesto no vuelve a caer, y
          // pone nerviosos a los de alrededor.
          if (fish) {
            fish.spook(1, this.equipment.lure.id);
            this.fishManager.spookAround(fish.position, 14, 0.55, this.equipment.lure.id);
            this.fishManager.addPressure(fish.position.x, fish.position.z, 0.9);
          }
        },
        onFishLost: (fish, reason) => {
          this.economy.stats.lost++;
          this.lastEvent = 'fishLost';
          if (fish) {
            fish.spook(0.85, this.equipment.lure.id);
            this.fishManager.spookAround(fish.position, 12, 0.45, this.equipment.lure.id);
            this.fishManager.addPressure(fish.position.x, fish.position.z, 0.7);
          }
          // Perder por el anzuelo es siempre lo mismo: el pez es más grande de
          // lo que aguanta el aparejo. Merece decirse con todas las letras.
          if (/anzuelo/.test(reason ?? '')) this.lastEvent = 'hookPull';
          if (/anzuelo/.test(reason ?? '') && fish) {
            this.ui?.note(
              `${fish.displayName} de ${fish.weight.toFixed(1)} kg con este aparejo es demasiado. ` +
              'Una caña más fuerte y un freno mayor lo cambian todo.', 'gold');
          }
        },
        onLanded: (fish) => {
          this.lastEvent = 'landed';
          this.cameraFx.addShake(0.2);
          this._onLanded(fish);
        }
      }
    });
  }

  _initPerformance() {
    this.coach = new Coach();
    this.lastEvent = null;
    this.perf = new Performance({
      renderer: this.renderer,
      sky: this.sky,
      vegetationRef: () => this.vegetation,
      grassRef: () => this.grass,
      treesRef: () => this.trees,
      weather: this.weather,
      settings: this.settings,
      onChange: (level, direccion, fps) => {
        const texto = direccion === 'baja'
          ? `Calidad bajada a «${level}» para ir fluido (${fps} fps)`
          : `Calidad subida a «${level}» (${fps} fps)`;
        this.fishing._say(texto);
      }
    });
  }

  _initUI() {
    this.ui = new UI({
      onEquip: (category, id) => {
        const result = this.equipment.equip(category, id);
        if (typeof result === 'string') { this.fishing._say(result, 'bad'); return false; }
        this._persist();
        return true;
      },
      onBuy: (category, id) => {
        if (this.economy.buy(category, id)) {
          this.inventory.add(category, id);
          // Una embarcación nueva se bota nada más comprarla: nadie compra una
          // lancha para dejarla en el remolque.
          if (category === 'boats') this.equipment.equip('boats', id);
          this.audio.coin();
          this.quests.notify('own', { category, item: id });
          this._persist();
        }
      },
      onSetting: (key, value) => this._applySetting(key, value),
      onUnlockZone: (zoneId) => {
        const zone = zoneOf(zoneId);
        if (this.economy.unlockedZones.includes(zoneId)) return true;
        const motivo = lockReason(zone, this.economy, this.quests);
        if (motivo) { this.fishing._say(motivo, 'bad'); return false; }
        if (!this.economy.canAfford(zone.price)) return false;
        this.economy.money -= zone.price;
        this.economy.unlockedZones.push(zoneId);
        this.audio.coin();
        this._persist();
        return true;
      },
      onTravel: (zoneId) => { this.ui.closePanel(); this.travelTo(zoneId); },
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
      if (this.ui.isPanelOpen || this.ui.isDialogueOpen || !this.input.locked) return;
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
      if (this.ui.isDialogueOpen) {
        if (e.code === 'Space' || e.code === 'Enter') { this.ui.advanceDialogue(); return; }
        if (e.code === 'Escape') { this.ui.closeDialogue(); return; }
        if (e.code !== 'KeyJ' && e.code !== 'Tab') return;
      }
      switch (e.code) {
        case 'Escape': this._togglePause(); break;
        case 'Tab': this._panel(() => this.ui.showGear(this.inventory, this.equipment)); break;
        case 'KeyB': this._panel(() => this.ui.showShop(this.inventory, this.economy)); break;
        case 'KeyC': this._panel(() => this._openJournal()); break;
        case 'KeyJ': this._panel(() => this._openQuests()); break;
        case 'KeyG': this._panel(() => this.ui.showStats(this.economy, {
          totalQuests: STORY.QUESTS.length, totalSpecies: SPECIES.length, totalZones: ZONES.length,
          tourneysPlayed: this.tournament.played,
          tourneysWon: this.tournament.wins,
          bestTourney: Math.max(0, ...Object.values(this.tournament.records)) || 0,
          commissionsDone: this.commissions.done,
          commissionsEarned: this.commissions.earned
        })); break;
        case 'KeyR': if (!this.ui.isPanelOpen) this.fishing.reelIn(); break;
        case 'KeyE':
          if (!this.ui.isPanelOpen) this.interaction.interact();
          break;
        case 'KeyQ':
          if (!this.ui.isPanelOpen) this.fishing.toggleRod();
          break;
        case 'KeyZ': this._panel(() => this._openMap()); break;
        case 'KeyF':
          this.player.setCameraMode(this.player.mode === 'first' ? 'third' : 'first');
          break;
        default: break;
      }
    });
  }

  /** Sube o baja de la barca. Desembarcar exige tener orilla al lado. */
  /**
   * Todo lo que teletransporta al jugador o salta el reloj tiene que preguntar
   * esto antes: con un pez enganchado la respuesta es que no.
   */
  _busyMessage(what) {
    if (this.fishing.state === 'fighting') return `No puedes ${what} con un pez enganchado`;
    return null;
  }

  /**
   * Avisos de a bordo: mala mar para el casco que se lleva, y curricar. Sólo
   * la lancha permite avanzar con el sedal fuera; con las otras, remar con el
   * aparejo en el agua lo enreda y se recoge solo.
   */
  _boatWarnings(dt) {
    this._boatTimer = (this._boatTimer ?? 0) - dt;
    if (this.boat.rough > 0.35 && this._boatTimer <= 0) {
      this._boatTimer = 14;
      this.fishing._say(
        `${this.equipment.boat.name} con este oleaje va justa: busca resguardo o compra un casco mejor`, 'bad'
      );
      this.cameraFx.addShake(0.12);
    }
    const moviendo = Math.abs(this.boat.speed) > 0.7;
    if (moviendo && !this.equipment.boat.troll && this.fishing.state === 'fishing') {
      this.fishing.reelIn('Bogando con el sedal fuera se enreda: recogido');
    }
  }

  _toggleBoat() {
    if (this.player.platform) {
      const busy = this._busyMessage('bajar de la barca');
      if (busy) { this.fishing._say(busy, 'bad'); return; }
      const shore = this._findShoreNear(this.boat.position);
      if (!shore) { this.fishing._say('Acerca la barca a la orilla para bajar', 'bad'); return; }
      // Bajar teletransporta al jugador hasta la orilla: con el sedal fuera,
      // ese salto se traduciría en un tirón imposible.
      if (this.fishing.state !== 'idle') this.fishing.reelIn('Recoges el sedal antes de bajar');
      this.boat.leave();
      this.player.setPlatform(null);
      this.player.teleport(shore);
      this.fishing._say('Has desembarcado');
    } else if (this.boat.canBoard(this.player.position)) {
      const busy = this._busyMessage('subir a la barca');
      if (busy) { this.fishing._say(busy, 'bad'); return; }
      if (this.fishing.state !== 'idle') this.fishing.reelIn('Recoges el sedal antes de subir');
      this.player.setPlatform(this.boat);
      // Las instrucciones de a bordo tienen que poder leerse: el aviso de mala
      // mar espera unos segundos antes de pisarlas.
      this._boatTimer = 6;
      this.fishing._say('A bordo · W/S para bogar, A/D para virar, E para bajar');
    }
  }

  /**
   * Sitio donde bajarse de la barca. Vale el agua por la rodilla —de ahí se
   * puede vadear—, no sólo la tierra seca: exigir tierra firme dejaba el
   * fondeadero sin salida.
   */
  _findShoreNear(position, maxRadius = 13) {
    let best = null;
    for (let radius = 2.2; radius <= maxRadius; radius += 1) {
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const x = position.x + Math.cos(angle) * radius;
        const z = position.z + Math.sin(angle) * radius;
        const h = this.terrain.heightAt(x, z);
        if (h > 0.25) return new THREE.Vector3(x, h, z);      // tierra seca: ideal
        if (h > -0.6 && !best) best = new THREE.Vector3(x, h, z);  // vadeable
      }
      if (best) return best;
    }
    return null;
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
      onMenu: () => { this._persist(); this._openMainMenu(); },
      onReset: () => {
        this.save.clear();
        window.location.reload();
      }
    });
  }

  // -------------------------------------------------------------- eventos
  _onLanded(fish) {
    this.audio.landed();
    this.audio.duckMusic(4);
    this.fishManager.spookAround(fish.position, 10, 0.3, this.equipment.lure.id);
    this.fishManager.addPressure(fish.position.x, fish.position.z, 0.6);
    const nuevaEspecie = !this.economy.records[fish.species.id]?.count;
    const result = this.economy.registerCatch(fish);

    // La experiencia se cobra al sacarlo, no al venderlo: devolver un pez al
    // agua no debe castigar al jugador que quiere completar la enciclopedia.
    const subida = this.economy.addXp(result.xp);
    if (subida) this._onLevelUp(subida);

    // El diario se entera de todo lo que puede hacer avanzar una misión.
    const hecho = {
      species: fish.species.id,
      length: fish.length,
      weight: fish.weight,
      zone: this.zone.id,
      trophy: fish.trophy ?? 0,
      night: this.time.nightFactor > 0.55
    };
    this.quests.notify('catch', hecho);
    this.quests.notify('catchAny', hecho);
    this.quests.notify('trophy', hecho);
    this.tournament.submit(fish, this.zone.id);
    this._submitCommission(fish, hecho.night);
    if (nuevaEspecie) {
      this.quests.notify('discover', { value: this.economy.discovered });
      this.ui.note(`Especie nueva en la enciclopedia: ${fish.species.name}`, 'good');
    }

    this.ui.showCatch(fish, result, {
      onKeep: () => {
        this.economy.sell(result.value);
        this.audio.coin();
        this.quests.notify('money', { value: this.economy.money });
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
    if (key === 'quality') this.perf.lockTo(value);
    if (key === 'autoQuality') this.perf.auto = value;
    if (key === 'fov') {
      this.camera.fov = value;
      this.cameraFx.setBaseFov(value);
      this.camera.updateProjectionMatrix();
    }
    if (key === 'masterVolume') this.audio.setVolume(value);
    if (key === 'musicVolume') this.audio.setMusicVolume(value);
    this._persist();
  }

  // ----------------------------------------------------------- persistencia
  _persist() {
    this.save.save({
      settings: this.settings,
      inventory: this.inventory.toJSON(),
      equipment: this.equipment.toJSON(),
      economy: this.economy.toJSON(),
      world: { hour: this.time.hour, weather: this.weather.current, zone: this.zone?.id },
      quests: this.quests?.toJSON() ?? null,
      tournament: this.tournament?.toJSON() ?? null,
      commissions: this.commissions?.toJSON() ?? null,
      coach: this.coach?.toJSON() ?? []
    });
  }

  _loadProgress() {
    const data = this.save.load();
    if (!data) return;
    this.inventory = Inventory.fromJSON(data.inventory);
    this.equipment = Equipment.fromJSON(this.inventory, data.equipment);
    this.economy = new Economy(data.economy);
    this.quests = new QuestSystem(data.quests, this._questEvents());
    this.tournament = new Tournament(data.tournament, this._tournamentEvents());
    this.commissions = new Commissions(data.commissions);
    this.fishing.equipment = this.equipment;
    if (data.world?.hour !== undefined) this.time.setHour(data.world.hour);
    if (data.world?.weather) this.weather.setWeather(data.world.weather);
    if (data.world?.zone && data.world.zone !== this.zone?.id &&
        this.economy.unlockedZones.includes(data.world.zone)) {
      this.travelTo(data.world.zone);
    }
    this.audio.setVolume(this.settings.masterVolume);
    this.audio.setMusicVolume(this.settings.musicVolume ?? 0.55);
    if (Array.isArray(data.coach)) this.coach.seen = new Set(data.coach);
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
    const panelOpen = this.ui.isPanelOpen || this.ui.isMenuOpen;
    const talking = this.ui.isDialogueOpen;
    const controllable = headless || (!panelOpen && !talking && this.input.locked);

    if (controllable && !headless) {
      const mouse = this.input.consumeMouseDelta();
      this.player.look(mouse.dx, mouse.dy, this.settings.sensitivity, this.settings.invertY);
      if (mouse.wheel) this.fishing.adjustDrag(-mouse.wheel * 0.06);
      this.fishing.setRetrieve(this.input.mouse.right ? 1 : 0);
    } else if (!headless) {
      this.input.consumeMouseDelta();
      this.fishing.setRetrieve(0);
    }

    // El jugador se actualiza también sin entrada: así sigue a la barca y las
    // pruebas automáticas ejercitan el mismo código que la partida real.
    const moving = controllable
      ? this.player.update(dt, this.input)
      : { speed: 0, surface: this.player.surface, depth: 0 };

    this.time.update(panelOpen || talking ? 0 : dt);
    this.weather.update(dt, this.player.position, this.time.fogColor,
      headless ? null : this.audio);
    this.sky.update(this.time, this.weather, dt, this.player.position);

    // El viento base más la racha en curso: la vegetación se mueve a rachas,
    // no a velocidad constante.
    const gust = this.ambient?.gustStrength ?? 0;
    const wind = new THREE.Vector3(
      this.weather.windDirection.x, 0, this.weather.windDirection.y
    ).multiplyScalar(this.weather.windSpeed * (1 + gust * 0.55));

    this.water.update(dt, {
      sunDirection: this.time.sunDirection,
      sunColor: this.time.sunColor,
      waterColor: this._waterColor.copy(this._zoneWater).lerp(this.time.skyColor, 0.16),
      choppiness: this.weather.choppiness
    });
    this.vegetation.update(dt, wind, this.player.position);
    this.grass.update(dt, wind, this.player.position);
    this.trees.update(this.player.position);

    const aboard = this.player.platform === this.boat;
    this.boat.setSpec(this.equipment.boat);
    this.boat.update(dt, {
      row: aboard && controllable
        ? (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0) : 0,
      turn: aboard && controllable
        ? (this.input.isDown('KeyA') ? 1 : 0) - (this.input.isDown('KeyD') ? 1 : 0) : 0,
      time: this.clock.elapsedTime,
      water: this.water,
      choppiness: this.weather.choppiness
    });
    if (aboard) this._boatWarnings(dt);

    const context = {
      terrain: this.terrain,
      hour: this.time.hour,
      time: this.clock.elapsedTime,
      weatherModifier: this.weather.biteModifier,
      feeding: this.time.feedingFactor,
      // Lo que esté pasando en el agua ahora mismo pesa tanto como la hora.
      worldEvent: this.worldEvents,
      wind,
      lookDelta: this.player.lookDelta,
      cameraPosition: this.player.position,
      playerPosition: this.player.position,
      // Cuanto más ruido hace el jugador, antes se espantan.
      playerNoise: clamp((moving.speed / 5.6) * (moving.surface === 'agua' ? 1.4 : 0.35), 0, 1.4),
      lurePosition: this.fishing.lure.isFishable ? this.fishing.lure.position : null,
      lureAction: this.fishing.lure.action,
      // El pez necesita saber con qué le están intentando engañar para poder
      // desconfiar de ese montaje en concreto.
      lure: this.equipment.lure,
      // Función, no vector: cada pez consulta la corriente de su propio sitio.
      flowAt: this.terrain.field.hasCurrent
        ? (x, z, out) => this.terrain.field.flowAt(x, z, out)
        : null,
      onBite: () => {},
      onSpit: () => {}
    };

    if (!panelOpen && !talking) {
      this.tournament.update(dt);
      this.commissions.update(dt);
      this.worldEvents.update(dt, {
        hour: this.time.hour,
        rain: this.weather.rainAmount,
        cloudiness: this.weather.cloudiness,
        night: this.time.nightFactor,
        level: this.economy.level
      });
    }
    if (!panelOpen) {
      this.fishing.update(dt, context);
      this.fishManager.update(dt, context);
      this.ambient.update(dt, { player: this.player.position, time: this.time, weather: this.weather });
      this._updateFeedback(dt, moving);
    }
    if (!panelOpen) this._checkHotspots();
    // Repaso periódico de los objetivos comprobables: barato y evita que un
    // aviso perdido deje una misión encallada.
    this._questSync = (this._questSync ?? 0) - dt;
    if (!panelOpen && this._questSync <= 0) {
      this._questSync = 1.5;
      this.quests.reconcile(this._questSnapshot());
    }
    if (this.crew) {
      // Los personajes siguen vivos con un panel abierto: al cerrarlo no se
      // ven dar un salto para recolocarse.
      this.crew.update(dt, this.player.position, this.talkingTo);
      for (const npc of this.crew.npcs) npc.setMarker(this.quests.npcMarker(npc.id));
    }
    if (!panelOpen) this.interaction.update(this.player.position);
    if (talking && this.talkFocus) this._aimAtFocus(dt);
    this.player.holdingRod = this.fishing.rodStowed ? 0 : 1;
    this.cameraFx.update(dt);

    if (!headless) {
      this.perf.update(dt);
      this._updateAudio(dt, moving);

      const tip = this.coach.check({
        fishingState: this.fishing.state,
        lastEvent: this.lastEvent,
        casts: this.economy.stats.casts,
        landed: this.economy.stats.landed,
        money: this.economy.money,
        level: this.economy.level,
        discovered: this.economy.discovered,
        questsActive: this.quests.active.length,
        nearNpc: this.crew.npcs.some((n) => n.attention > 0.5),
        hasCurrent: !!this.terrain.field.hasCurrent,
        worldEvent: !!this.worldEvents.current,
        nearBoat: this.boat.canBoard(this.player.position),
        rig: this.fishing.lure.rig,
        canPump: !!this.fishing.hud.hooked?.canPump,
        lureDepth: this.fishing.lure.isFishable
          ? this.terrain.depthAt(this.fishing.lure.position.x, this.fishing.lure.position.z)
          : null
      }, dt);
      if (tip) { this.ui.showCoach(tip); this._persist(); }
      else if (!this.coach.text) this.ui.showCoach(null);
      this.lastEvent = null;

      this.ui.setLevel(this.economy.level, this.economy.title, this.economy.levelProgress);
      // El concurso manda sobre el suceso ambiental: si estás compitiendo, eso
      // es lo que necesitas ver.
      this.ui.setWorldEvent(this.tournament.label || this.worldEvents.label,
        this.tournament.running ? this.tournament.progress : null);
      this.ui.setTrackedQuest(this.quests.trackedQuest, this.quests, this.zone.name,
        this.commissions.accepted);
      this.ui.update({
        fishing: this.fishing.hud,
        time: this.time,
        weather: this.weather,
        money: this.economy.money,
        equipment: this.equipment,
        hint: this._contextHint(),
        fps: this.settings.showFps ? Math.round(this.perf.fps) : undefined,
        quality: this.perf.level
      });
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 30) { this.autosaveTimer = 0; this._persist(); }
    }
  }

  /**
   * Encontrar un puesto es llegar hasta él: no hay que pulsar nada. Al pisarlo
   * por primera vez se anota en el mapa, se explica por qué es bueno y se
   * cobra la exploración.
   */
  _checkHotspots() {
    const spots = this.props?.hotspots;
    if (!spots?.length) return;
    const P = this.player.position;
    for (const spot of spots) {
      const dx = P.x - spot.position.x, dz = P.z - spot.position.z;
      if (dx * dx + dz * dz > 81) continue;             // 9 m
      if (!this.economy.findSpot(this.zone.id, spot.name)) continue;
      this.economy.addXp(35);
      this.audio?.objective();
      const alcance = this.equipment.stats.castDistance;
      const aviso = spot.cast > alcance + 2
        ? ` Necesitas lanzar ${spot.cast.toFixed(0)} m y tu caña llega a ${alcance.toFixed(0)}: vuelve con más equipo o en barca.`
        : '';
      this.ui?.note(
        `Puesto encontrado · ${spot.name} (${spot.depth.toFixed(1)} m de calado, ${spot.cast.toFixed(0)} m de lance): ` +
        `${spot.description}${aviso}`, 'good');
      this.quests.notify('spot', { zone: this.zone.id, name: spot.name });
      this.quests.notify('spots', { value: this.economy.spotsIn(this.zone.id).length });
      this._persist();
    }
  }

  /** Registra lo que se puede mirar e interactuar en la zona actual. */
  _registerInteractables() {
    const I = this.interaction;
    I.clear();

    I.register({
      object: this.boat.group,
      anchorHeight: 0.55,
      range: 4.5,
      label: () => (this.player.platform ? 'E · desembarcar' : 'E · subir a la barca'),
      enabled: () => this.player.platform === this.boat || this.boat.canBoard(this.player.position),
      action: () => this._toggleBoat()
    });
    I.register({
      object: this.props.camp,
      anchorHeight: 0.5,
      range: 4,
      label: () => `E · descansar hasta las ${String(Math.floor(this._nextFeedingHour())).padStart(2, '0')}:00`,
      enabled: () => !this.player.platform,
      action: () => this._rest(this._nextFeedingHour())
    });
    I.register({
      object: this.props.sign,
      anchorHeight: 1.1,
      range: 4,
      label: () => `E · ${this.zone.name}: leer el tablón`,
      enabled: () => !this.player.platform,
      action: () => this._openNotice()
    });
    I.register({
      object: this.props.bucket,
      anchorHeight: 0.2,
      range: 2.8,
      label: 'E · mirar el cubo de cebo',
      enabled: () => !this.player.platform,
      action: () => this._inspectBait()
    });

    for (const npc of this.crew.npcs) {
      I.register({
        object: npc.root,
        anchorHeight: 1.35,          // el pecho, no los pies
        highlightColor: 0x0a1614,    // un apunte, no un foco
        range: 3.6,
        label: () => {
          const marca = this.quests.npcMarker(npc.id);
          const cola = marca === 'entregar' ? ' · tiene algo que decirte'
            : marca === 'nueva' ? ' · quiere hablar contigo' : '';
          return `E · hablar con ${npc.name}${cola}`;
        },
        enabled: () => !this.player.platform && this.fishing.state !== 'fighting',
        action: () => this.talkTo(npc.id)
      });
    }
  }

  // -------------------------------------------------------------- diálogo
  /**
   * Conversación con un personaje.
   *
   * Una sola pantalla encadena todo lo que puede pasar con él: entregar lo que
   * ya está hecho, ofrecer lo siguiente, abrir la tienda o los permisos, y
   * despedirse. El orden importa: primero se cobra, luego se acepta.
   */
  talkTo(npcId) {
    const npc = STORY.NPCS[npcId];
    const actor = this.crew.byId(npcId);
    // Sólo se habla con quien está delante. Sin esto se podía entregar una
    // misión a alguien que estaba a tres zonas de distancia.
    if (!npc || !actor) return false;
    this.talkingTo = npcId;
    // La vista se lleva sola hacia la cara del personaje: hablar mirando al
    // suelo o de perfil rompía por completo la escena.
    this.talkFocus = actor
      ? actor.root.position.clone().setY(actor.root.position.y + 1.5 * actor.height)
      : null;
    actor?.speak();
    this.audio?.greet();
    this.audio?.duckMusic(4);
    this.input.releaseLock();

    // Antes de mirar qué tiene que decirnos, se pone al día el diario: si el
    // jugador ya cumple un objetivo comprobable, el personaje tiene que
    // saberlo en ese mismo instante y no hasta segundo y medio después.
    this.quests.reconcile(this._questSnapshot());
    const primera = !this.quests.metNpcs.has(npcId);
    this.quests.meet(npcId);
    const { offer, turnIn, inProgress } = this.quests.forNpc(npcId);

    // Lo primero, cobrar lo que ya está hecho.
    if (turnIn.length) { this._dialogueTurnIn(npc, turnIn[0]); return; }
    if (offer.length) { this._dialogueOffer(npc, offer[0], primera); return; }

    const lines = primera ? [...npc.greet] : [this._pick(npc.idle)];
    if (inProgress.length) {
      const q = inProgress[0];
      lines.push(`—Sigue con lo tuyo: <em>${q.title}</em>. Aquí estaré.`);
    }
    this._openDialogue(npc, lines, this._npcOptions(npc));
    return true;
  }

  _pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /** Lo que el jugador ya lleva hecho, para no pedirle dos veces lo mismo. */
  _questSnapshot() {
    return {
      records: this.economy.records,
      discovered: this.economy.discovered,
      level: this.economy.level,
      money: this.economy.money,
      pages: this.quests.pages.length,
      visited: this.economy.zonesVisited,
      met: this.quests.metNpcs,
      owns: (category, id) => this.inventory.has(category, id),
      spots: (zoneId) => this.economy.spotsIn(zoneId ?? this.zone.id).length,
      tourneyWins: this.tournament?.wins ?? 0,
      commissions: this.commissions?.done ?? 0
    };
  }

  /** Encara suavemente la vista con quien está hablando. */
  _aimAtFocus(dt) {
    const eye = this.camera.getWorldPosition(new THREE.Vector3());
    const dx = this.talkFocus.x - eye.x;
    const dz = this.talkFocus.z - eye.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) return;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(this.talkFocus.y - eye.y, dist);
    let d = wantYaw - this.player.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const k = 1 - Math.exp(-5 * dt);
    this.player.yaw += d * k;
    this.player.pitch += (wantPitch - this.player.pitch) * k;
  }

  /** Opciones fijas de un personaje: su tienda, sus permisos, despedirse. */
  _npcOptions(npc) {
    const options = [];
    if (npc.shop) {
      options.push({
        label: 'Ver la tienda',
        action: () => this._panelFromDialogue(() => this.ui.showShop(this.inventory, this.economy))
      });
    }
    if (npc.shop) {
      const t = Tournament.terms(this.zone, SPECIES_BY_ID, this.economy.level);
      if (this.tournament.running) {
        options.push({
          label: 'Retirarse del concurso',
          action: () => this.tournament.abandon()
        });
      } else if (this.tournament.available) {
        options.push({
          label: `Concurso · ${t.entry} monedas`,
          action: () => {
            const ok = this.tournament.enter(this.zone, t, (precio) => {
              if (!this.economy.canAfford(precio)) {
                this.fishing._say(`El concurso cuesta ${precio} monedas y no las tienes`, 'bad');
                return false;
              }
              this.economy.money -= precio;
              return true;
            });
            if (ok) this.audio?.coin();
          }
        });
      } else {
        options.push({
          label: `Concurso (en ${Math.ceil(this.tournament.cooldown / 60)} min)`,
          action: () => this.fishing._say('El próximo concurso todavía no está abierto')
        });
      }
    }
    if (npc.sellsPermits) {
      options.push({
        label: 'Permisos y mapa',
        action: () => this._panelFromDialogue(() => this._openMap())
      });
    }
    options.push({ label: 'Despedirse', action: () => {} });
    return options;
  }

  _openDialogue(npc, lines, options) {
    const actor = this.crew.byId(npc.id);
    this.ui.showDialogue({
      name: npc.name,
      role: npc.role,
      lines,
      options,
      onAdvance: () => { actor?.speak(); this.audio?.dialogueBeat(); },
      onClose: () => {
        this.talkingTo = null;
        this.talkFocus = null;
        if (!this.ui.isPanelOpen) this.input.requestLock();
      }
    });
  }

  _panelFromDialogue(open) {
    this.ui.closeDialogue();
    open();
  }

  _dialogueOffer(npc, quest, primera) {
    const lines = primera ? [...npc.greet] : [];
    lines.push(`—<em>${quest.title}</em>`, quest.summary);
    if (quest.hint) lines.push(`—${quest.hint}`);
    this._openDialogue(npc, lines, [
      {
        label: 'Aceptar',
        action: () => {
          this.quests.accept(quest.id, this._questSnapshot());
          this._persist();
          // Encadena: si tiene más que ofrecer, sigue la conversación.
          const mas = this.quests.forNpc(npc.id);
          if (mas.offer.length) setTimeout(() => this._dialogueOffer(npc, mas.offer[0], false), 120);
        }
      },
      { label: 'Ahora no', action: () => {} },
      ...this._npcOptions(npc).filter((o) => o.label !== 'Despedirse')
    ]);
  }

  _dialogueTurnIn(npc, quest) {
    const lines = [...(quest.complete ?? ['—Buen trabajo.'])];
    this._openDialogue(npc, lines, [
      {
        label: 'Cobrar la misión',
        action: () => {
          this.quests.turnIn(quest.id);
          const siguiente = this.quests.forNpc(npc.id);
          if (siguiente.turnIn.length) setTimeout(() => this._dialogueTurnIn(npc, siguiente.turnIn[0]), 140);
          else if (siguiente.offer.length) setTimeout(() => this._dialogueOffer(npc, siguiente.offer[0], false), 140);
        }
      }
    ]);
  }

  _openQuests() { this.ui.showQuests(this.quests, STORY); }

  _openJournal() {
    this.ui.showJournal(this.economy, SPECIES, {
      RARITY_LABEL,
      zonesOf: (id) => ZONES.filter((z) => z.species.includes(id) &&
        this.economy.zonesVisited.has(z.id)).map((z) => z.short),
      lureName: (id) => findItem('lures', id)?.name ?? id
    });
  }

  /** El tablón de la zona: fauna, puestos y concurso. */
  _openNotice() {
    const terms = Tournament.terms(this.zone, SPECIES_BY_ID, this.economy.level);
    const conocidos = new Set(this.economy.spotsIn(this.zone.id));
    this.ui.showNotice(this.zone, {
      species: this.zone.species.map((id) => SPECIES_BY_ID[id]).filter(Boolean),
      known: new Set(Object.keys(this.economy.records).filter((id) => this.economy.records[id].count)),
      spots: (this.props.hotspots ?? []).filter((h) => conocidos.has(h.name)),
      tournament: this.tournament,
      terms,
      commissions: this.commissions.offersFor(this.zone, SPECIES_BY_ID, this.economy.level),
      accepted: this.commissions.accepted,
      refreshIn: this.commissions.refreshIn(this.zone.id),
      onAcceptCommission: (offer) => {
        if (!this.commissions.accept(offer)) return false;
        this.audio?.questAccept();
        this.ui?.note(`Encargo aceptado: ${offer.text}`, 'gold');
        this._persist();
        return true;
      },
      onAbandonCommission: () => { this.commissions.abandon(); this._persist(); },
      money: this.economy.money,
      record: this.tournament.records[this.zone.id],
      onEnter: () => this.tournament.enter(this.zone, terms, (precio) => {
        if (!this.economy.canAfford(precio)) {
          this.fishing._say(`El concurso cuesta ${precio} monedas y no las tienes`, 'bad');
          return false;
        }
        this.economy.money -= precio;
        this.audio?.coin();
        return true;
      }),
      onAbandon: () => this.tournament.abandon()
    });
  }

  _openMap() {
    this.ui.showZones(ZONES, this.economy, this.zone.id, {
      quests: this.quests,
      lockReason,
      speciesKnown: (zone) => zone.species.filter((id) => this.economy.records[id]?.count).length,
      spotsKnown: (zone) => this.economy.spotsIn(zone.id)
    });
  }

  /** Examinar el cebo: consejo real según la hora y el tiempo que hace. */
  _inspectBait() {
    const hour = this.time.hour;
    const band = hour < 6 || hour > 20 ? 'de noche'
      : hour < 10 ? 'a primera hora'
      : hour < 17 ? 'a pleno día' : 'al caer la tarde';
    const consejo = hour < 6 || hour > 20
      ? 'los peces de fondo están activos: prueba vinilo o boilie hondo'
      : hour < 10 || hour > 17
      ? 'es la mejor franja: cucharilla o popper en superficie'
      : 'con el sol alto conviene bajar: cucharilla pesada o boilie';
    this.audio.coin();
    this.fishing._say(`El cubo huele fuerte. ${band.charAt(0).toUpperCase() + band.slice(1)} y ${this.weather.label.toLowerCase()}: ${consejo}`);
  }

  _contextHint() {
    if (this.player.platform) return 'W/S bogar · A/D virar · E desembarcar';
    return this.interaction?.label ?? '';
  }

  /** Siguiente hora punta de actividad: amanecer o atardecer. */
  _nextFeedingHour() {
    const h = this.time.hour;
    return h < 5.5 || h >= 19 ? 6 : 19;
  }

  /** Descansar: salta a la siguiente franja buena, con fundido. */
  _rest(hour) {
    // Un pez enganchado no se abandona en silencio: se cobra o se pierde, pero
    // nunca desaparece porque el jugador haya pulsado otra tecla.
    const busy = this._busyMessage('descansar');
    if (busy) { this.fishing._say(busy, 'bad'); return; }
    if (this.fishing.state !== 'idle') this.fishing.reelIn('Recoges el sedal antes de descansar');
    this.input.releaseLock();
    this.ui.fadeThrough(() => {
      this.time.setHour(hour);
      // Al levantarse, el tiempo puede haber cambiado.
      if (Math.random() < 0.55) this.weather.cycle();
      this._persist();
      this.fishing._say(`Has descansado. Son las ${String(Math.floor(hour)).padStart(2, '0')}:00 · ${this.weather.label}`);
      this.input.requestLock();
    });
  }

  /**
   * Reacciones continuas: tirón de cámara durante la pelea, zumbido del hilo,
   * clics del carrete y ondas al vadear.
   */
  _updateFeedback(dt, moving) {
    const f = this.fishing;

    // La vista se va detrás del pez cuando tira, proporcional a la tensión.
    if (f.state === 'fighting' && f.hooked) {
      const toFish = f.hooked.position.clone().sub(this.camera.getWorldPosition(new THREE.Vector3()));
      const forward = this.camera.getWorldDirection(new THREE.Vector3());
      const lateral = forward.x * toFish.z - forward.z * toFish.x;
      const strength = clamp(f.tensionRatio, 0, 1) * 0.02;
      this.cameraFx.setPull(clamp(-lateral * 0.002, -1, 1) * strength, -strength * 0.5);
      this.cameraFx.setRoll(f.sidePressure * 0.035);
      this._stressTimer = (this._stressTimer ?? 0) - dt;
      if (this._stressTimer <= 0 && f.tensionRatio > 0.55) {
        this._stressTimer = 0.28;
        this.audio.lineStress(f.tensionRatio);
      }
    } else {
      this.cameraFx.setPull(0, 0);
      this.cameraFx.setRoll(0);
    }

    // Clics del carrete al ritmo de la recogida.
    if (f.retrieveInput > 0.05 && f.state !== 'idle') {
      this._reelTimer = (this._reelTimer ?? 0) - dt * f.retrieveInput * (1 + f.tensionRatio);
      if (this._reelTimer <= 0) { this._reelTimer = 0.1; this.audio.reelTick(f.retrieveInput); }
    }

    // Andar por el agua somera levanta ondas y suena.
    if (moving.surface === 'agua' && moving.speed > 1) {
      this._wadeTimer = (this._wadeTimer ?? 0) - dt * moving.speed * 0.45;
      if (this._wadeTimer <= 0) {
        this._wadeTimer = 1;
        this.water.splash(this.player.position, 0.25 + moving.depth * 0.3);
        this.audio.wade();
      }
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
      cloudiness: this.weather.cloudiness,
      frogs: this.zone.life?.frogs ?? 0,
      // La música lee el mismo estado que el jugador está viendo.
      music: {
        fighting: this.fishing.state === 'fighting',
        night: this.time.nightFactor,
        hour: this.time.hour,
        zone: this.zone.id,
        weather: this.weather.cloudiness,
        celebration: this._celebrating > 0
      }
    });
    if (this._celebrating > 0) this._celebrating -= dt;

    // El paso suena cuando el pie toca de verdad, no cada N segundos: así el
    // sonido va sincronizado con la animación por construcción.
    if (moving.stepped) this.audio.footstep(moving.surface);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.fishing.dispose();
    this.fishManager.dispose();
    this.crew?.dispose();
    this.audio?.music?.dispose();
    this.vegetation.dispose();
    this.trees.dispose();
    this.grass.dispose();
    this.ambient.dispose();
    this.boat.dispose();
    this.props.dispose();
    this.water.dispose();
    this.sky.dispose();
    this.weather.dispose();
    this.terrain.dispose();
    this.textures.dispose();
    this.renderer.dispose();
  }
}
