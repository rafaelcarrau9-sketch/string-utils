import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/MathUtils.js';
import { PlayerBody } from './PlayerBody.js';

/**
 * Jugador en primera persona.
 *
 * La cámara vive dentro de un "rig" para dejar preparada la tercera persona:
 * basta con alejar `camera` del pivote y añadir un modelo visible; el resto
 * del control no cambia. El movimiento sigue el terreno de forma analítica
 * (sin física de cuerpos) y sólo lanza un rayo hacia abajo para subirse al
 * muelle y demás construcciones.
 */

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 3.1;
const RUN_SPEED = 5.6;
const WADE_DEPTH = 1.05;

export class Player {
  constructor(camera, terrain, { spawn = new THREE.Vector3(0, 0, 0), walkables = [] } = {}) {
    this.terrain = terrain;
    this.camera = camera;
    this.walkables = walkables;

    this.rig = new THREE.Object3D();
    this.rig.position.copy(spawn);
    this.rig.add(camera);
    camera.position.set(0, EYE_HEIGHT, 0);

    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.surface = 'tierra';
    this.mode = 'first';          // 'first' | 'third'
    this.onModeChange = null;     // lo engancha Game para ocultar la caña de mano
    this.thirdPersonDistance = 3.4;

    this.platform = null;            // barca u otra plataforma móvil
    this.crouch = 0;
    this.bodyRig = new PlayerBody();
    this.body = this.bodyRig.root;
    this.rig.add(this.body);

    this._raycaster = new THREE.Raycaster();
    this._down = new THREE.Vector3(0, -1, 0);
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this.lookDelta = new THREE.Vector2();
    this.lean = 0;
    this.lastYaw = 0;
  }

  get position() { return this.rig.position; }

  /** Sube o baja de una plataforma móvil (la barca). */
  setPlatform(platform) {
    this.platform = platform;
    if (platform) platform.board(); 
  }

  /** Altura pisable: terreno o cualquier estructura por encima (muelle, barca). */
  groundHeight(x, z) {
    const terrainY = this.terrain.heightAt(x, z);
    if (!this.walkables.length) return { y: terrainY, surface: 'tierra' };

    this._raycaster.set(new THREE.Vector3(x, terrainY + 6, z), this._down);
    this._raycaster.far = 8;
    const hits = this._raycaster.intersectObjects(this.walkables, true);
    if (hits.length && hits[0].point.y > terrainY + 0.15) {
      return { y: hits[0].point.y, surface: 'madera' };
    }
    return { y: terrainY, surface: terrainY < this.terrain.waterLevel ? 'agua' : 'tierra' };
  }

