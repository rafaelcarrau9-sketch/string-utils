import * as THREE from 'three';
import { damp, clamp, lerp } from '../core/MathUtils.js';

/**
 * Caña en primera persona, animada por poses.
 *
 * No hay clips ni esqueleto: cada situación —reposo, cargando, lanzando,
 * pescando, peleando— define una pose (posición y rotación de la mano) y el
 * conjunto se interpola hacia ella con amortiguación. Así nunca hay saltos
 * entre animaciones: lo que se ve es siempre la mezcla del estado anterior y
 * el nuevo.
 *
 * Encima de la pose van capas procedurales que no dependen del estado:
 * respiración en reposo, inercia al mover la vista, el barrido del
 * lanzamiento, el bombeo al recoger y la curvatura del blank según la tensión.
 */

export const RodPose = {
  IDLE: 'idle',
  CHARGE: 'charge',
  CAST: 'cast',
  FISH: 'fish',
  FIGHT: 'fight'
};

// Posición de la mano y ángulos base de cada pose.
const POSES = {
  idle:   { pos: [0.40, -0.30, -0.42], rot: [0.20, -0.30, 0.20], lift: 0 },
  charge: { pos: [0.50, -0.26, -0.30], rot: [0.44, -0.60, 0.40], lift: 0 },
  cast:   { pos: [0.38, -0.28, -0.44], rot: [0.17, -0.26, 0.17], lift: 0 },
  fish:   { pos: [0.38, -0.28, -0.44], rot: [0.17, -0.26, 0.17], lift: 0 },
  fight:  { pos: [0.30, -0.20, -0.38], rot: [0.46, -0.18, 0.24], lift: 1 }
};

const CAST_DURATION = 0.42;

