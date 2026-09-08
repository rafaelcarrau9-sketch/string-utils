import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Superficie del lago.
 *
 * Usa el shader `Water` de three, que resuelve el reflejo con una cámara
 * espejo y un render target: el cielo, los árboles y el muelle se reflejan de
 * verdad. La refracción completa exigiría una segunda pasada; en su lugar la
 * superficie es translúcida y el color del agua se oscurece con la
 * profundidad, que da la lectura correcta a un coste mucho menor.
 *
 * Además gestiona las ondas circulares que deja el señuelo al caer.
 */

const RIPPLE_LIFETIME = 2.6;

export class WaterBody {
  constructor(textures, { size = 620, reflectionSize = 512, sunDirection, level = 0 } = {}) {
    this.level = level;
    this.ripples = [];

    const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
    this.water = new Water(geometry, {
      textureWidth: reflectionSize,
      textureHeight: reflectionSize,
      waterNormals: textures.waterNormals(),
      sunDirection: sunDirection ? sunDirection.clone() : new THREE.Vector3(0.7, 0.7, 0),
      sunColor: 0xffffff,
      waterColor: 0x0d2630,
      distortionScale: 3.4,
      alpha: 0.9,
      fog: true
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = level;
    this.water.material.transparent = true;
    // `size` escala las coordenadas de mundo dentro del mapa de normales: con
    // el valor por defecto (1) las olas son kilométricas y el lago se ve liso.
    this.water.material.uniforms.size.value = 28;
    this.water.name = 'agua';

    // Grupo de ondas: anillos que crecen y se desvanecen.
    this.rippleGroup = new THREE.Group();
    this.rippleGroup.position.y = level + 0.02;
    this._rippleGeometry = new THREE.RingGeometry(0.06, 0.1, 24);
    this._rippleGeometry.rotateX(-Math.PI / 2);
  }

  addTo(scene) {
    scene.add(this.water);
    scene.add(this.rippleGroup);
  }

  /** Onda expansiva en la superficie: caída del señuelo, pez que colea... */
  splash(position, strength = 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xdff0f5, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false
    });
    const ring = new THREE.Mesh(this._rippleGeometry, material);
    ring.position.set(position.x, 0, position.z);
    ring.userData = { age: 0, strength: clamp(strength, 0.2, 3) };
    this.rippleGroup.add(ring);
    this.ripples.push(ring);
    if (this.ripples.length > 40) this._retire(this.ripples[0]);
  }

  _retire(ring) {
    const i = this.ripples.indexOf(ring);
    if (i >= 0) this.ripples.splice(i, 1);
    this.rippleGroup.remove(ring);
    ring.material.dispose();
  }

  update(dt, { sunDirection, sunColor, waterColor, choppiness = 1 } = {}) {
    const u = this.water.material.uniforms;
    u.time.value += dt * 0.55 * choppiness;
    u.distortionScale.value = 2.2 + choppiness * 2.6;
    u.size.value = 24 + choppiness * 8;
    if (sunDirection) u.sunDirection.value.copy(sunDirection).normalize();
    if (sunColor) u.sunColor.value.copy(sunColor);
    if (waterColor) u.waterColor.value.copy(waterColor);

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ring = this.ripples[i];
      const data = ring.userData;
      data.age += dt;
      const t = data.age / RIPPLE_LIFETIME;
      if (t >= 1) { this._retire(ring); continue; }
      const scale = 1 + t * 34 * data.strength;
      ring.scale.setScalar(scale);
      ring.material.opacity = 0.5 * (1 - t) * (1 - t);
    }
  }

  /** Altura de la lámina de agua incluyendo el oleaje aproximado. */
  surfaceHeight(x, z, time) {
    return this.level +
      Math.sin(x * 0.28 + time * 1.1) * 0.035 +
      Math.sin(z * 0.21 - time * 0.9) * 0.03;
  }

  dispose() {
    this.water.geometry.dispose();
    this.water.material.dispose();
    this._rippleGeometry.dispose();
  }
}
