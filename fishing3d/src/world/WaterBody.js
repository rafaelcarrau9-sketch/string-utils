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
  constructor(textures, { size = 620, reflectionSize = 512, sunDirection, level = 0, terrain = null, zoneId = 'zona' } = {}) {
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
    if (terrain) this._addDepthTransparency(textures, terrain, zoneId);
    this.water.name = 'agua';

    // Grupo de ondas: anillos que crecen y se desvanecen.
    this.rippleGroup = new THREE.Group();
    this.rippleGroup.position.y = level + 0.02;
    this._rippleGeometry = new THREE.RingGeometry(0.06, 0.1, 24);
    this._rippleGeometry.rotateX(-Math.PI / 2);
  }

  /**
   * Hace que el agua deje ver el fondo donde cubre poco.
   *
   * La transparencia se modula además con el Fresnel del propio shader: a
   * rasante el lago sigue siendo un espejo (que es lo que se ve de verdad
   * desde la orilla), y sólo mirando hacia abajo se transparenta el bajío.
   */
  _addDepthTransparency(textures, terrain, zoneId) {
    const material = this.water.material;
    material.uniforms.uDepthMap = { value: textures.depthMap(terrain, 512, `depthMap:${zoneId}`) };
    material.uniforms.uWorldHalf = { value: terrain.field.half };
    material.uniforms.uMaxDepth = { value: terrain.field.maxDepth };

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDepthMap = material.uniforms.uDepthMap;
      shader.uniforms.uWorldHalf = material.uniforms.uWorldHalf;
      shader.uniforms.uMaxDepth = material.uniforms.uMaxDepth;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `
          uniform sampler2D uDepthMap;
          uniform float uWorldHalf;
          uniform float uMaxDepth;
          void main() {
        `)
        .replace(
          'gl_FragColor = vec4( outgoingLight, alpha );',
          `
          vec2 depthUv = (worldPosition.xz + uWorldHalf) / (uWorldHalf * 2.0);
          float lakeDepth = texture2D(uDepthMap, depthUv).r * uMaxDepth;

          float body = smoothstep(0.05, 3.2, lakeDepth);
          float seeThrough = mix(0.06, alpha, body);
          // El Fresnel de este shader arranca en 0.3 incluso de frente, así que
          // se eleva a una potencia: sólo la reflexión rasante —la que de verdad
          // convierte el lago en espejo— vuelve opaca la lámina.
          float finalAlpha = mix(seeThrough, alpha, pow(reflectance, 2.2));

          // Franja clara justo en la orilla: la lámina fina moja la arena.
          float wetLine = 1.0 - smoothstep(0.0, 0.35, lakeDepth);
          vec3 tinted = mix(outgoingLight, outgoingLight + vec3(0.06, 0.07, 0.06), wetLine * 0.5);
          tinted = mix(tinted, tinted * 0.82 + waterColor * 0.4, body * 0.7);

          gl_FragColor = vec4( tinted, finalAlpha );
          `
        );
    };
    material.customProgramCacheKey = () => 'aguaProfundidad';
    material.needsUpdate = true;
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
