import * as THREE from 'three';
import { Lure, LureState } from './Lure.js';
import { FishingLine } from './Line.js';
import { Rod } from './Rod.js';
import { FishState } from '../fish/Fish.js';
import { clamp, lerp, damp } from '../core/MathUtils.js';

/**
 * Sistema de pesca: lanzamiento, espera, picada, clavada y pelea.
 *
 * El modelo de tensión es el núcleo de todo:
 *
 *   tensión = rigidez · (distancia_al_pez − hilo_soltado)
 *
 * Es decir, la línea sólo tira cuando hay menos hilo fuera que distancia. De
 * ahí salen solos los tres comportamientos que se esperan de un carrete:
 *
 *  - Recoger acorta el hilo → sube la tensión.
 *  - El freno deja escapar hilo cuando la tensión lo supera → la carrera del
 *    pez se "paga" con metros, no con vida.
 *  - Demasiada holgura mantenida → el anzuelo se desprende.
 *
 * Si la tensión supera la resistencia de la línea, rompe.
 */

export const FishingState = {
  IDLE: 'idle',
  AIMING: 'aiming',
  CASTING: 'casting',
  FISHING: 'fishing',
  BITE: 'bite',
  FIGHTING: 'fighting',
  LANDED: 'landed'
};

const SLACK_TOLERANCE = 1.4;      // metros de holgura antes de arriesgar el anzuelo
const SLACK_GRACE = 2.2;          // segundos de holgura que aguanta el anzuelo
const LAND_DISTANCE = 2.2;

