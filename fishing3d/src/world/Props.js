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

    // El sitio del muelle no es un ángulo fijo: se busca una orilla con buen
    // calado delante. Un ángulo fijo funcionaba en un lago redondo y ponía el
    // muelle contra la pared en un cañón o cruzado en mitad del río.
    const dockAngle = this._bestShoreAngle({ idealDepth: 2.6, reach: 13 });
    this.dock = this._buildDock(dockAngle, wood, plank, preset);
    // La barca navegable la crea Game (necesita interactuar con el jugador);
    //     aquí sólo se decide dónde está fondeada.
    this.boatAnchor = this.shorePoint(
      this._bestShoreAngle({ idealDepth: 1.6, reach: 8, avoid: [dockAngle] }), -0.9
    );
    this.fishingSpots.push({ name: 'La barca', position: this.boatAnchor.clone() });
    this._buildCamp(this._bestShoreAngle({ idealDepth: 1.2, reach: 7, avoid: [dockAngle] }),
      wood, textures, preset);
    this._buildSign(wood, preset);
    this._buildBucket(preset);
    this._placeNpcAnchors();
  }

  /**
   * Sitios donde puede plantarse un personaje: en tierra firme, mirando al
   * agua y sin pisar la construcción a la que pertenecen. Se calculan sobre el
   * relieve real, así que valen igual en un lago, un río o un cañón.
   */
  _placeNpcAnchors() {
    const yaw = (p) => Math.atan2(p.x, p.z) + Math.PI;   // mirando al agua
    const seco = (p, empuje) => {
      // Se aparta hacia tierra hasta pisar seco: nadie atiende con los pies
      // dentro del agua.
      const dir = new THREE.Vector2(p.x, p.z).normalize();
      let best = p.clone();
      for (let d = 0; d <= 9; d += 0.75) {
        const x = p.x + dir.x * (empuje + d);
        const z = p.z + dir.y * (empuje + d);
        const h = this.terrain.heightAt(x, z);
        best = new THREE.Vector3(x, h, z);
        if (h > 0.45) break;
      }
      return best;
    };

    const junto = (obj, dx, dz) => {
      const w = obj.localToWorld(new THREE.Vector3(dx, 0, dz));
      return seco(new THREE.Vector3(w.x, 0, w.z), 0);
    };

    // Se apartan de la construcción a la que pertenecen: plantados encima, el
    // personaje tapaba el objeto y robaba la mirada al apuntar con la vista.
    const alLado = (p, dx, dz) => seco(new THREE.Vector3(p.x + dx, 0, p.z + dz), 0);
    this.npcAnchors = {
      muelle: { position: junto(this.dockObject, 2.6, 1.2), yaw: null },
      campamento: { position: alLado(seco(this.camp.position.clone(), 2.4), 2.6, -2.2), yaw: null },
      cartel: { position: alLado(seco(this.sign.position.clone(), 1.6), -2.4, 1.9), yaw: null },
      orilla: { position: seco(this.shorePoint(Math.PI * 0.9, 0.6), 1.6), yaw: null }
    };
    for (const a of Object.values(this.npcAnchors)) {
      a.position.y = this.terrain.heightAt(a.position.x, a.position.z);
      a.yaw = yaw(a.position);
    }
  }

  /**
   * Punto de la orilla en un ángulo dado (altura ≈ `targetHeight`).
   *
   * Marcha hacia fuera y se queda en el primer cruce en vez de bisecar: la
   * bisección da por hecho que el agua está dentro y la tierra fuera, y eso
   * sólo vale para un lago redondo. Un río serpenteante, una marisma con
   * islotes o un cañón cruzan esa frontera varias veces.
   */
  shorePoint(angle, targetHeight = 0.35) {
    const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const limit = this.terrain.field.half - 10;
    const at = (r) => this.terrain.heightAt(dir.x * r, dir.y * r);
    const step = 1.5;
    let prevR = 0, prevH = at(0);
    let fallback = null;
    for (let r = step; r <= limit; r += step) {
      const h = at(r);
      if (prevH < targetHeight && h >= targetHeight) {
        // Afinar el cruce entre los dos últimos pasos.
        let lo = prevR, hi = r;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          if (at(mid) < targetHeight) lo = mid; else hi = mid;
        }
        const found = (lo + hi) / 2;
        return new THREE.Vector3(dir.x * found, at(found), dir.y * found);
      }
      if (fallback === null && Math.abs(h - targetHeight) < 0.6) fallback = r;
      prevR = r; prevH = h;
    }
    const r = fallback ?? limit * 0.5;
    return new THREE.Vector3(dir.x * r, at(r), dir.y * r);
  }

  /**
   * Mejor ángulo de orilla para una construcción: se recorre el contorno y se
   * puntúa cada punto por el calado que hay `reach` metros mar adentro. Lo
   * ideal es una orilla con `idealDepth` delante, ni un bajío ni un tajo.
   */
  _bestShoreAngle({ idealDepth = 2.5, reach = 12, avoid = [], samples = 48 } = {}) {
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const shore = this.shorePoint(angle, 0.55);
      if (shore.y < 0.2) continue;                      // no encontró tierra
      const inward = { x: -Math.cos(angle), z: -Math.sin(angle) };
      const depth = this.terrain.depthAt(shore.x + inward.x * reach, shore.z + inward.z * reach);
      if (depth < 0.4) continue;                        // delante no hay agua
      // Pendiente suave detrás: no se construye contra una pared.
      const back = this.terrain.heightAt(shore.x - inward.x * 6, shore.z - inward.z * 6);
      let score = -Math.abs(depth - idealDepth) - Math.max(0, back - shore.y - 4) * 0.6;
      for (const other of avoid) {
        let d = Math.abs(angle - other);
        if (d > Math.PI) d = Math.PI * 2 - d;
        score -= Math.max(0, 1.2 - d) * 4;              // separados entre sí
      }
      if (score > bestScore) { bestScore = score; best = angle; }
    }
    return best;
  }

  _buildDock(angle, wood, plankMat, preset) {
    const shore = this.shorePoint(angle, 0.55);
    const inward = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));  // hacia el agua
    const dock = new THREE.Group();
    dock.position.copy(shore);
    dock.lookAt(shore.clone().add(inward));

    // El muelle llega hasta donde el fondo aún es alcanzable con pilotes: en
    // un lago son quince metros de tablero; sobre una hoya, mucho menos.
    let length = 15;
    for (let l = 15; l >= 4; l -= 1) {
      const tip = dock.localToWorld(new THREE.Vector3(0, 0, l - 1.5));
      if (this.terrain.depthAt(tip.x, tip.z) <= 12) { length = l; break; }
      length = 4;
    }
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
    const piles = Math.max(2, Math.round(length / 3.4));
    for (let i = 0; i < piles; i++) {
      const t = 0.7 + i * (length - 1.4) / Math.max(1, piles - 1);
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

  /** Cartel a la entrada del muelle: identifica la zona. */
  _buildSign(wood, preset) {
    const sign = new THREE.Group();
    const base = this.dockObject.localToWorld(new THREE.Vector3(-1.6, 0, -1.2));
    sign.position.set(base.x, this.terrain.heightAt(base.x, base.z), base.z);
    sign.rotation.y = this.dockObject.rotation.y + Math.PI;

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 1.5, 6), wood);
    post.position.y = 0.75;
    post.castShadow = preset.shadows;
    sign.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.05), wood);
    board.position.y = 1.35;
    board.castShadow = preset.shadows;
    sign.add(board);

    this.group.add(sign);
    this.sign = sign;
  }

  /** Cubo de cebo junto al fuego: se puede examinar. */
  _buildBucket(preset) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x7d838a, roughness: 0.5, metalness: 0.6 });
    const bucket = new THREE.Group();
    // Apartado del fuego: pegados, la mirada no podía distinguir uno de otro y
    // el aviso siempre era el del fuego.
    const spot = this.camp.position;
    const bx = spot.x - 2.4, bz = spot.z + 1.5;
    bucket.position.set(bx, this.terrain.heightAt(bx, bz) + 0.16, bz);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 12, 1, true), metal);
    body.castShadow = preset.shadows;
    bucket.add(body);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), metal);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.15;
    bucket.add(bottom);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 5, 12, Math.PI), metal);
    handle.position.y = 0.15;
    bucket.add(handle);

    this.group.add(bucket);
    this.bucket = bucket;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) o.geometry.dispose();
    });
    this.scene.remove(this.group);
  }
}
