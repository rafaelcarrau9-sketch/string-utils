import * as THREE from 'three';
import { createRandom, clamp } from '../core/MathUtils.js';
import { mergeGeometries, crossPlanes } from '../core/GeometryUtils.js';

/**
 * Arbolado con geometría real y LOD por instancia.
 *
 * Cerca, cada árbol es un tronco con ramas y una copa de varios volúmenes;
 * lejos, un cartel con la mancha de follaje. El intercambio se hace escalando
 * a cero las instancias del nivel que no toca —la técnica habitual con
 * InstancedMesh— y sólo se recalcula cuando el jugador se ha movido de verdad,
 * no cada fotograma.
 */

const NEAR_DISTANCE = 70;     // metros hasta los que se dibuja el árbol completo
const REBUILD_STEP = 6;       // el LOD se revisa cuando el jugador anda esto

/** Tronco cónico con tres o cuatro ramas. */
function trunkGeometry(rng, { height = 5.4, radius = 0.24 } = {}) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(radius * 0.42, radius, height, 7, 1);
  trunk.translate(0, height / 2, 0);
  parts.push(trunk);

  const branches = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < branches; i++) {
    const t = 0.55 + rng() * 0.35;
    const length = height * (0.22 + rng() * 0.2);
    const branch = new THREE.CylinderGeometry(radius * 0.1, radius * 0.28, length, 5, 1);
    branch.translate(0, length / 2, 0);
    branch.rotateZ((rng() * 0.5 + 0.5) * (rng() < 0.5 ? 1 : -1));
    branch.rotateY((i / branches) * Math.PI * 2 + rng());
    branch.translate(0, height * t, 0);
    parts.push(branch);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Copa de hoja ancha: varios volúmenes solapados. */
function canopyBlobs(rng, { height = 5.4 } = {}) {
  const parts = [];
  const blobs = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = 1.1 + rng() * 0.9;
    const blob = new THREE.IcosahedronGeometry(r, 0);
    const angle = (i / blobs) * Math.PI * 2 + rng() * 0.6;
    const spread = 0.9 + rng() * 1.1;
    blob.translate(
      Math.cos(angle) * spread,
      height * (0.9 + rng() * 0.35),
      Math.sin(angle) * spread
    );
    parts.push(blob);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Copa de conífera: conos apilados. */
function canopyCone(rng, { height = 6.2 } = {}) {
  const parts = [];
  const tiers = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const radius = 2.3 * (1 - t * 0.62);
    const cone = new THREE.ConeGeometry(radius, 2.1, 8, 1);
    cone.translate(0, height * 0.68 + i * 1.35, 0);
    parts.push(cone);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

export class Trees {
  constructor(scene, terrain, textures, preset, { seed = 8080, count = 420, conifer = 0.38 } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.rng = createRandom(seed);
    this.group = new THREE.Group();
    this.group.name = 'arbolado';
    scene.add(this.group);

    this.nearDistance = Math.min(NEAR_DISTANCE, preset.viewDistance * 0.4);
    this.coniferRatio = conifer;
    this.spots = this._scatter(count);
    this._lastRebuild = new THREE.Vector3(1e9, 0, 1e9);
    this._dummy = new THREE.Object3D();

    this._buildMeshes(textures, preset);
  }

  _scatter(count) {
    const spots = [];
    const half = this.terrain.field.half - 10;
    let attempts = 0;
    while (spots.length < count && attempts < count * 30) {
      attempts++;
      const x = (this.rng() * 2 - 1) * half;
      const z = (this.rng() * 2 - 1) * half;
      const h = this.terrain.heightAt(x, z);
      if (h < 1.8 || h > 24) continue;
      if (this.terrain.slopeAt(x, z) > 0.42) continue;
      spots.push({
        x, y: h, z,
        conifer: this.rng() < this.coniferRatio,
        scale: 0.75 + this.rng() * 0.7,
        rotation: this.rng() * Math.PI * 2,
        tilt: (this.rng() - 0.5) * 0.1
      });
    }
    return spots;
  }

  _buildMeshes(textures, preset) {
    const rng = this.rng;
    const barkMaterial = textures.material('corteza', { repeat: 2 });
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f7f3c, roughness: 0.9, metalness: 0, flatShading: true
    });
    const coniferMaterial = new THREE.MeshStandardMaterial({
      color: 0x40603a, roughness: 0.92, metalness: 0, flatShading: true
    });

    const count = this.spots.length;
    this.near = {
      trunk: new THREE.InstancedMesh(trunkGeometry(rng), barkMaterial, count),
      broad: new THREE.InstancedMesh(canopyBlobs(rng), leafMaterial, count),
      conifer: new THREE.InstancedMesh(canopyCone(rng), coniferMaterial, count)
    };

    const billboardGeometry = crossPlanes(5.6, 6.4);
    const billboardMaterial = new THREE.MeshStandardMaterial({
      map: textures.foliage(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9
    });
    this.far = new THREE.InstancedMesh(billboardGeometry, billboardMaterial, count);

    [this.near.trunk, this.near.broad, this.near.conifer, this.far].forEach((mesh) => {
      mesh.castShadow = preset.shadows;
      mesh.receiveShadow = preset.shadows;
      mesh.frustumCulled = false;      // el LOD ya decide qué se dibuja
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    });

    this._applyLOD(new THREE.Vector3(0, 0, 0));
  }

  /** Escribe las matrices: escala 0 en el nivel que no corresponde. */
  _applyLOD(playerPosition) {
    const d = this._dummy;
    const near = this.near;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

    let trunkCount = 0, broadCount = 0, coniferCount = 0, farCount = 0;

    for (let i = 0; i < this.spots.length; i++) {
      const spot = this.spots[i];
      const dx = spot.x - playerPosition.x;
      const dz = spot.z - playerPosition.z;
      const distance = Math.hypot(dx, dz);
      const isNear = distance < this.nearDistance;

      d.position.set(spot.x, spot.y, spot.z);
      d.rotation.set(spot.tilt, spot.rotation, spot.tilt * 0.6);
      d.scale.setScalar(spot.scale);
      d.updateMatrix();

      if (isNear) {
        near.trunk.setMatrixAt(trunkCount++, d.matrix);
        if (spot.conifer) near.conifer.setMatrixAt(coniferCount++, d.matrix);
        else near.broad.setMatrixAt(broadCount++, d.matrix);
        this.far.setMatrixAt(i, hidden);
      } else {
        // El cartel se planta un poco más alto: sustituye a copa y tronco.
        d.position.y = spot.y + 2.4 * spot.scale;
        d.rotation.set(0, spot.rotation, 0);
        d.updateMatrix();
        this.far.setMatrixAt(farCount++, d.matrix);
      }
    }

    near.trunk.count = trunkCount;
    near.broad.count = broadCount;
    near.conifer.count = coniferCount;
    this.far.count = farCount;

    near.trunk.instanceMatrix.needsUpdate = true;
    near.broad.instanceMatrix.needsUpdate = true;
    near.conifer.instanceMatrix.needsUpdate = true;
    this.far.instanceMatrix.needsUpdate = true;
  }

  update(playerPosition) {
    if (this._lastRebuild.distanceToSquared(playerPosition) < REBUILD_STEP * REBUILD_STEP) return;
    this._lastRebuild.copy(playerPosition);
    this._applyLOD(playerPosition);
  }

  get stats() {
    return {
      total: this.spots.length,
      cerca: this.near.trunk.count,
      lejos: this.far.count
    };
  }

  dispose() {
    [this.near.trunk, this.near.broad, this.near.conifer, this.far].forEach((m) => {
      m.geometry.dispose();
      m.material.dispose();
    });
    this.scene.remove(this.group);
  }
}
