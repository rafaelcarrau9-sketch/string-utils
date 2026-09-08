import * as THREE from 'three';
import { createRandom } from '../core/MathUtils.js';

/**
 * Elementos construidos del escenario: muelle, barca, banco, fogata, cartel.
 *
 * Se colocan buscando la orilla real sobre el campo de alturas, no con
 * coordenadas fijas, para que sigan encajando si se cambia la semilla o la
 * forma del lago.
 */

export class Props {
  constructor(scene, terrain, textures, preset) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'construcciones';
    scene.add(this.group);
    this.rng = createRandom(909);
    this.fishingSpots = [];

    const wood = textures.material('madera', { repeat: 2 });
    const plank = textures.material('madera', { repeat: 1 });

    this.dock = this._buildDock(Math.PI * 0.18, wood, plank, preset);
    // La barca navegable la crea Game (necesita interactuar con el jugador);
    //     aquí sólo se decide dónde está fondeada.
    this.boatAnchor = this.shorePoint(Math.PI * 0.62, -0.9);
    this.fishingSpots.push({ name: 'La barca', position: this.boatAnchor.clone() });
    this._buildCamp(Math.PI * -0.35, wood, textures, preset);
  }

  /** Punto de la orilla en un ángulo dado (altura ≈ `targetHeight`). */
  shorePoint(angle, targetHeight = 0.35) {
    const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    let lo = 0, hi = this.terrain.field.half - 10;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const h = this.terrain.heightAt(dir.x * mid, dir.y * mid);
      if (h < targetHeight) lo = mid; else hi = mid;
    }
    const r = (lo + hi) / 2;
    return new THREE.Vector3(dir.x * r, this.terrain.heightAt(dir.x * r, dir.y * r), dir.y * r);
  }

  _buildDock(angle, wood, plankMat, preset) {
    const shore = this.shorePoint(angle, 0.55);
    const inward = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));  // hacia el agua
    const dock = new THREE.Group();
    dock.position.copy(shore);
    dock.lookAt(shore.clone().add(inward));

    const length = 15;
    const width = 2.6;
    const deckY = 1.15;

    // Tablones cruzados
    const plankGeo = new THREE.BoxGeometry(width, 0.09, 0.42);
    const planks = new THREE.InstancedMesh(plankGeo, plankMat, Math.floor(length / 0.5));
    const dummy = new THREE.Object3D();
    for (let i = 0; i < planks.count; i++) {
      dummy.position.set(0, deckY, 0.6 + i * 0.5);
      dummy.rotation.set(0, 0, (this.rng() - 0.5) * 0.01);
      dummy.updateMatrix();
      planks.setMatrixAt(i, dummy.matrix);
    }
    planks.castShadow = preset.shadows;
    planks.receiveShadow = preset.shadows;
    dock.add(planks);

    // Vigas longitudinales
    const beamGeo = new THREE.BoxGeometry(0.16, 0.2, length);
    [-width / 2 + 0.2, width / 2 - 0.2].forEach((x) => {
      const beam = new THREE.Mesh(beamGeo, wood);
      beam.position.set(x, deckY - 0.15, length / 2 + 0.4);
      beam.castShadow = preset.shadows;
      dock.add(beam);
    });

    // Pilotes hasta el fondo
    const pileGeo = new THREE.CylinderGeometry(0.14, 0.16, 1, 7);
    for (let i = 0; i < 5; i++) {
      const t = 0.7 + i * 3.4;
      [-width / 2 + 0.2, width / 2 - 0.2].forEach((x) => {
        const world = dock.localToWorld(new THREE.Vector3(x, 0, t));
        const bed = this.terrain.heightAt(world.x, world.z);
        const height = deckY + shore.y - bed + 0.3;
        const pile = new THREE.Mesh(pileGeo, wood);
        pile.scale.y = height;
        pile.position.set(x, deckY - height / 2, t);
        pile.castShadow = preset.shadows;
        dock.add(pile);
      });
    }

    // Barandilla parcial en el extremo
    const railGeo = new THREE.BoxGeometry(0.08, 0.08, 3);
    [-width / 2 + 0.2, width / 2 - 0.2].forEach((x) => {
      const rail = new THREE.Mesh(railGeo, wood);
      rail.position.set(x, deckY + 0.85, length - 1.2);
      dock.add(rail);
      for (let k = 0; k < 2; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), wood);
        post.position.set(x, deckY + 0.45, length - 2.6 + k * 2.6);
        dock.add(post);
      }
    });

    this.group.add(dock);

    // Puntos de pesca recomendados en la punta del muelle.
    const tip = dock.localToWorld(new THREE.Vector3(0, deckY, length - 1.5));
    this.fishingSpots.push({ name: 'Punta del muelle', position: tip });
    this.dockDeckY = shore.y + deckY;
    this.dockObject = dock;
    return dock;
  }

  _buildCamp(angle, wood, textures, preset) {
    const spot = this.shorePoint(angle, 1.4);
    const camp = new THREE.Group();
    camp.position.copy(spot);

    // Círculo de piedras
    const stone = textures.material('roca', { repeat: 1 });
    const stoneGeo = new THREE.DodecahedronGeometry(0.22, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = new THREE.Mesh(stoneGeo, stone);
      s.position.set(Math.cos(a) * 0.75, 0.08, Math.sin(a) * 0.75);
      s.rotation.set(this.rng(), this.rng(), this.rng());
      s.scale.setScalar(0.7 + this.rng() * 0.6);
      s.castShadow = preset.shadows;
      camp.add(s);
    }
    // Leña
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 5), wood);
      log.rotation.set(Math.PI / 2.2, (i / 4) * Math.PI, 0);
      log.position.y = 0.12;
      camp.add(log);
    }
    // Banco de tronco
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 8), wood);
    seat.rotation.z = Math.PI / 2;
    seat.position.set(1.8, 0.24, 0.4);
    seat.castShadow = preset.shadows;
    camp.add(seat);

    this.group.add(camp);
    this.camp = camp;
    this.fishingSpots.push({ name: 'Cala del campamento', position: spot.clone() });
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) o.geometry.dispose();
    });
    this.scene.remove(this.group);
  }
}
