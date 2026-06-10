import * as THREE from "three";
import {
  RAINBOW,
  zAfterPrev,
  makeMaterial,
  addPlatform,
  createSignTexture,
  createTipTexture,
  updateSyncedCannons,
} from "./levelHelpers.js";

const GAP = 5.5;
const LASER_LEN = 2.2;
const LASER_THICK = 0.22;

function zGap(prevZ, prevDepth, nextDepth) {
  return zAfterPrev(prevZ, prevDepth, nextDepth, GAP);
}

export const ZONES_L4 = [
  {
    name: "Fort Entrance",
    sky: 0x1a0505,
    fog: 0x450a0a,
    void: 0x7f1d1d,
    zMin: 8,
    zMax: -12,
    tip: "Level 4 — Danger Fort · Spinners and traps ahead",
  },
  {
    name: "Cannon Alley",
    sky: 0x2a0a0a,
    fog: 0xdc2626,
    void: 0xb91c1c,
    zMin: -12,
    zMax: -52,
    tip: "Orange shots cross the path — dodge side to side",
  },
  {
    name: "Spinner Maze",
    sky: 0x1c1917,
    fog: 0xea580c,
    void: 0x9a3412,
    zMin: -52,
    zMax: -92,
    tip: "Red spinners block the path · Jump over or wait",
  },
  {
    name: "Crossfire",
    sky: 0x0f172a,
    fog: 0x6366f1,
    void: 0x4338ca,
    zMin: -92,
    zMax: -132,
    tip: "Cannons from both sides · Use moving lifts",
  },
  {
    name: "Death Gauntlet",
    sky: 0x3b0764,
    fog: 0xa855f7,
    void: 0x7e22ce,
    zMin: -132,
    zMax: -172,
    tip: "Everything at once — stay calm!",
  },
  {
    name: "Final Gate",
    sky: 0xfef08a,
    fog: 0xfbbf24,
    void: 0xf59e0b,
    zMin: -172,
    zMax: -220,
    tip: "Reach the gold gate to beat Level 4!",
  },
];

export class Level4 {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.platforms = [];
    this.movingPlatforms = [];
    this.hazards = [];
    this.checkpoints = [];
    this.projectiles = [];
    this.cannons = [];
    this.tornadoes = [];
    this.tornadoImpulse = new THREE.Vector3();
    this.finishBox = null;
    this.decor = [];
    this.checkpointCount = 5;
    this.cannonVolleyPeriod = 3;
    this._lastFiredVolleyIndex = -1;