  look(dx, dy, sensitivity = 1, invertY = false) {
    this.lookDelta.set(dx, dy);
    this.yaw -= dx * 0.0022 * sensitivity;
    this.pitch -= dy * 0.0022 * sensitivity * (invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  update(dt, input) {
    if (this.platform) return this._updateOnPlatform(dt, input);
    const forwardInput = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafeInput = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const crouching = input.isDown('ControlLeft') || input.isDown('KeyC');
    this.crouch = damp(this.crouch, crouching ? 1 : 0, 9, dt);

    this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
    this._right.set(this._forward.z, 0, -this._forward.x);

    const wish = new THREE.Vector3()
      .addScaledVector(this._forward, forwardInput)
      .addScaledVector(this._right, strafeInput);
    if (wish.lengthSq() > 0) wish.normalize();

    const depth = this.terrain.depthAt(this.rig.position.x, this.rig.position.z);
    // Andar dentro del agua cuesta; a partir de cierto calado no se avanza.
    const wadeFactor = depth > 0 ? clamp(1 - depth / WADE_DEPTH, 0.25, 1) : 1;
    // Agachado se anda despacio, pero se pesca sin espantar tanto al pez.
    const speed = (running ? RUN_SPEED : WALK_SPEED) * wadeFactor * (1 - this.crouch * 0.55);

    this.velocity.x = damp(this.velocity.x, wish.x * speed, 12, dt);
    this.velocity.z = damp(this.velocity.z, wish.z * speed, 12, dt);

    const next = this.rig.position.clone().addScaledVector(this.velocity, dt);
    const ground = this.groundHeight(next.x, next.z);
    const nextDepth = this.terrain.waterLevel - ground.y;

    // Bloqueo suave: no se entra a nadar.
    if (ground.surface === 'agua' && nextDepth > WADE_DEPTH) {
      this.velocity.multiplyScalar(0.1);
    } else {
      this.rig.position.x = next.x;
      this.rig.position.z = next.z;
    }

    const target = this.groundHeight(this.rig.position.x, this.rig.position.z);
    this.surface = target.surface;
    this.rig.position.y = damp(this.rig.position.y, target.y, 14, dt);

    // Balanceo de cabeza proporcional a la velocidad real.
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.stepping = horizontalSpeed > 0.6;
    this.bobPhase += dt * horizontalSpeed * 2.1;
    this.bobAmount = damp(this.bobAmount, clamp(horizontalSpeed / RUN_SPEED, 0, 1), 6, dt);

    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.028 * this.bobAmount;

    // Inclinación: al desplazarse de lado y al girar, el cuerpo se ladea. Es
    // lo que separa "una cámara que se traslada" de "alguien andando".
    const strafeLean = -strafeInput * 0.022 * clamp(horizontalSpeed / RUN_SPEED, 0, 1);
    let turnDelta = this.yaw - this.lastYaw;
    while (turnDelta > Math.PI) turnDelta -= Math.PI * 2;
    while (turnDelta < -Math.PI) turnDelta += Math.PI * 2;
    this.lastYaw = this.yaw;
    const turnLean = clamp(turnDelta * 0.5, -0.03, 0.03);
    this.lean = damp(this.lean, strafeLean + turnLean, 7, dt);

    this.rig.rotation.y = this.yaw;
    this.camera.rotation.set(this.pitch, 0, bobX * 0.35 + this.lean);

    let back = 0;
    if (this.mode === 'third') {
      // La cámara se acerca al jugador si el terreno se interpone, en vez de
      // meterse dentro de la ladera.
      back = this.thirdPersonDistance;
      const behind = new THREE.Vector3(0, EYE_HEIGHT, back).applyAxisAngle(
        new THREE.Vector3(0, 1, 0), this.yaw
      ).add(this.rig.position);
      const ground = this.terrain.heightAt(behind.x, behind.z) + 0.6;
      if (behind.y < ground) {
        const room = clamp((behind.y - this.rig.position.y) / Math.max(0.01, ground - this.rig.position.y), 0.25, 1);
        back = this.thirdPersonDistance * room;
      }
      this.thirdPersonCurrent = damp(this.thirdPersonCurrent ?? back, back, 8, dt);
      back = this.thirdPersonCurrent;
    }

    this.camera.position.set(
      this.mode === 'third' ? 0 : bobX * 0.5,
      EYE_HEIGHT - this.crouch * 0.45 + bobY,
      back
    );

    // El cuerpo se anima siempre: en primera persona está oculto, pero al
    // cambiar de cámara ya está en la pose correcta en vez de arrancar de cero.
    this.stepped = this.bodyRig.update(dt, {
      speed: horizontalSpeed,
      running,
      turnRate: turnDelta / Math.max(dt, 1e-3),
      crouch: this.crouch,
      holdingRod: this.holdingRod ?? 1,
      onFoot: !this.platform
    });

    this.lookDelta.multiplyScalar(0.82);
    return {
      speed: horizontalSpeed,
      surface: this.surface,
      depth: Math.max(0, depth),
      stepped: this.stepped,
      crouch: this.crouch
    };
  }

  /** Embarcado: rema en vez de andar, y la vista sigue al asiento. */
  _updateOnPlatform(dt, input) {
    const seat = this.platform.seatPosition();
    this.rig.position.copy(seat);
    this.rig.rotation.y = this.yaw;

    const bob = Math.sin(this.bobPhase) * 0.012;
    this.bobPhase += dt * 1.6;
    this.camera.rotation.set(this.pitch, 0, 0);
    this.camera.position.set(
      0,
      EYE_HEIGHT * 0.62 + bob,
      this.mode === 'third' ? this.thirdPersonDistance : 0
    );
    this.surface = 'barca';
    this.bodyRig.update(dt, {
      speed: 0, running: false, turnRate: 0,
      crouch: 0.55, holdingRod: this.holdingRod ?? 1, onFoot: false
    });
    this.lookDelta.multiplyScalar(0.82);
    return { speed: Math.abs(this.platform.speed), surface: 'barca', depth: 0, stepped: null, crouch: 0.55 };
  }

  /** Alterna primera y tercera persona; el cuerpo sólo se ve en la segunda. */
  setCameraMode(mode) {
    this.mode = mode === 'third' ? 'third' : 'first';
    this.bodyRig.setVisible(this.mode === 'third');
    // El modelo de primera persona y el cuerpo no pueden verse a la vez. Vivía
    // en el manejador de teclas, así que cualquier otra vía de cambio de cámara
    // dejaba las dos cañas en pantalla.
    this.onModeChange?.(this.mode);
  }

  teleport(position) {
    this.rig.position.copy(position);
    const g = this.groundHeight(position.x, position.z);
    this.rig.position.y = g.y;
  }
}
