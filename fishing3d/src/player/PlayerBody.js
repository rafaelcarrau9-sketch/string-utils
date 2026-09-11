import * as THREE from 'three';
import { damp, clamp, lerp } from '../core/MathUtils.js';
import { sharedGeometry, capsuleLimb } from '../core/GeometryUtils.js';

/**
 * Cuerpo del pescador, animado por código.
 *
 * No hay mallas con esqueleto ni clips: el cuerpo se monta como una jerarquía
 * de articulaciones —caderas, torso, cuello, hombros, codos, muslos, rodillas—
 * y cada fotograma se calculan sus ángulos a partir del estado del jugador.
 * Es animación procedural: no hay transiciones que mezclar porque nunca hay un
 * salto entre clips, sólo un ciclo continuo que cambia de amplitud y ritmo.
 *
 * Capas, de abajo a arriba:
 *   1. Ciclo de marcha (piernas y brazos, según la velocidad real).
 *   2. Postura (agachado, inclinación al girar, peso al frenar).
 *   3. Respiración y microbalanceo, para que el reposo no sea una estatua.
 *   4. Pose de los brazos según lo que hacen las manos (sujetar la caña).
 */

const SKIN = 0xd7ab84;
const COAT = 0x2c4a5e;
const TROUSERS = 0x3a4048;
const HAT = 0x7a6a3c;

