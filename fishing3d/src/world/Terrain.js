import * as THREE from 'three';
import { createHeightField, WATER_LEVEL } from './TerrainShape.js';
import { clamp, smoothstep, makeValueNoise2D, fbm } from '../core/MathUtils.js';

/**
 * Malla del terreno.
 *
 * Una sola geometría con colores por vértice: el material base es neutro y el
 * color decide si un punto se lee como limo, arena, hierba o roca. Así hay
 * transiciones suaves entre biomas con una única draw call, en vez de varias
 * capas de textura mezcladas en un shader.
 */

const COLORS = {
  limo:   new THREE.Color(0x403a26),
  fondo:  new THREE.Color(0x6b6141),
  arena:  new THREE.Color(0xbda97e),
  hierba: new THREE.Color(0x53703a),
  seca:   new THREE.Color(0x7b8248),
  roca:   new THREE.Color(0x8b8880)
};

export class Terrain {
  constructor(textures, options = {}) {
    this.field = createHeightField(options);
    this.waterLevel = WATER_LEVEL;
    const bedShallow = new THREE.Color(options.bedShallow ?? COLORS.fondo.getHex());
    const bedDeep = new THREE.Color(options.bedDeep ?? COLORS.limo.getHex());
    const deepAt = Math.max(2.5, (options.maxDepth ?? 9.5) * 0.62);

    const { resolution, size } = this.field;
    const geometry = new THREE.PlaneGeometry(size, size, resolution - 1, resolution - 1);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const tint = makeValueNoise2D(4242);
    const color = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const h = this.field.heightAt(x, z);
      position.setY(i, h);

      const slope = this.field.slopeAt(x, z);
      const variation = fbm(tint, x * 0.03, z * 0.03, 3, 0.5);

      if (h < -0.35) {
        // Fondo: arena o grava en el bajío, limo oscuro en lo hondo. La
        // profundidad a la que oscurece depende del calado de la zona, o un
        // río de tres metros saldría tan negro como una hoya de veinte.
        color.copy(bedShallow).lerp(bedDeep, smoothstep(-1.2, -deepAt, h));
      } else if (h < 0.85) {
        color.copy(COLORS.arena).lerp(COLORS.fondo, smoothstep(0.85, -0.35, h) * 0.55);
      } else {
        const dry = smoothstep(6, 20, h) * 0.6 + variation * 0.25;
        color.copy(COLORS.hierba).lerp(COLORS.seca, clamp(dry, 0, 1));
      }
      // La roca asoma donde la pendiente no deja agarrar tierra.
      color.lerp(COLORS.roca, smoothstep(0.35, 0.75, slope));
      color.offsetHSL(0, 0, (variation - 0.5) * 0.06);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = textures.material('suelo', { repeat: 90 });
    material.vertexColors = true;

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'terreno';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  heightAt(x, z) { return this.field.heightAt(x, z); }
  slopeAt(x, z) { return this.field.slopeAt(x, z); }
  depthAt(x, z) { return this.field.depthAt(x, z); }
  isSubmerged(x, z) { return this.field.isSubmerged(x, z); }

  /** Normal del terreno, para orientar objetos apoyados en el suelo. */
  normalAt(x, z, out = new THREE.Vector3()) {
    const d = 0.75;
    const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
    const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
    return out.set(-hx, 2 * d, -hz).normalize();
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}
