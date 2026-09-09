import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createRandom, clamp, lerp } from '../core/MathUtils.js';

/**
 * Cielo e iluminación global.
 *
 * Reúne el cielo atmosférico de Preetham, el sol y la luna como luces
 * direccionales, un campo de estrellas y dos capas de nubes. La sombra sigue
 * al jugador: el volumen del mapa entero no cabría en un shadow map decente.
 */

const SKY_SCALE = 3000;
// Cuánto se atenúa el cielo para poder exponer el resto de la escena.
const SKY_DIM = 0.40;

export class SkyDome {
  constructor(scene, textures, preset) {
    this.scene = scene;

    this.sky = new Sky();
    this.sky.scale.setScalar(SKY_SCALE);
    // El cielo de Preetham emite muchísima más luz que cualquier superficie del
    // lago. Con una sola exposición para todo había que bajarla tanto que el
    // resto de la escena salía casi negro: el arbolado era una silueta y la
    // orilla, una mancha marrón. Se atenúa el cielo en su propio shader y se
    // devuelve la exposición del render a un valor normal, así que el cielo
    // sigue igual de luminoso y todo lo demás recibe la luz que le toca.
    // Y con el sol bajo el horizonte, Preetham devuelve un pardo sucio en vez de
    // una noche: se mezcla con el azul nocturno de la paleta.
    this.sky.material.uniforms.uNight = { value: 0 };
    this.sky.material.uniforms.uNightColor = { value: new THREE.Color(0x0a1224) };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('varying vec3 vSunDirection;',
        'varying vec3 vSunDirection;\nuniform float uNight;\nuniform vec3 uNightColor;')
      .replace('gl_FragColor = vec4( retColor, 1.0 );',
        `gl_FragColor = vec4( mix( retColor * ${SKY_DIM.toFixed(3)}, uNightColor, uNight ), 1.0 );`);
    this.sky.material.needsUpdate = true;
    this.sky.material.uniforms.turbidity.value = 2.2;
    this.sky.material.uniforms.rayleigh.value = 3.1;
    this.sky.material.uniforms.mieCoefficient.value = 0.0028;
    this.sky.material.uniforms.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = preset.shadows;
    if (preset.shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      s.camera.near = 1;
      s.camera.far = 460;
      s.camera.left = s.camera.bottom = -150;
      s.camera.right = s.camera.top = 150;
      s.bias = -0.0012;
      s.normalBias = 0.035;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9fb6de, 0);
    scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight(0x9dc0e8, 0x40402c, 0.5);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x404050, 0.35);
    scene.add(this.ambient);

    this._buildStars();
    this._buildClouds(textures);
  }

  _buildStars(count = 1400) {
    const rng = createRandom(88);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Distribución uniforme en la media esfera superior.
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = Math.abs(u);
      positions.set([r * Math.cos(theta) * 2400, y * 2400 + 60, r * Math.sin(theta) * 2400], i * 3);
      sizes[i] = 1 + Math.pow(rng(), 6) * 5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xdfe8ff, size: 3.2, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false
    }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _buildClouds(textures) {
    const texture = textures.clouds();
    this.cloudLayers = [];
    for (let i = 0; i < 2; i++) {
      const map = texture.clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(16 + i * 6, 16 + i * 6);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(5200, 5200),
        new THREE.MeshBasicMaterial({
          map, transparent: true, opacity: 0, depthWrite: false,
          side: THREE.DoubleSide, fog: false
        })
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 620 + i * 190;
      mesh.renderOrder = -1;
      this.cloudLayers.push(mesh);
      this.scene.add(mesh);
    }
  }

  /** `focus` es la posición del jugador: la sombra se encaja a su alrededor. */
  update(time, weather, dt, focus = null) {
    const sunDir = time.sunDirection;
    this.sky.material.uniforms.sunPosition.value.copy(sunDir).multiplyScalar(SKY_SCALE * 0.5);
    this.sky.material.uniforms.turbidity.value = lerp(2.2, 9, weather.cloudiness);
    this.sky.material.uniforms.rayleigh.value = lerp(3.1, 0.8, weather.cloudiness);

    const daylight = clamp(Math.sin(time.elevation) * 2.2, 0, 1);
    const overcast = 1 - weather.cloudiness * 0.62;

    if (focus) {
      this.sun.position.copy(focus).addScaledVector(sunDir, 210);
      this.sun.target.position.copy(focus);
      this.sun.target.updateMatrixWorld();
      this.sky.position.set(focus.x, 0, focus.z);
      this.stars.position.set(focus.x, 0, focus.z);
      this.cloudLayers.forEach((l) => l.position.set(focus.x, l.position.y, focus.z));
    } else {
      this.sun.position.copy(sunDir).multiplyScalar(140);
    }
    this.sun.color.copy(time.sunColor);
    this.sun.intensity = time.sunIntensity * overcast;
    this.sun.visible = this.sun.intensity > 0.01;

    this.moon.position.copy(focus || new THREE.Vector3()).addScaledVector(time.moonDirection, 140);
    this.moon.intensity = time.nightFactor * 0.5 * overcast;
    this.moon.visible = this.moon.intensity > 0.01;

    this.hemi.color.copy(time.skyColor);
    this.hemi.intensity = lerp(0.5, 3.2, daylight) * overcast;
    this.ambient.color.copy(time.ambientColor);
    this.ambient.intensity = lerp(1.2, 1.15, daylight);

    this.sky.material.uniforms.uNight.value = time.nightFactor * 0.88;
    this.sky.material.uniforms.uNightColor.value.copy(time.skyColor);

    this.stars.material.opacity = time.nightFactor * (1 - weather.cloudiness * 0.85);
    this.stars.visible = this.stars.material.opacity > 0.02;
    this.stars.rotation.y += dt * 0.0035;

    this.cloudLayers.forEach((layer, i) => {
      // Con el cielo despejado no debe quedar ni un velo: antes, una nubosidad
      // residual del 10 % se veía de noche como una capa de suciedad sobre las
      // estrellas. Y de noche las nubes no se iluminan solas.
      layer.material.opacity = clamp((weather.cloudiness - 0.16) * 1.15, 0, 0.9)
        * (i === 0 ? 1 : 0.6) * lerp(0.3, 1, daylight);
      layer.visible = layer.material.opacity > 0.02;
      layer.material.color.copy(time.skyColor).lerp(new THREE.Color(0xffffff), 0.55 - weather.cloudiness * 0.4);
      layer.material.map.offset.x += dt * weather.windSpeed * 0.0016 * (i + 1);
      layer.material.map.offset.y += dt * weather.windSpeed * 0.0007 * (i + 1);
    });
  }

  dispose() {
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.cloudLayers.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
  }
}