export class Rod {
  constructor(camera, equipment) {
    this.equipment = equipment;
    this.pose = RodPose.IDLE;
    this.bend = 0;
    this.sway = new THREE.Vector2();
    this.breath = 0;
    this.castTimer = 0;
    this.castPower = 0;
    this.windUp = 0;          // carga suavizada: sin esto caía de golpe al soltar
    this.reelAngle = 0;
    this.pump = 0;
    this.twitch = 0;
    this.strikeKick = 0;

    // Nodo que se interpola hacia la pose; los hijos cuelgan de él.
    this.group = new THREE.Group();
    this.current = {
      pos: new THREE.Vector3(...POSES.idle.pos),
      rot: new THREE.Vector3(...POSES.idle.rot)
    };
    this.group.position.copy(this.current.pos);
    camera.add(this.group);

    const blank = new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.35, metalness: 0.35 });
    const cork = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 0.95 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.28, metalness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd7ab84, roughness: 0.7 });
    this.materials = [blank, cork, metal, skin];
    this.material = blank;

    // Empuñadura de corcho
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.027, 0.3, 10), cork);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.11;
    this.group.add(grip);

    // Carrete: cuerpo, bobina y manivela que gira al recoger
    const reel = new THREE.Group();
    reel.position.set(0, -0.058, 0.02);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.055, 14), metal);
    housing.rotation.z = Math.PI / 2;
    reel.add(housing);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 14), blank);
    spool.rotation.z = Math.PI / 2;
    spool.position.y = 0.04;
    reel.add(spool);
    this.crank = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.055, 0.008), metal);
    arm.position.y = 0.028;
    this.crank.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), cork);
    knob.position.y = 0.056;
    this.crank.add(knob);
    this.crank.position.set(0.042, 0, 0);
    reel.add(this.crank);
    this.group.add(reel);
    this.reel = reel;

    // Antebrazo y mano sujetando la empuñadura
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.17, 4, 8), skin);
    forearm.rotation.set(1.3, 0, -0.22);
    forearm.position.set(0.05, -0.1, 0.3);
    this.group.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), skin);
    hand.scale.set(1, 0.8, 1.3);
    hand.position.set(0.01, -0.024, 0.13);
    this.group.add(hand);

    this._buildBlank();
    this.tip = new THREE.Object3D();
    this.group.add(this.tip);
  }

  _buildBlank() {
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -0.45),
      new THREE.Vector3(0, 0, -0.9),
      new THREE.Vector3(0, 0, -1.35)
    ]);
    this.blank = new THREE.Mesh(
      new THREE.TubeGeometry(this.curve, 20, 0.007, 5, false),
      this.material
    );
    this.group.add(this.blank);

    // Anillas guía a lo largo del blank
    this.guides = [];
    const guideMaterial = this.materials[2];
    [0.3, 0.62, 0.95, 1.2].forEach((t) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 5, 10), guideMaterial);
      ring.rotation.y = Math.PI / 2;
      this.group.add(ring);
      this.guides.push({ mesh: ring, t });
    });
  }

  /** Cambia de pose. La transición la hace la interpolación, no un corte. */
  setPose(pose) {
    if (!POSES[pose] || this.pose === pose) return;
    if (pose === RodPose.CAST) {
      this.castTimer = CAST_DURATION;
      this.castPower = clamp(this.windUp, 0.25, 1);   // el latigazo hereda la carga
    }
    this.pose = pose;
  }

  /** Golpe seco al clavar el anzuelo. */
  strike() { this.strikeKick = 1; }
  /** Temblor de la puntera cuando el pez tantea el cebo. */
  nibble(strength = 1) { this.twitch = Math.max(this.twitch, strength); }

  /**
   * @param dt
   * @param state.tensionRatio  0..1 respecto a lo que aguanta la caña
   * @param state.retrieve      0..1 cuánto se recoge
   * @param state.sidePressure  -1..1 hacia dónde se ladea
   * @param state.power         0..1 carga del lanzamiento
   * @param state.lookDelta     movimiento de ratón, para la inercia
   * @param state.surge         0..1 el pez está embistiendo
   */
  update(dt, state = {}) {
    const {
      tensionRatio = 0, retrieve = 0, sidePressure = 0,
      power = 0, lookDelta = { x: 0, y: 0 }, surge = 0
    } = state;

    const target = POSES[this.pose] || POSES.idle;
    this.breath += dt;
    this.castTimer = Math.max(0, this.castTimer - dt);
    this.strikeKick = damp(this.strikeKick, 0, 7, dt);
    this.twitch = damp(this.twitch, 0, 5, dt);

    // --- pose base, siempre interpolada -------------------------------
    const speed = this.pose === RodPose.CAST ? 11 : 7;
    this.current.pos.x = damp(this.current.pos.x, target.pos[0], speed, dt);
    this.current.pos.y = damp(this.current.pos.y, target.pos[1], speed, dt);
    this.current.pos.z = damp(this.current.pos.z, target.pos[2], speed, dt);
    this.current.rot.x = damp(this.current.rot.x, target.rot[0], speed, dt);
    this.current.rot.y = damp(this.current.rot.y, target.rot[1], speed, dt);
    this.current.rot.z = damp(this.current.rot.z, target.rot[2], speed, dt);

    // --- capas procedurales -------------------------------------------
    // Respiración: la caña nunca está del todo quieta.
    const breathe = Math.sin(this.breath * 1.15) * 0.008 + Math.sin(this.breath * 0.7) * 0.005;
    // Inercia al girar la vista: la caña "pesa".
    this.sway.x = damp(this.sway.x, clamp(-lookDelta.x * 0.0022, -0.09, 0.09), 6, dt);
    this.sway.y = damp(this.sway.y, clamp(-lookDelta.y * 0.0022, -0.09, 0.09), 6, dt);
    // Cargar el lanzamiento echa la caña atrás. Se amortigua en lugar de leer
    // la potencia cruda: al soltar, ésta se pone a cero en un fotograma y la
    // mano daba un tirón de 5 cm.
    this.windUp = damp(this.windUp, this.pose === RodPose.CHARGE ? power : 0, 9, dt);
    const windUp = this.windUp;
    // Latigazo: la caña carga, se desdobla hacia delante y vuelve. Arranca en
    // cero, así que la transición es continua sin necesidad de mezclar poses.
    const castPhase = this.castTimer / CAST_DURATION;
    const sweep = castPhase > 0
      ? Math.sin(castPhase * Math.PI) * castPhase * this.castPower
      : 0;
    // Bombeo al recoger, más marcado cuanto más pesa el pez.
    this.pump = damp(this.pump, retrieve * (0.4 + tensionRatio), 8, dt);
    const pumping = Math.sin(this.breath * 6.5) * this.pump * 0.045;

    this.group.position.set(
      this.current.pos.x + this.sway.x * 0.6 - sweep * 0.09,
      this.current.pos.y + breathe + pumping - windUp * 0.03 + sweep * 0.04,
      this.current.pos.z - sweep * 0.22 + windUp * 0.06
    );
    this.group.rotation.set(
      this.current.rot.x + this.sway.y + breathe * 0.5 - sweep * 0.75
        + this.strikeKick * -0.5 + pumping * 1.4,
      this.current.rot.y - windUp * 0.25 + sidePressure * 0.35,
      this.current.rot.z + this.sway.x + sidePressure * 0.28
    );

    // --- curvatura del blank ------------------------------------------
    // Se dobla con la tensión, con el barrido del lance y con las embestidas.
    const targetBend = clamp(
      tensionRatio * 1.05 + sweep * 0.8 + windUp * 0.45 + surge * 0.25 + this.strikeKick * 0.6,
      0, 1.5
    );
    this.bend = damp(this.bend, targetBend, this.pose === RodPose.CAST ? 18 : 9, dt);

    const b = this.bend;
    const shiver = this.twitch * Math.sin(this.breath * 34) * 0.05;
    const points = this.curve.points;
    points[1].set(shiver * 0.2, -b * 0.04, -0.45);
    points[2].set(shiver * 0.6, -b * 0.17, -0.88);
    points[3].set(shiver, -b * 0.4, -1.3 + b * 0.07);

    // El tubo sólo se rehace cuando la forma cambia de verdad. Regenerarlo
    // cada fotograma eran 60 geometrías por segundo tiradas a la basura, y a
    // simple vista no se distingue de esta versión cuantizada.
    const shape = Math.round(b * 60) * 1000 + Math.round(shiver * 400);
    if (shape !== this._shapeKey) {
      this._shapeKey = shape;
      this.blank.geometry.dispose();
      this.blank.geometry = new THREE.TubeGeometry(this.curve, 20, 0.007, 5, false);
    }

    // Las anillas siguen la curva.
    const p = new THREE.Vector3();
    this.guides.forEach(({ mesh, t }) => {
      this.curve.getPoint(t / 1.35, p);
      mesh.position.copy(p);
    });

    this.tip.position.copy(points[3]);

    // --- carrete --------------------------------------------------------
    this.reelAngle += retrieve * dt * 11;
    this.crank.rotation.z = this.reelAngle;
    this.reel.rotation.z = Math.sin(this.reelAngle) * 0.02;
  }

  /** Puntera en coordenadas de mundo: de ahí sale la línea. */
  worldTip(out = new THREE.Vector3()) {
    return this.tip.getWorldPosition(out);
  }

  setVisible(value) { this.group.visible = value; }

  dispose() {
    this.blank.geometry.dispose();
    this.materials.forEach((m) => m.dispose());
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}