export class FishingSystem {
  constructor({ scene, camera, terrain, water, fishManager, equipment, events }) {
    this.scene = scene;
    this.camera = camera;
    this.terrain = terrain;
    this.water = water;
    this.fishManager = fishManager;
    this.equipment = equipment;
    this.events = events;

    this.rod = new Rod(camera, equipment);
    this.line = new FishingLine(scene);
    this.lure = new Lure(scene);

    this.state = FishingState.IDLE;
    this.power = 0;              // carga del lanzamiento 0..1
    this.charging = false;
    this.lineOut = 0;
    this.tension = 0;
    this.dragSetting = 0.45;     // 0..1 del freno máximo
    this.slackTimer = 0;
    this.hooked = null;
    this.biteTimer = 0;
    this.retrieveInput = 0;
    this.sidePressure = 0;      // -1 izquierda … +1 derecha, desde dónde apunta la caña
    this.counterPressure = 0;   // >0 si esa presión va contra la carrera del pez
    this.message = null;
    this.lastCatch = null;

    this._rodTip = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  get stats() { return this.equipment.stats; }
  get tensionRatio() { return clamp(this.tension / this.stats.lineStrength, 0, 1.4); }
  get dragForce() { return this.dragSetting * this.stats.maxDrag; }
  get canCast() { return this.state === FishingState.IDLE; }

  // ---------------------------------------------------------------- entrada
  beginCast() {
    if (!this.canCast) return;
    this.state = FishingState.AIMING;
    this.charging = true;
    this.power = 0;
  }

  releaseCast() {
    if (this.state !== FishingState.AIMING) return;
    this.charging = false;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    // Se lanza algo por encima de la línea de visión, como en la realidad.
    direction.y += 0.22;
    direction.normalize();

    const distance = this.stats.castDistance * (0.25 + 0.75 * this.power);
    const speed = Math.sqrt(distance * 9.81 / Math.max(0.35, Math.sin(2 * Math.asin(clamp(direction.y, -0.99, 0.99)))));
    const launchSpeed = clamp(isFinite(speed) ? speed : 18, 6, 34);

    this.rod.worldTip(this._rodTip);
    this.lure.cast(this._rodTip, direction, launchSpeed, this.equipment.lure);
    this.line.reset(this._rodTip, this.lure.position);
    this.line.setVisible(true);
    this.lineOut = 1;
    this.tension = 0;
    this.state = FishingState.CASTING;
    this.events?.onCast?.(this.power);
    this.power = 0;
  }

  /** Clavada. Sólo sirve durante la ventana de picada. */
  strike() {
    if (this.state === FishingState.BITE) {
      const fish = this.fishManager.biting;
      if (fish) {
        fish.setState(FishState.FIGHTING);
        this.hooked = fish;
        this.state = FishingState.FIGHTING;
        this.slackTimer = 0;
        // La línea queda tensa pero sin estirar: sin esto, el desfase que
        // acumula el recogido se convertiría en un pico de tensión que rompe
        // el hilo en el mismo instante de clavar.
        this.lineOut = Math.max(this.lineOut, this._rodTip.distanceTo(fish.position) + 0.15);
        // El cebo va en la boca del pez: boya y señuelo dejan de pintarse y la
        // línea pasa a colgar directamente de él.
        this.lure.stow();
        this.fight = {
          stamina: 1,
          burst: 0,
          burstTimer: 1 + Math.random() * 2,
          jumping: 0,
          runsLeft: fish.species.fight.runs
        };
        this.events?.onHookSet?.(fish);
        return true;
      }
    }
    if (this.state === FishingState.FISHING || this.state === FishingState.CASTING) {
      // Clavada en falso: se recoge el señuelo.
      this.reelIn('Clavada en vacío');
    }
    return false;
  }

  reelIn(reason = null) {
    // Sin esto, seguir pulsando recoger al terminar un lance hacía que el
    // siguiente se recuperase solo nada más tocar el agua.
    this.retrieveInput = 0;
    this.lure.stow();
    this.line.setVisible(false);
    if (this.hooked) this.fishManager.release(this.hooked);
    this.hooked = null;
    this.fight = null;
    this.state = FishingState.IDLE;
    this.tension = 0;
    this.lineOut = 0;
    if (reason) this._say(reason);
  }

  adjustDrag(delta) {
    this.dragSetting = clamp(this.dragSetting + delta, 0.05, 1);
  }

  setRetrieve(amount) { this.retrieveInput = clamp(amount, 0, 1); }

  _say(text, kind = 'info') {
    this.message = { text, kind, time: 0 };
    this.events?.onMessage?.(text, kind);
  }

  // ----------------------------------------------------------------- update
  update(dt, context) {
    this.rod.worldTip(this._rodTip);
    const stats = this.stats;

    if (this.charging) {
      this.power = Math.min(1, this.power + dt * 0.85);
    }

    const event = this.lure.update(dt, {
      terrain: this.terrain,
      waterLevel: this.terrain.waterLevel,
      retrieve: this.state === FishingState.FIGHTING ? 0 : this.retrieveInput,
      rodTip: this._rodTip,
      retrieveSpeed: stats.retrieveSpeed,
      wind: context.wind
    });

    if (event?.type === 'splash') {
      this.water.splash(event.position, 0.8);
      this.events?.onSplash?.(event.position);
      this.state = FishingState.FISHING;
      this.lineOut = this._rodTip.distanceTo(this.lure.position) + 0.3;
    } else if (event?.type === 'ground') {
      this._say('El señuelo ha caído en tierra');
      this.state = FishingState.FISHING;
      this.lineOut = this._rodTip.distanceTo(this.lure.position) + 0.3;
    }

    switch (this.state) {
      case FishingState.CASTING: this._updateCasting(dt); break;
      case FishingState.FISHING: this._updateFishing(dt, context); break;
      case FishingState.BITE: this._updateBite(dt, context); break;
      case FishingState.FIGHTING: this._updateFight(dt, context); break;
      default: break;
    }

    this._updateLineVisual(dt, context);
    this.rod.update(dt, clamp(this.tension / Math.max(1, stats.rodStrength), 0, 1.2), context.lookDelta);
    if (this.message) {
      this.message.time += dt;
      if (this.message.time > 3.5) this.message = null;
    }
  }

  _updateCasting() {
    this.lineOut = Math.max(this.lineOut, this._rodTip.distanceTo(this.lure.position) + 0.2);
  }

  _updateFishing(dt, context) {
    if (!this.lure.isFishable) return;

    // Recoger acorta el hilo; si llega al final, el lance ha terminado.
    if (this.retrieveInput > 0.05) {
      const toLure = this._rodTip.distanceTo(this.lure.position);
      this.lineOut = Math.max(0.6, this.lineOut - this.stats.retrieveSpeed * this.retrieveInput * dt);
      // El señuelo tarda en seguir al carrete; sin este tope el hilo "fuera"
      // se quedaría por debajo de la distancia real.
      this.lineOut = Math.max(this.lineOut, toLure);
      if (toLure < 1.4) {
        this.reelIn();
        return;
      }
    }

    this.fishManager.evaluate({
      lurePosition: this.lure.position,
      lure: this.equipment.lure,
      hour: context.hour,
      weatherModifier: context.weatherModifier,
      lureAction: this.lure.action * this.stats.lureAction,
      feeding: context.feeding
    });

    if (this.fishManager.biting) {
      this.state = FishingState.BITE;
      this.lure.setBiting(true);
      this.biteTimer = 0;
      this.water.splash(this.lure.position, 0.5);
      this.events?.onBite?.(this.fishManager.biting);
    }
  }

  _updateBite(dt) {
    this.biteTimer += dt;
    const fish = this.fishManager.biting;
    if (!fish) {
      // Lo ha soltado sin que reaccionáramos.
      this.lure.setBiting(false);
      this.state = FishingState.FISHING;
      this._say('Se ha soltado');
      return;
    }
    // Tirones visibles en el señuelo mientras el pez lo tiene en la boca.
    this.lure.position.lerp(fish.position, 0.35 * dt * 4);
    this.lineOut = Math.max(0.8, this.lineOut - dt * 0.4);
  }

  _updateFight(dt, context) {
    const fish = this.hooked;
    if (!fish) { this.state = FishingState.FISHING; return; }

    const stats = this.stats;
    const f = this.fight;
    const species = fish.species;

    // --- presión lateral ---------------------------------------------------
    // Apuntar la caña a un lado del pez, y no de frente, es la técnica real
    // para cansarlo: se le obliga a nadar contra la tracción en vez de tirar
    // en línea recta. Aquí sale del propio giro de la vista, sin control nuevo.
    const toFish = fish.position.clone().sub(this._rodTip).setY(0);
    if (toFish.lengthSq() > 0.01) {
      toFish.normalize();
      const aim = new THREE.Vector3();
      this.camera.getWorldDirection(aim);
      aim.y = 0;
      if (aim.lengthSq() > 0.01) {
        aim.normalize();
        // Seno del ángulo entre a dónde apunta la caña y dónde está el pez.
        this.sidePressure = clamp(aim.x * toFish.z - aim.z * toFish.x, -1, 1);
        // ¿Va esa presión en contra del desplazamiento lateral del pez?
        const lateral = toFish.x * fish.velocity.z - toFish.z * fish.velocity.x;
        this.counterPressure = clamp(-Math.sign(lateral) * this.sidePressure, -1, 1);
      }
    }

    // --- comportamiento del pez -------------------------------------------
    f.burstTimer -= dt;
    if (f.burstTimer <= 0) {
      const wantsRun = f.runsLeft > 0 && f.stamina > 0.25 && Math.random() < 0.55 + this.tensionRatio * 0.3;
      if (wantsRun) {
        f.burst = 1;
        f.runsLeft -= 1;
        f.burstTimer = 1.2 + Math.random() * 1.8;
        this.events?.onRun?.(fish);
      } else {
        f.burst = 0;
        f.burstTimer = 0.8 + Math.random() * 1.6;
      }
      if (Math.random() < species.fight.jumpChance * 0.5 && f.stamina > 0.3) {
        f.jumping = 0.55;
        this.events?.onJump?.(fish);
      }
    }
    f.burst = damp(f.burst, f.burst > 0.5 ? 1 : 0, 4, dt);

    // Nada alejándose del pescador, con sacudidas laterales.
    const away = fish.position.clone().sub(this._rodTip).setY(0);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    const shake = Math.sin(context.time * 6 * species.fight.headshake) * 0.5;
    away.applyAxisAngle(new THREE.Vector3(0, 1, 0), shake);

    // El tirón crece con el peso, pero de forma sublineal: un siluro de 50 kg
    // es muchísimo más fuerte que una perca, no cien veces más.
    const power = species.strength
      * (0.5 + Math.pow(fish.weight, 0.45) * 0.7)
      * (0.5 + f.burst * 1.2)
      * (0.25 + 0.75 * f.stamina);
    const pullSpeed = species.speed * 0.42 * (0.4 + f.burst) * clamp(f.stamina, 0.12, 1);
    // La tensión frena al pez: tirar cansa a los dos.
    // Ladear la caña le tuerce la cabeza y le quita avance; acompañar su
    // carrera se lo regala. Ese es todo el valor de la técnica.
    const steerFactor = clamp(1 - this.counterPressure * 0.4, 0.6, 1.3);
    const resisted = pullSpeed * steerFactor / (1 + this.tensionRatio * 1.6);

    fish.velocity.copy(away).multiplyScalar(resisted);
    // Desvío lateral leve: se nota en la trayectoria, no en la velocidad.
    fish.velocity.addScaledVector(
      new THREE.Vector3(-away.z, 0, away.x), this.sidePressure * resisted * 0.18
    );
    if (f.jumping > 0) {
      f.jumping -= dt;
      fish.velocity.y = 2.4;                    // salto fuera del agua
    } else {
      const bed = this.terrain.heightAt(fish.position.x, fish.position.z);
      const target = clamp(this.terrain.waterLevel - 0.6, bed + 0.25, this.terrain.waterLevel - 0.15);
      fish.velocity.y = (target - fish.position.y) * 0.8;
    }
    fish.position.addScaledVector(fish.velocity, dt);
    // No se mete en la orilla: si toca fondo, gira.
    const bed = this.terrain.heightAt(fish.position.x, fish.position.z);
    if (fish.position.y < bed + 0.12) fish.position.y = bed + 0.12;

    // --- carrete y línea ---------------------------------------------------
    const distance = this._rodTip.distanceTo(fish.position);
    if (this.retrieveInput > 0.05) {
      // Cuanta más tensión, más cuesta recuperar hilo.
      const effort = stats.retrieveSpeed * this.retrieveInput / (1 + this.tensionRatio * 2.2);
      this.lineOut = Math.max(0.8, this.lineOut - effort * dt);
    }

    // La línea es una cuerda: si hay menos hilo fuera que distancia, el pez
    // viene hacia la caña. Cuanto más cansado, menos se resiste — y eso es lo
    // que convierte "cansarlo" en la forma de cobrarlo.
    let stretch = distance - this.lineOut;
    const netPull = this.tension - power * 0.85;
    if (stretch > 0 && netPull > 0) {
      const rate = netPull * 0.5 * (1 + (1 - f.stamina) * 2.4);
      const give = Math.min(stretch, rate * dt);
      const toRod = this._rodTip.clone().sub(fish.position).normalize();
      fish.position.addScaledVector(toRod, give);
      stretch -= give;
    }

    // El freno es un embrague: mientras la carga lo supere, el carrete cede
    // hilo y la tensión se queda clavada en el valor del freno. Lo único que
    // lo atraviesa son los picos (embestidas y saltos), y por eso apretar el
    // freno al máximo es la forma más rápida de romper la línea.
    const stiffness = lerp(9, 3.5, stats.elasticity);
    const load = Math.max(0, stretch) * stiffness
      + power * (0.55 + Math.abs(this.sidePressure) * 0.07);
    const slipping = load > this.dragForce;
    const shock = slipping ? Math.min(load - this.dragForce, load * 0.2) * (1 - stats.elasticity * 0.5) : 0;
    this.tension = damp(this.tension, Math.min(load, this.dragForce + shock), 11, dt);

    if (slipping) {
      const slip = (load - this.dragForce) * 0.4;
      this.lineOut = Math.min(stats.capacity, this.lineOut + slip * dt);
      this.events?.onDragSlip?.(slip);
    }

    // El pez se cansa por la tensión sostenida, y bastante más rápido si se
    // le está haciendo trabajar de costado.
    const sideBonus = clamp(1 + this.counterPressure * 0.9, 0.45, 1.9);
    const drain = (0.028 + this.tensionRatio * 0.16) * sideBonus / species.stamina;
    f.stamina = clamp(f.stamina - drain * dt, 0, 1);
    fish.energy = f.stamina;

    // --- desenlaces --------------------------------------------------------
    if (this.tension > stats.lineStrength) {
      this._breakLine(fish);
      return;
    }
    if (this.lineOut >= stats.capacity - 0.5) {
      this._breakLine(fish, 'Se acabó el hilo del carrete');
      return;
    }

    // El hilo que cede el freno no es holgura: el pez se lo está llevando.
    // Sólo cuenta como holgura si la línea se afloja sin que nadie tire.
    const slack = this.lineOut - distance;
    if (!slipping && slack > SLACK_TOLERANCE) {
      this.slackTimer += dt;
      if (this.slackTimer > SLACK_GRACE) {
        this._loseFish(fish, 'Demasiada holgura: el anzuelo se ha soltado');
        return;
      }
    } else {
      this.slackTimer = Math.max(0, this.slackTimer - dt * 1.5);
    }

    if (distance < LAND_DISTANCE && f.stamina < 0.3) {
      this._land(fish);
    }
  }

  _breakLine(fish, reason = 'La línea ha roto') {
    this.sidePressure = this.counterPressure = 0;
    this.retrieveInput = 0;
    this.events?.onLineBreak?.(fish);
    this.fishManager.release(fish);
    this.hooked = null;
    this.fight = null;
    this.lure.stow();
    this.line.setVisible(false);
    this.state = FishingState.IDLE;
    this.tension = 0;
    this._say(reason, 'bad');
  }

  _loseFish(fish, reason) {
    this.sidePressure = this.counterPressure = 0;
    this.retrieveInput = 0;
    this.events?.onFishLost?.(fish);
    this.fishManager.release(fish);
    this.hooked = null;
    this.fight = null;
    this.lure.stow();
    this.line.setVisible(false);
    this.state = FishingState.IDLE;
    this.tension = 0;
    this._say(reason, 'bad');
  }

  _land(fish) {
    this.sidePressure = this.counterPressure = 0;
    this.retrieveInput = 0;
    this.state = FishingState.LANDED;
    this.lastCatch = fish;
    this.tension = 0;
    this.lure.stow();
    this.line.setVisible(false);
    this.water.splash(fish.position, 1.4);
    this.events?.onLanded?.(fish);
    this.hooked = null;
    this.fight = null;
  }

  /** Se llama desde la UI cuando el jugador cierra la ficha de captura. */
  finishCatch(keep = true) {
    const fish = this.lastCatch;
    this.lastCatch = null;
    this.state = FishingState.IDLE;
    if (fish) {
      if (keep) this.fishManager.remove(fish);
      else this.fishManager.release(fish);
    }
  }

  _updateLineVisual(dt, context) {
    if (!this.line.mesh.visible) return;
    const end = this.hooked ? this.hooked.position : this.lure.lineAnchor;
    const visualLineOut = this.state === FishingState.FIGHTING
      ? this.lineOut
      : Math.max(this.lineOut, this._rodTip.distanceTo(end));
    this.line.update(dt, this._rodTip, end, visualLineOut, context.wind);
    this.line.setTension(this.tensionRatio);
  }

  /** Datos para el HUD. */
  get hud() {
    return {
      state: this.state,
      power: this.power,
      tension: this.tension,
      tensionRatio: this.tensionRatio,
      lineStrength: this.stats.lineStrength,
      drag: this.dragForce,
      dragSetting: this.dragSetting,
      lineOut: this.lineOut,
      capacity: this.stats.capacity,
      lure: this.equipment.lure,
      hooked: this.hooked ? {
        name: this.hooked.displayName,
        weight: this.hooked.weight,
        stamina: this.fight?.stamina ?? 1,
        sidePressure: this.sidePressure,
        counterPressure: this.counterPressure
      } : null,
      message: this.message
    };
  }

  dispose() {
    this.rod.dispose();
    this.line.dispose();
    this.lure.dispose();
  }
}