    this.build();
  }

  dispose() {
    this.scene.remove(this.group);
    this.platforms = [];
    this.movingPlatforms = [];
    this.hazards = [];
    this.checkpoints = [];
    this.projectiles = [];
    this.cannons = [];
    this.tornadoes = [];
    this.decor = [];
  }

  build() {
    this.buildFortEntrance();
    this.buildCannonAlley();
    this.buildSpinnerMaze();
    this.buildCrossfire();
    this.buildDeathGauntlet();
    this.buildFinalGate();
  }

  addZonePad(zone, centerZ, length) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(42, length),
      makeMaterial(zone.void, zone.void, 0.3, { transparent: true, opacity: 0.5 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, -22, centerZ);
    this.group.add(pad);
  }

  addZoneGate(zone, x, y, z) {
    const tex = createSignTexture(
      zone.name,
      `#${zone.fog.toString(16).padStart(6, "0")}`,
      "#ffffff"
    );
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x, y + 11, z);
    this.group.add(sign);
  }

  addTipSign(lines, x, y, z, side = 1) {
    const tex = createTipTexture(lines, "#450a0a");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x + side * 5.5, y + 2.4, z);
    sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(sign);
  }

  addCheckpoint(index, x, y, z, color) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.14, 8, 24),
      makeMaterial(0xfbbf24, 0xf59e0b, 0.55)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    this.group.add(ring);

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.4, 6),
      makeMaterial(color, color, 0.45)
    );
    mesh.position.set(x, y + 0.2, z);
    this.group.add(mesh);

    const r = 1.5;
    this.checkpoints.push({
      index,
      mesh,
      ring,
      active: false,
      respawn: new THREE.Vector3(x, y + 0.35, z),
      box: {
        minX: x - r,
        maxX: x + r,
        minY: y,
        maxY: y + 2,
        minZ: z - r,
        maxZ: z + r,
      },
    });
  }

  addSpinner(x, y, z, length, thickness) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(length, thickness, thickness),
      makeMaterial(0xef4444, 0xdc2626, 0.55)
    );
    bar.position.set(x, y, z);
    this.group.add(bar);

    const half = length / 2;
    const spinner = { mesh: bar, x, y, z, half, thickness, angle: 0 };
    this.decor.push({
      mesh: bar,
      update: (time) => {
        spinner.angle = time * 1.4;
        bar.rotation.y = spinner.angle;
      },
    });
    this.hazards.push({ spinner });
  }

  addSpikeObstacle(x, y, z, w, d, h) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(Math.min(w, d) * 0.45, h, 6),
      makeMaterial(0x78716c, 0xef4444, 0.35)
    );
    mesh.position.set(x, y + h / 2, z);
    this.group.add(mesh);

    const r = Math.min(w, d) * 0.4;
    this.hazards.push({
      box: {
        minX: x - r,
        maxX: x + r,
        minY: y,
        maxY: y + h + 0.5,
        minZ: z - r,
        maxZ: z + r,
      },
    });
  }

  /** Aim from muzzle toward player torso; fallback points down the path when no player. */
  computeCannonAim(cannon, playerPos) {
    const dir = new THREE.Vector3();
    if (playerPos) {
      const target = playerPos.clone();
      target.y += 0.75;
      dir.subVectors(target, cannon.muzzle);
    } else {
      dir.copy(cannon.fallbackDir);
    }
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
    dir.normalize();
    return dir;
  }

  aimCannonBarrel(barrel, muzzle, dir) {
    const aim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    barrel.quaternion.copy(aim);
    barrel.position.copy(muzzle).addScaledVector(dir, -0.35);
  }

  addCannon(x, z, platformTop, minInterval = 1.8, maxInterval = 4.2, aimAhead = 11) {
    const muzzleY = platformTop + 1.05;
    const muzzle = new THREE.Vector3(x, muzzleY, z - 0.55);
    const fallbackTarget = new THREE.Vector3(0, platformTop + 0.7, z - aimAhead);
    const fallbackDir = new THREE.Vector3().subVectors(fallbackTarget, muzzle);
    if (fallbackDir.lengthSq() < 0.01) fallbackDir.set(0, 0, -1);
    fallbackDir.normalize();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 1.2, 10),
      makeMaterial(0x44403c, 0x78716c, 0.2)
    );
    base.position.set(x, platformTop + 0.55, z);
    this.group.add(base);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 1.8, 8),
      makeMaterial(0x57534e, 0xf97316, 0.3)
    );
    this.group.add(barrel);
    this.aimCannonBarrel(barrel, muzzle, fallbackDir);

    const lo = Math.min(minInterval, maxInterval);
    const hi = Math.max(minInterval, maxInterval);

    this.cannons.push({
      muzzle: muzzle.clone(),
      fallbackDir,
      speed: 20,
      minInterval: lo,
      maxInterval: hi,
      nextFire: lo + Math.random() * (hi - lo + 2.5),
      barrel,
      triggerRange: 28, // only fire when player is within this many units
      active: false,    // tracks whether player is currently in range
    });
  }

  scheduleNextShot(cannon, time) {
    const span = cannon.maxInterval - cannon.minInterval;
    cannon.nextFire = time + cannon.minInterval + Math.random() * span;
  }

  fireProjectile(cannon, time, playerPos) {
    const dir = this.computeCannonAim(cannon, playerPos);
    this.aimCannonBarrel(cannon.barrel, cannon.muzzle, dir);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 10, 10),
      makeMaterial(0xf97316, 0xef4444, 0.7)
    );
    mesh.position.copy(cannon.muzzle);
    this.group.add(mesh);

    const proj = {
      mesh,
      center: cannon.muzzle.clone(),
      spawnTime: time,
      start: cannon.muzzle.clone(),
      dir: dir.clone(),
      speed: cannon.speed,
      radius: 0.4,
      maxAge: 6,
    };
    this.projectiles.push(proj);
  }

  addVerticalMover(g, x, baseY, z, w, d, h, color, amp, speed, phase) {
    const p = addPlatform(g, this.platforms, x, baseY, z, w, d, h, color, {
      emissive: color,
      emissiveIntensity: 0.35,
    });
    p.baseBottomY = baseY;
    p.platformHeight = h;
    p.halfW = w / 2;
    p.halfD = d / 2;
    p.velocity = new THREE.Vector3(0, 0, 0);
    p.update = (time) => {
      const offset = Math.sin(time * speed + phase) * amp;
      const bottomY = p.baseBottomY + offset;
      p.topY = bottomY + p.platformHeight;
      p.mesh.position.y = bottomY + p.platformHeight / 2;
      p.velocity.y = Math.cos(time * speed + phase) * amp * speed;
    };
    this.movingPlatforms.push(p);
    return p;
  }

  addTornado(x, baseY, z, driftAmp = 3.8, driftSpeed = 0.5) {
    const grp = new THREE.Group();
    grp.position.set(x, baseY, z);
    this.group.add(grp);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x90a4ae, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, emissive: 0x546e7a, emissiveIntensity: 0.3,
    });

    // Wide spinning funnel at base
    const funnel = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.5, 10, 1, true), mat);
    funnel.position.y = 1.75;
    grp.add(funnel);

    // Narrowing column going up
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 2.6, 3, 10, 1, true),
      mat.clone()
    );
    col.position.y = 5;
    grp.add(col);

    // Swirling debris rings
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x78909c, emissive: 0x546e7a, emissiveIntensity: 0.5,
    });
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(2.2 - i * 0.45, 0.12, 4, 12),
        ringMat
      );
      r.position.y = 0.5 + i * 1.4;
      r.rotation.x = Math.PI / 2;
      grp.add(r);
      rings.push(r);
    }

    const tornado = { mesh: grp, baseX: x, x, z, pushRadius: 3.2, pushForce: 12, driftAmp, driftSpeed, wasInRange: false };
    this.tornadoes.push(tornado);
    this.decor.push({
      update: (time) => {
        grp.rotation.y = time * 3.0;
        tornado.x = x + Math.sin(time * driftSpeed) * driftAmp;
        grp.position.x = tornado.x;
        rings.forEach((r, i) => { r.rotation.z = time * (2.0 + i * 1.2); });
      },
    });
  }

  buildFortEntrance() {
    const zone = ZONES_L4[0];
    const g = this.group;
    this.addZonePad(zone, 0, 14);
    this.addZoneGate(zone, 0, 0, -4);

    addPlatform(g, this.platforms, 0, 0, 0, 8, 8, 1.2, 0x57534e, {
      emissive: 0x44403c,
      emissiveIntensity: 0.15,
    });

    this.addTipSign(
      ["Hardest level yet!", "Orange balls = cannon fire", "Touch red obstacles = respawn"],
      0, 0, -2, -1
    );
  }

  buildCannonAlley() {
    const zone = ZONES_L4[1];
    const g = this.group;
    const padD = 4;
    const padH = 1.2;
    let z = zGap(0, 8, padD);
    this.addZonePad(zone, z - 22, 44);
    this.addZoneGate(zone, 0, 1, z + 5);

    addPlatform(g, this.platforms, 0, 1, z, padD, padD, padH, 0x78716c, {
      emissive: 0x57534e,
      emissiveIntensity: 0.15,
    });

    for (let i = 0; i < 5; i++) {
      z = i === 0 ? zGap(z, padD, padD) : zGap(z, padD, padD);
      addPlatform(g, this.platforms, 0, 1.2, z, padD, padD, padH, 0x991b1b, {
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.2,
      });
      if (i % 2 === 0) {
        const top = 1.2 + padH;
        this.addCannon(-6.5, z, top, 1.5, 3.5);
        this.addCannon(6.5, z, top, 1.7, 3.8);
      }
      this.addSpikeObstacle(0, 1.2, z - 1.5, 1.2, 1.2, 1.8);
    }

    const cpZ = zGap(z, padD, padD);
    this.addCheckpoint(1, 0, 2.5, cpZ, 0xef4444);
    addPlatform(g, this.platforms, 0, 2.5, cpZ, padD, padD, padH, 0xdc2626, {
      emissive: 0xb91c1c,
      emissiveIntensity: 0.25,
    });
    this._mazeEntryZ = cpZ;

    this.addTipSign(
      ["Cannons fire at random times", "No pattern — stay alert", "Don't stand still"],
      0, 1.2, zGap(0, 8, padD), 1
    );
  }

  buildSpinnerMaze() {
    const zone = ZONES_L4[2];
    const g = this.group;
    const padD = 4;
    const padH = 1.2;
    let z = zGap(this._mazeEntryZ, padD, padD);
    this.addZonePad(zone, z - 22, 44);
    this.addZoneGate(zone, 0, 2.5, z + 5);

    addPlatform(g, this.platforms, 0, 2.5, z, padD, padD, padH, 0x57534e, {
      emissive: 0x44403c,
      emissiveIntensity: 0.15,
    });

    for (let i = 0; i < 6; i++) {
      const prevZ = z;
      z = i === 0 ? zGap(z, padD, padD) : zGap(z, padD, padD);
      addPlatform(g, this.platforms, 0, 2.5, z, padD, padD, padH, 0x7f1d1d, {
        emissive: 0x991b1b,
        emissiveIntensity: 0.18,
      });
      if (i > 0 && i < 5) {
        const platformTop = 2.5 + padH;
        this.addSpinner(0, platformTop + 0.9, (prevZ + z) / 2, LASER_LEN, LASER_THICK);
      }
      if (i === 2 || i === 4) {
        this.addSpikeObstacle(-2, 2.5, z, 1.5, 1.5, 2);
        this.addSpikeObstacle(2, 2.5, z, 1.5, 1.5, 2);
      }
    }

    const cpZ = zGap(z, padD, padD);
    this.addCheckpoint(2, 0, 3.5, cpZ, 0xea580c);
    addPlatform(g, this.platforms, 0, 3.5, cpZ, padD, padD, padH, 0xea580c, {
      emissive: 0xc2410c,
      emissiveIntensity: 0.25,
    });
    this._crossEntryZ = cpZ;

    this.addTipSign(
      ["Red bars spin — timing is key", "Jump over when they point away", "Spikes on the sides hurt too"],
      0, 2.5, zGap(this._mazeEntryZ, padD, padD), -1
    );
  }

  buildCrossfire() {
    const zone = ZONES_L4[3];
    const g = this.group;
    const padD = 4;
    const padH = 1.2;
    let z = zGap(this._crossEntryZ, padD, padD);
    this.addZonePad(zone, z - 22, 44);
    this.addZoneGate(zone, 0, 3.5, z + 5);

    addPlatform(g, this.platforms, 0, 3.5, z, padD, padD, padH, 0x4338ca, {
      emissive: 0x3730a3,
      emissiveIntensity: 0.2,
    });

    const lift1Z = zGap(z, padD, padD);
    const lift1Top = 4 + padH;
    this.addVerticalMover(g, 0, 4, lift1Z, padD, padD, padH, 0x6366f1, 3, 0.85, 0);

    this.addCannon(-6.5, lift1Z, lift1Top + 3, 1.4, 3.2);
    this.addCannon(6.5, lift1Z, lift1Top + 3, 1.6, 3.5);

    const z2 = zGap(lift1Z, padD, padD);
    addPlatform(g, this.platforms, 0, 5, z2, padD, padD, padH, 0x4f46e5, {
      emissive: 0x4338ca,
      emissiveIntensity: 0.2,
    });

    const lift2Z = zGap(z2, padD, padD);
    const lift2Top = 5.5 + padH;
    this.addVerticalMover(g, 0, 5.5, lift2Z, padD, padD, padH, 0x818cf8, 3.5, 1, 2);

    this.addCannon(-6.5, lift2Z, lift2Top + 3, 1.5, 3.4);
    this.addCannon(6.5, lift2Z, lift2Top + 3, 1.6, 3.6);

    const z3 = zGap(lift2Z, padD, padD);
    addPlatform(g, this.platforms, 0, 6, z3, padD, padD, padH, 0x6366f1, {
      emissive: 0x4f46e5,
      emissiveIntensity: 0.22,
    });

    const cpZ = zGap(z3, padD, padD);
    this.addCheckpoint(3, 0, 6.5, cpZ, 0x818cf8);
    addPlatform(g, this.platforms, 0, 6.5, cpZ, padD, padD, padH, 0x6366f1, {
      emissive: 0x4f46e5,
      emissiveIntensity: 0.25,
    });
    this._gauntletEntryZ = cpZ;

    this.addTipSign(
      ["Lifts move up and down", "Cannons fire while you ride", "Keep moving!"],
      0, 4, lift1Z, 1
    );
  }

  buildDeathGauntlet() {
    const zone = ZONES_L4[4];
    const g = this.group;
    const padD = 4.5;
    const padH = 1.2;
    let z = zGap(this._gauntletEntryZ, padD, padD);
    this.addZonePad(zone, z - 22, 44);
    this.addZoneGate(zone, 0, 6.5, z + 5);

    for (let i = 0; i < 7; i++) {
      const prevZ = z;
      z = i === 0 ? zGap(z, padD, padD) : zGap(z, padD, padD);
      const color = RAINBOW[i % RAINBOW.length];
      addPlatform(g, this.platforms, (i % 2 === 0 ? -0.5 : 0.5), 6.5 + (i % 3) * 0.2, z, padD, padD, padH, color, {
        emissive: color,
        emissiveIntensity: 0.25,
      });

      if (i > 0 && i % 2 === 0) {
        const platformTop = 6.5 + (i % 3) * 0.2 + padH;
        this.addSpinner(0, platformTop + 0.9, (prevZ + z) / 2, LASER_LEN, LASER_THICK);
        this.addCannon(-6, z, platformTop, 1.3, 3);
        this.addCannon(6, z, platformTop, 1.4, 3.2);
      }
      if (i === 3) {
        this.addSpikeObstacle(0, 6.5, z, 2, 2, 2.2);
      }
      // Tornadoes alternate with spinners in the gaps
      if (i === 1 || i === 3 || i === 5) {
        const gapZ = (prevZ + z) / 2;
        this.addTornado(0, 7.7, gapZ, 3.8, 0.42 + i * 0.07);
      }
    }

    const cpZ = zGap(z, padD, padD);
    this.addCheckpoint(4, 0, 7.5, cpZ, 0xa855f7);
    addPlatform(g, this.platforms, 0, 7.5, cpZ, padD, padD, padH, 0x7c3aed, {
      emissive: 0x6d28d9,
      emissiveIntensity: 0.3,
    });
    this._gateEntryZ = cpZ;

    this.addTipSign(
      ["Smaller pads · bigger gaps", "Spinners + cannons together", "Use double jump!"],
      0, 6.5, zGap(this._gauntletEntryZ, padD, padD), -1
    );
  }

  buildFinalGate() {
    const zone = ZONES_L4[5];
    const g = this.group;
    const padD = 5;
    const padH = 1.2;
    let z = zGap(this._gateEntryZ, padD, padD);
    this.addZonePad(zone, z - 20, 38);
    this.addZoneGate(zone, 0, 7.5, z + 5);

    addPlatform(g, this.platforms, 0, 7.5, z, padD, padD, padH, 0x57534e, {
      emissive: 0x44403c,
      emissiveIntensity: 0.15,
    });

    const z2 = zGap(z, padD, padD);
    addPlatform(g, this.platforms, 0, 8, z2, padD, padD, padH, 0xfbbf24, {
      emissive: 0xf59e0b,
      emissiveIntensity: 0.25,
    });

    const gapZ = (z + z2) / 2;
    const gapPlatformTop = Math.max(7.5 + padH, 8 + padH);
    this.addSpinner(0, gapPlatformTop + 0.9, gapZ, LASER_LEN, LASER_THICK);

    const finalTop = 8 + padH;
    this.addCannon(-5.5, z2, finalTop, 1.8, 4);
    this.addCannon(5.5, z2, finalTop, 2, 4.3);

    const gateD = 9;
    const gateZ = zGap(z2, padD, gateD);
    addPlatform(g, this.platforms, 0, 9.5, gateZ, gateD, gateD, 1.5, 0xfacc15, {
      emissive: 0xfbbf24,
      emissiveIntensity: 0.55,
    });

    const finish = this.platforms[this.platforms.length - 1];
    this.finishBox = {
      minX: finish.minX,
      maxX: finish.maxX,
      minY: finish.topY,
      maxY: finish.topY + 3,
      minZ: finish.minZ,
      maxZ: finish.maxZ,
    };

    const gate = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.3, 8, 32),
      makeMaterial(0xfbbf24, 0xf59e0b, 0.65)
    );
    gate.rotation.x = Math.PI / 2;
    gate.position.set(0, 11.5, gateZ);
    g.add(gate);
    this.decor.push({
      mesh: gate,
      update: (time) => {
        gate.rotation.z = time * 0.5;
      },
    });

    this.addTipSign(
      ["Last checkpoint behind you", "Dodge final cannon shots", "Stand on gold to win!"],
      0, 7.5, z, 1
    );
  }

  getZoneAt(z) {
    for (const zone of ZONES_L4) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES_L4[ZONES_L4.length - 1];
  }

  update(time, playerPos = null) {
    updateSyncedCannons(this, time, playerPos);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const age = time - p.spawnTime;
      if (age > p.maxAge) {
        this.group.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      p.center.copy(p.start).addScaledVector(p.dir, p.speed * age);
      p.mesh.position.copy(p.center);
      p.mesh.material.emissiveIntensity = 0.5 + Math.sin(time * 15) * 0.25;
    }

    for (const mp of this.movingPlatforms) {
      if (mp.update) mp.update(time);
    }

    for (const d of this.decor) {
      if (d.spin) d.mesh.rotation.y = time * 1.5;
      if (d.update) d.update(time);
    }

    // Tornado knockback impulse (applied by Player.update)
    this.tornadoImpulse.set(0, 0, 0);
    if (playerPos) {
      for (const tornado of this.tornadoes) {
        const dx = playerPos.x - tornado.x;
        const dz = playerPos.z - tornado.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const inRange = dist < tornado.pushRadius;
        if (inRange && !tornado.wasInRange && dist > 0.1) {
          const nx = dx / dist;
          const nz = dz / dist;
          this.tornadoImpulse.x += nx * tornado.pushForce;
          this.tornadoImpulse.z += nz * tornado.pushForce;
          this.tornadoImpulse.y += tornado.pushForce * 0.5;
        }
        tornado.wasInRange = inRange;
      }
    }
  }
}