export class PlayerBody {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;

    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.75 });
    const coat = new THREE.MeshStandardMaterial({ color: COAT, roughness: 0.86 });
    const trousers = new THREE.MeshStandardMaterial({ color: TROUSERS, roughness: 0.9 });
    const hat = new THREE.MeshStandardMaterial({ color: HAT, roughness: 0.92 });
    this.materials = [skin, coat, trousers, hat];

    // --- caderas y torso ---------------------------------------------
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.root.add(this.hips);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), coat);
    chest.position.y = 0.26;
    chest.castShadow = true;
    this.torso.add(chest);
    this.chest = chest;

    // --- cuello y cabeza ----------------------------------------------
    this.neck = new THREE.Group();
    this.neck.position.y = 0.55;
    this.torso.add(this.neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), skin);
    head.castShadow = true;
    this.neck.add(head);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.022, 14), hat);
    brim.position.y = 0.075;
    this.neck.add(brim);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat);
    crown.position.y = 0.078;
    this.neck.add(crown);

    // --- brazos --------------------------------------------------------
    this.arms = {};
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * 0.23, 0.44, 0);
      this.torso.add(shoulder);
      shoulder.add(capsuleLimb(coat, 0.055, 0.26));

      const elbow = new THREE.Group();
      elbow.position.y = -0.33;
      shoulder.add(elbow);
      elbow.add(capsuleLimb(skin, 0.048, 0.24));

      this.arms[side] = { shoulder, elbow };
    }

    // --- caña en la mano derecha ---------------------------------------
    // En tercera persona el modelo de primera persona se oculta, así que sin
    // esto el pescador aparecía haciendo el gesto de sujetar la caña con las
    // manos vacías.
    this.heldRod = new THREE.Group();
    this.heldRod.position.set(0, -0.3, 0.02);       // en el puño
    this.heldRod.rotation.set(2.15, 0, -0.25);      // vertical, como se lleva al andar
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.45 });
    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.017, 2.15, 6), rodMat);
    blank.position.y = 1.0;
    blank.castShadow = true;
    this.heldRod.add(blank);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.019, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0xb08b52, roughness: 0.85 })
    );
    grip.position.y = -0.06;
    this.heldRod.add(grip);
    const spool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10),
      new THREE.MeshStandardMaterial({ color: 0x8d939a, roughness: 0.4, metalness: 0.5 })
    );
    spool.rotation.z = Math.PI / 2;
    spool.position.set(0.05, 0.07, 0);
    this.heldRod.add(spool);
    this.arms.R.elbow.add(this.heldRod);

    // --- piernas -------------------------------------------------------
    this.legs = {};
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(sign * 0.11, 0, 0);
      this.hips.add(hip);
      hip.add(capsuleLimb(trousers, 0.075, 0.34));

      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      knee.add(capsuleLimb(trousers, 0.062, 0.32));

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.24), coat);
      foot.position.set(0, -0.42, 0.05);
      foot.castShadow = true;
      knee.add(foot);

      this.legs[side] = { hip, knee, foot };
    }

    this.phase = 0;
    this.stride = 0;
    this.crouch = 0;
    this.breath = 0;
    this.armPose = 0;      // 0 brazos sueltos, 1 sujetando la caña
    // Pose de pesca: lo que el cuerpo está haciendo con la caña ahora mismo.
    // Se mezclan de forma continua, así que no hay cortes entre una y otra.
    this.charge = 0;       // caña echada atrás para lanzar
    this.castSwing = 0;    // latigazo del lanzamiento, se apaga solo
    this.fightPose = 0;    // caña alta peleando
    this.pumpPose = 0;     // sacudida del bombeo
    this.lastFootDown = { L: false, R: false };
  }

  setVisible(value) { this.root.visible = value; }

  /**
   * @param state.speed      velocidad horizontal en m/s
   * @param state.running    si va corriendo
   * @param state.turnRate   giro en rad/s, para que el torso lidere
   * @param state.crouch     0..1
   * @param state.holdingRod 0..1, brazos en posición de caña
   * @param state.fishing  { charge, cast, fighting, tension, pump } lo que
   *        está pasando con el aparejo. En tercera persona el pescador tiene
   *        que hacer lo que dice el HUD: si está cargando, se echa atrás; si
   *        pelea, levanta la caña.
   * @param state.onFoot     falso a bordo de la barca: no hay ciclo de marcha
   * @returns {'L'|'R'|null} pie que acaba de apoyarse, para el sonido de paso
   */
  update(dt, state = {}) {
    const {
      speed = 0, running = false, turnRate = 0,
      crouch = 0, holdingRod = 1, onFoot = true, fishing = null
    } = state;

    this.breath += dt;
    this.crouch = damp(this.crouch, crouch, 8, dt);
    this.armPose = damp(this.armPose, holdingRod, 6, dt);

    // --- pose de pesca ---------------------------------------------------
    const f = fishing ?? {};
    this.charge = damp(this.charge, f.charge ?? 0, 7, dt);
    this.fightPose = damp(this.fightPose, f.fighting ? clamp(0.4 + (f.tension ?? 0) * 0.8, 0.4, 1.2) : 0, 5, dt);
    // El latigazo y el bombeo son golpes: entran de una vez y se apagan.
    if ((f.cast ?? 0) > this.castSwing) this.castSwing = f.cast;
    this.castSwing = damp(this.castSwing, 0, 5.5, dt);
    if ((f.pump ?? 0) > this.pumpPose) this.pumpPose = f.pump;
    this.pumpPose = damp(this.pumpPose, 0, 6.5, dt);

    // --- 1. ciclo de marcha --------------------------------------------
    // La zancada crece con la velocidad; la cadencia, algo menos, para que
    // correr sean pasos más largos y no sólo más rápidos.
    const target = onFoot ? clamp(speed / 3.1, 0, 1.9) : 0;
    this.stride = damp(this.stride, target, 9, dt);
    const cadence = onFoot ? (1.9 + Math.sqrt(Math.max(speed, 0)) * 1.5) : 0;
    this.phase += dt * cadence;

    const swing = Math.sin(this.phase);
    const swingB = Math.sin(this.phase + Math.PI);
    const amp = this.stride * 0.52;

    let stepped = null;
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      const s = sign > 0 ? swing : swingB;
      const leg = this.legs[side];
      leg.hip.rotation.x = s * amp - this.crouch * 0.5;
      // La rodilla sólo dobla cuando la pierna va hacia atrás o al elevarla.
      const bend = Math.max(0, -s) * amp * 1.5 + Math.max(0, Math.sin(this.phase * 2 + (sign > 0 ? 0 : Math.PI))) * amp * 0.35;
      leg.knee.rotation.x = bend + this.crouch * 1.0;
      leg.foot.rotation.x = -leg.hip.rotation.x * 0.4 - leg.knee.rotation.x * 0.5;

      // Momento en que el pie toca el suelo: sirve para el sonido de paso.
      const down = s < -0.85;
      if (down && !this.lastFootDown[side] && this.stride > 0.25) stepped = side;
      this.lastFootDown[side] = down;
    }

    // --- 2. postura -----------------------------------------------------
    // Las caderas suben y bajan con cada paso y bajan al agacharse.
    const bounce = Math.abs(Math.sin(this.phase)) * this.stride * 0.035;
    this.hips.position.y = 0.92 - this.crouch * 0.32 - bounce;
    this.hips.rotation.y = swing * this.stride * 0.09;      // la pelvis rota al andar
    this.hips.rotation.z = clamp(-turnRate * 0.12, -0.12, 0.12);

    // El torso contrarresta a la pelvis y se inclina hacia delante al correr.
    this.torso.rotation.y = -this.hips.rotation.y * 0.7;
    this.torso.rotation.x = this.stride * (running ? 0.14 : 0.06) + this.crouch * 0.35;
    this.torso.rotation.z = clamp(turnRate * 0.16, -0.18, 0.18);

    // --- 3. respiración y microbalanceo ---------------------------------
    const idle = 1 - clamp(this.stride, 0, 1);
    const breathe = Math.sin(this.breath * 1.25) * 0.02 * idle;
    this.chest.scale.set(1 + breathe * 0.4, 1 + breathe, 1 + breathe * 0.4);
    this.torso.rotation.x += breathe * 0.5 + Math.sin(this.breath * 0.43) * 0.012 * idle;
    this.torso.rotation.z += Math.sin(this.breath * 0.37) * 0.016 * idle;
    this.neck.rotation.x = -this.torso.rotation.x * 0.6 + Math.sin(this.breath * 0.6) * 0.02 * idle;

    // --- 4. brazos --------------------------------------------------------
    // Mezcla entre brazos sueltos (balanceo de marcha) y sujetando la caña.
    const free = 1 - this.armPose;
    const swingArm = swingB * amp * 0.75 * free;
    const swingArmB = swing * amp * 0.75 * free;

    // Mano derecha en la empuñadura, izquierda en el carrete. Encima de esa
    // base se suman la carga, el latigazo, la pelea y el bombeo: todos son
    // desplazamientos del mismo gesto, no poses que se sustituyen.
    const carga = this.charge * this.armPose;
    const latigazo = this.castSwing * this.armPose;
    const pelea = this.fightPose * this.armPose;
    const bombeo = this.pumpPose * this.armPose;
    // Cargar echa los brazos atrás y arriba; el latigazo los lanza adelante.
    const hombroDer = -1.05 * this.armPose + swingArm
      - carga * 0.85 + latigazo * 1.25 - pelea * 0.55 - bombeo * 0.5;
    const codoDer = -1.15 * this.armPose - Math.max(0, swingArm) * 0.6
      - carga * 0.35 + latigazo * 0.55 - pelea * 0.3;
    this.arms.R.shoulder.rotation.set(hombroDer, -0.32 * this.armPose - carga * 0.3, -0.3 * this.armPose);
    this.arms.R.elbow.rotation.set(codoDer, 0, 0);
    this.arms.L.shoulder.rotation.set(
      -0.85 * this.armPose + swingArmB - carga * 0.5 + latigazo * 0.8 - pelea * 0.4 - bombeo * 0.35,
      0.42 * this.armPose, 0.34 * this.armPose
    );
    this.arms.L.elbow.rotation.set(
      -1.35 * this.armPose - Math.max(0, swingArmB) * 0.6 - pelea * 0.25, 0, 0
    );

    // El torso acompaña: se abre al cargar, se cierra al soltar y se inclina
    // hacia atrás peleando, que es donde está el peso del pez.
    this.torso.rotation.x += -carga * 0.16 + latigazo * 0.22 - pelea * 0.2 - bombeo * 0.18;
    this.torso.rotation.y += carga * 0.26 - latigazo * 0.3;
    this.hips.rotation.y += carga * 0.12 - latigazo * 0.14;

    // Y la caña que sostiene sigue el gesto en vez de quedarse clavada.
    if (this.heldRod) {
      this.heldRod.rotation.x = 2.15 + carga * 0.5 - latigazo * 0.9 - pelea * 0.55 - bombeo * 0.4;
      this.heldRod.rotation.z = -0.25 - pelea * 0.18;
    }

    // La caña aparece con la pose: guardada, la mano queda libre.
    this.heldRod.visible = this.armPose > 0.08;
    this.heldRod.scale.setScalar(clamp(this.armPose, 0.001, 1));

    return stepped;
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.materials.forEach((m) => m.dispose());
  }
}
