import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/MathUtils.js';

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
    this.mode = 'first';          // 'first' | 'third' (preparado, no expuesto aún)
    this.thirdPersonDistance = 3.4;

    this.platform = null;            // barca u otra plataforma móvil
    this.body = this._buildBody();
    this.rig.add(this.body);

    this._raycaster = new THREE.Raycaster();
    this._down = new THREE.Vector3(0, -1, 0);
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this.lookDelta = new THREE.Vector2();
  }

  get position() { return this.rig.position; }

  /** Figura del pescador: sólo se ve en tercera persona. */
  _buildBody() {
    const body = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({ color: 0x2c4a5e, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd7ab84, roughness: 0.75 });
    const hat = new THREE.MeshStandardMaterial({ color: 0x7a6a3c, roughness: 0.9 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.58, 4, 10), coat);
    torso.position.y = 1.05;
    body.add(torso);
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 4, 8), coat);
      leg.position.set(side * 0.13, 0.42, 0);
      body.add(leg);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 4, 8), coat);
      arm.position.set(side * 0.31, 1.05, 0.05);
      body.add(arm);
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin);
    head.position.y = 1.55;
    body.add(head);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12), hat);
    brim.position.y = 1.63;
    body.add(brim);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat);
    crown.position.y = 1.63;
    body.add(crown);

    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    body.visible = false;
    return body;
  }

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

    this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
    this._right.set(this._forward.z, 0, -this._forward.x);

    const wish = new THREE.Vector3()
      .addScaledVector(this._forward, forwardInput)
      .addScaledVector(this._right, strafeInput);
    if (wish.lengthSq() > 0) wish.normalize();

    const depth = this.terrain.depthAt(this.rig.position.x, this.rig.position.z);
    // Andar dentro del agua cuesta; a partir de cierto calado no se avanza.
    const wadeFactor = depth > 0 ? clamp(1 - depth / WADE_DEPTH, 0.25, 1) : 1;
    const speed = (running ? RUN_SPEED : WALK_SPEED) * wadeFactor;

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

    this.rig.rotation.y = this.yaw;
    this.camera.rotation.set(this.pitch, 0, bobX * 0.35);
    this.camera.position.set(
      this.mode === 'third' ? 0 : bobX * 0.5,
      EYE_HEIGHT + bobY,
      this.mode === 'third' ? this.thirdPersonDistance : 0
    );

    this.lookDelta.multiplyScalar(0.82);
    return { speed: horizontalSpeed, surface: this.surface, depth: Math.max(0, depth) };
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
    this.lookDelta.multiplyScalar(0.82);
    return { speed: Math.abs(this.platform.speed), surface: 'barca', depth: 0 };
  }

  /** Alterna primera y tercera persona; el cuerpo sólo se ve en la segunda. */
  setCameraMode(mode) {
    this.mode = mode === 'third' ? 'third' : 'first';
    this.body.visible = this.mode === 'third';
  }

  teleport(position) {
    this.rig.position.copy(position);
    const g = this.groundHeight(position.x, position.z);
    this.rig.position.y = g.y;
  }
}
