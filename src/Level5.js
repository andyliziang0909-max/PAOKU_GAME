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
import { spawnFlyingBall, velocityToHoop } from "./basketballShooting.js";

const GAP = 5.5;
const LASER_LEN = 2.2;
const LASER_THICK = 0.22;

function zGap(prevZ, prevD, nextD) {
  return zAfterPrev(prevZ, prevD, nextD, GAP);
}

export const ZONES_L5 = [
  {
    name: "Storm Entry",
    sky: 0x0c1a3a, fog: 0x1e3a8a, void: 0x1e40af,
    zMin: 8, zMax: -10,
    tip: "Level 5 — Storm Court · Tornadoes and lightning ahead",
  },
  {
    name: "Tornado Field",
    sky: 0x0f172a, fog: 0x374151, void: 0x1e293b,
    zMin: -10, zMax: -95,
    tip: "Wait for the tornado to drift wide, then dash across!",
  },
  {
    name: "Lightning Alley",
    sky: 0x2d1b69, fog: 0x6d28d9, void: 0x5b21b6,
    zMin: -95, zMax: -150,
    tip: "Yellow circle = incoming strike! Get out fast!",
  },
  {
    name: "The Court",
    sky: 0x080c0f, fog: 0xcc5500, void: 0xb91c1c,
    zMin: -150, zMax: -215,
    tip: "Stand in the gold ring · Press E to shoot · Score to win!",
  },
];

export class Level5 {
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
    this.lightnings = [];
    this.basketballs = [];
    this.basketScored = false;
    this.hoopPos = null;
    this.throwZoneCenter = null;
    this.hoopRim = null;
    this.requiresGroundedWin = true;
    this.throwRing = null;
    this._winPad = null;
    this._courtPlatform = null;
    this.finishBox = null;
    this.decor = [];
    this.checkpointCount = 4;
    this._lastTime = undefined;
    this.shotCount = 0;
    this.lastShotTime = -999;
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
    this.lightnings = [];
    this.basketballs = [];
    this.decor = [];
  }

  build() {
    this.buildStormEntry();
    this.buildTornadoField();
    this.buildLightningAlley();
    this.buildCourtSection();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
    const tex = createTipTexture(lines, "#0f172a");
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
      index, mesh, ring, active: false,
      respawn: new THREE.Vector3(x, y + 0.35, z),
      box: { minX: x - r, maxX: x + r, minY: y, maxY: y + 2, minZ: z - r, maxZ: z + r },
    });
  }

  addSpinner(x, y, z, length, thickness) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(length, thickness, thickness),
      makeMaterial(0xef4444, 0xdc2626, 0.55)
    );
    bar.position.set(x, y, z);
    this.group.add(bar);
    const spinner = { mesh: bar, x, y, z, half: length / 2, thickness, angle: 0 };
    this.decor.push({ update: (time) => { bar.rotation.y = time * 1.4; } });
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
    this.hazards.push({ box: { minX: x - r, maxX: x + r, minY: y, maxY: y + h + 0.5, minZ: z - r, maxZ: z + r } });
  }

  addTornado(x, baseY, z, driftAmp = 3.8, driftSpeed = 0.5) {
    const grp = new THREE.Group();
    grp.position.set(x, baseY, z);
    this.group.add(grp);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x78909c, transparent: true, opacity: 0.65,
      side: THREE.DoubleSide, emissive: 0x455a64, emissiveIntensity: 0.35,
    });

    const funnel = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.5, 10, 1, true), mat);
    funnel.position.y = 1.75;
    grp.add(funnel);

    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 2.6, 3, 10, 1, true),
      mat.clone()
    );
    col.position.y = 5;
    grp.add(col);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x607d8b, emissive: 0x455a64, emissiveIntensity: 0.55,
    });
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(2.2 - i * 0.45, 0.12, 4, 12), ringMat
      );
      r.position.y = 0.5 + i * 1.4;
      r.rotation.x = Math.PI / 2;
      grp.add(r);
      rings.push(r);
    }

    const tornado = { mesh: grp, baseX: x, x, z, pushRadius: 3.2, pushForce: 13, driftAmp, driftSpeed, wasInRange: false };
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

  /** Lightning column that cycles on (0.8s strike) / off (1.5s) / warning (0.5s). */
  addLightning(x, z, platformTop) {
    const g = this.group;

    // Warning circle on floor
    const warnDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0,
        transparent: true, opacity: 0,
      })
    );
    warnDisk.rotation.x = -Math.PI / 2;
    warnDisk.position.set(x, platformTop + 0.05, z);
    g.add(warnDisk);

    // Lightning bolt cylinder
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 18, 5),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffff44, emissiveIntensity: 0,
        transparent: true, opacity: 0,
      })
    );
    bolt.position.set(x, platformTop + 9, z);
    g.add(bolt);

    const hazard = {
      box: {
        minX: x - 1.3, maxX: x + 1.3,
        minY: platformTop, maxY: platformTop + 5,
        minZ: z - 1.3, maxZ: z + 1.3,
      },
      active: false,
    };
    this.hazards.push(hazard);
    this.lightnings.push(hazard);

    const PERIOD = 2.8;
    const phase = Math.random() * PERIOD;
    this.decor.push({
      update: (time) => {
        const t = ((time + phase) % PERIOD);
        if (t < 1.5) {
          // off
          hazard.active = false;
          bolt.material.opacity = 0;
          warnDisk.material.opacity = 0;
        } else if (t < 2.0) {
          // warning flash (0.5s)
          hazard.active = false;
          const f = (t - 1.5) / 0.5;
          bolt.material.opacity = f * 0.35;
          bolt.material.emissiveIntensity = f * 1.5;
          warnDisk.material.opacity = f * 0.7;
          warnDisk.material.emissiveIntensity = f * 2.5;
        } else {
          // strike (0.8s)
          hazard.active = true;
          const flicker = 0.85 + Math.sin(time * 80) * 0.15;
          bolt.material.opacity = flicker;
          bolt.material.emissiveIntensity = 3.5 * flicker;
          warnDisk.material.opacity = 0.8;
          warnDisk.material.emissiveIntensity = 4.0;
        }
      },
    });
  }

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
    const fallbackDir = new THREE.Vector3().subVectors(fallbackTarget, muzzle).normalize();

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
      muzzle: muzzle.clone(), fallbackDir, speed: 20,
      minInterval: lo, maxInterval: hi,
      nextFire: lo + Math.random() * (hi - lo + 2),
      barrel, triggerRange: 30, active: false,
    });
  }

  addVerticalMover(x, baseY, z, w, d, h, color, amp, speed, phase) {
    const p = addPlatform(this.group, this.platforms, x, baseY, z, w, d, h, color, {
      emissive: color, emissiveIntensity: 0.3,
    });
    p.baseBottomY = baseY;
    p.platformHeight = h;
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

    this.projectiles.push({
      mesh, center: cannon.muzzle.clone(),
      spawnTime: time, start: cannon.muzzle.clone(),
      dir: dir.clone(), speed: cannon.speed, radius: 0.4, maxAge: 6,
    });
  }

  // ─── Basketball mechanics ─────────────────────────────────────────────────

  isInThrowZone(playerPos) {
    if (!this.throwZoneCenter) return false;
    const dx = playerPos.x - this.throwZoneCenter.x;
    const dz = playerPos.z - this.throwZoneCenter.z;
    const dy = playerPos.y - this.throwZoneCenter.y;
    return Math.sqrt(dx * dx + dz * dz) < 2.2 && Math.abs(dy) < 1.5;
  }

  /** True when the player's body overlaps the rim cylinder (dunk / jump-through). */
  isPlayerInRim(playerPos, playerHeight = 1.6) {
    if (!this.hoopPos || !playerPos) return false;
    const dx = playerPos.x - this.hoopPos.x;
    const dz = playerPos.z - this.hoopPos.z;
    if (Math.sqrt(dx * dx + dz * dz) > 1.05) return false;
    const rimY = this.hoopPos.y;
    const feetY = playerPos.y;
    const headY = feetY + playerHeight;
    return feetY < rimY + 0.35 && headY > rimY - 0.45;
  }

  /** Only a shot basketball that arcs through the rim plane can score. */
  tryScoreBall(ball, playerPos) {
    if (!this.hoopPos || ball.scored || !ball.fromShot) return false;
    if (playerPos && this.isPlayerInRim(playerPos)) return false;

    const age = (this._lastTime ?? 0) - ball.spawnTime;
    if (age < 0.35) return false;
    if (ball.position.distanceTo(ball.spawnPos) < 4) return false;

    const rimY = this.hoopPos.y;
    const prevY = ball.prevY ?? ball.position.y;
    if (!(prevY > rimY - 0.15 && ball.position.y <= rimY + 0.25) || ball.velocity.y >= 0.5) return false;

    // Interpolate to rim-plane crossing for accuracy on fast balls
    let checkX = ball.position.x;
    let checkZ = ball.position.z;
    if (prevY > rimY && ball.position.y < rimY) {
      const t = (prevY - rimY) / (prevY - ball.position.y);
      const prevPos = ball.position.clone().addScaledVector(ball.velocity, -0.016);
      checkX = prevPos.x + (ball.position.x - prevPos.x) * t;
      checkZ = prevPos.z + (ball.position.z - prevPos.z) * t;
    }

    const dx = checkX - this.hoopPos.x;
    const dz = checkZ - this.hoopPos.z;
    return Math.sqrt(dx * dx + dz * dz) <= 0.88;
  }

  canHoldBall(playerPos) {
    if (this.basketScored || !playerPos) return false;
    const now = this._lastTime ?? 0;
    if (now - this.lastShotTime < 1.8) return false;
    return true;
  }

  computeShotVelocity(startPos, aimDir = null) {
    if (!this.hoopPos) return new THREE.Vector3(0, 0, -1);
    return velocityToHoop(startPos, this.hoopPos);
  }

  applyShotVariance(velocity) {
    const v = velocity.clone();
    if (this.shotCount <= 2 && Math.random() < 0.30) {
      v.x += (Math.random() < 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.0);
    }
    return v;
  }

  fireShot(startPos, velocity) {
    if (this.basketScored) return;
    this.lastShotTime = this._lastTime ?? 0;
    this.shotCount++;
    spawnFlyingBall(this, startPos, this.applyShotVariance(velocity));
  }

  _onBasketScored() {
    this.basketScored = true;

    // Activate finish box on the win pad behind the hoop
    if (this._winPad) {
      const wp = this._winPad;
      this.finishBox = {
        minX: wp.minX, maxX: wp.maxX,
        minY: wp.topY, maxY: wp.topY + 0.25,
        minZ: wp.minZ, maxZ: wp.maxZ,
      };
      wp.mesh.material.color.setHex(0xffd700);
      wp.mesh.material.emissive.setHex(0xffaa00);
      wp.mesh.material.emissiveIntensity = 1.0;
    }

    // Hoop glows green
    if (this.hoopRim) {
      this.hoopRim.material.color.setHex(0x00ff44);
      this.hoopRim.material.emissive.setHex(0x00cc22);
      this.hoopRim.material.emissiveIntensity = 2.5;
    }

    // Throw ring turns green
    if (this.throwRing) {
      this.throwRing.material.color.setHex(0x00ff88);
      this.throwRing.material.emissive.setHex(0x00cc44);
      this.throwRing.material.emissiveIntensity = 1.5;
    }
  }

  // ─── Level sections ───────────────────────────────────────────────────────

  buildStormEntry() {
    const zone = ZONES_L5[0];
    const g = this.group;
    const padD = 5;
    const padH = 1.2;
    this.addZonePad(zone, 0, 14);
    this.addZoneGate(zone, 0, 0, -4);

    // Start platform
    addPlatform(g, this.platforms, 0, 0, 0, 8, 8, padH, 0x1e3a5f, {
      emissive: 0x1e40af, emissiveIntensity: 0.18,
    });

    this.addTipSign(
      ["Hardest level yet!", "Tornadoes push you off", "Lightning strikes — dodge the circle!"],
      0, 0, -2, -1
    );

    let z = zGap(0, 8, padD);
    addPlatform(g, this.platforms, 0, 1, z, padD, padD, padH, 0x1e3a5f, {
      emissive: 0x1e40af, emissiveIntensity: 0.15,
    });

    z = zGap(z, padD, padD);
    addPlatform(g, this.platforms, -0.5, 1.5, z, padD, padD, padH, 0x1e3a5f, {
      emissive: 0x3b82f6, emissiveIntensity: 0.18,
    });

    z = zGap(z, padD, padD);
    this.addCheckpoint(1, 0, 2, z, 0x3b82f6);
    addPlatform(g, this.platforms, 0, 2, z, padD, padD, padH, 0x2563eb, {
      emissive: 0x1d4ed8, emissiveIntensity: 0.22,
    });
    this._tornadoEntryZ = z;
  }

  buildTornadoField() {
    const zone = ZONES_L5[1];
    const g = this.group;
    const padD = 5;
    const padH = 1.2;
    let z = zGap(this._tornadoEntryZ, padD, padD);
    this.addZonePad(zone, z - 28, 56);
    this.addZoneGate(zone, 0, 2, z + 5);

    const COLS = [0x1f2937, 0x374151, 0x4b5563, 0x6b7280, 0x374151];

    for (let i = 0; i < 5; i++) {
      const prevZ = z;
      z = zGap(z, padD, padD);
      const y = 2.5 + i * 0.4;
      addPlatform(g, this.platforms, (i % 2 === 0 ? -0.5 : 0.5), y, z, padD, padD, padH, COLS[i % COLS.length], {
        emissive: COLS[i % COLS.length], emissiveIntensity: 0.2,
      });

      // Tornado in the gap at i=0, i=2, i=4
      if (i === 0 || i === 2 || i === 4) {
        const gapZ = (prevZ + z) / 2;
        this.addTornado(0, y + padH, gapZ, 3.8, 0.42 + i * 0.09);
      }

      // Cannon pair at i=2
      if (i === 2) {
        const top = y + padH;
        this.addCannon(-6.5, z, top, 1.6, 3.4);
        this.addCannon(6.5, z, top, 1.8, 3.8);
      }

      // Moving lift at i=3
      if (i === 3) {
        const liftZ = zGap(z, padD, padD);
        this.addVerticalMover(-0.5, y + 0.5, liftZ, padD, padD, padH, 0x4b5563, 2.5, 0.9, 0);
        z = liftZ;
        i++;
        if (i >= 5) break;
      }
    }

    z = zGap(z, padD, padD);
    this.addCheckpoint(2, 0, 4.5, z, 0x6b7280);
    addPlatform(g, this.platforms, 0, 4.5, z, padD, padD, padH, 0x4b5563, {
      emissive: 0x374151, emissiveIntensity: 0.25,
    });

    this.addTipSign(
      ["Tornadoes drift left and right", "Wait until they swing away", "Or dash through quickly!"],
      0, 2.5, zGap(this._tornadoEntryZ, padD, padD), 1
    );

    this._lightningEntryZ = z;
  }

  buildLightningAlley() {
    const zone = ZONES_L5[2];
    const g = this.group;
    const padD = 5;
    const padH = 1.2;
    let z = zGap(this._lightningEntryZ, padD, padD);
    this.addZonePad(zone, z - 28, 56);
    this.addZoneGate(zone, 0, 4.5, z + 5);

    addPlatform(g, this.platforms, 0, 5, z, padD, padD, padH, 0x2d1b69, {
      emissive: 0x4c1d95, emissiveIntensity: 0.2,
    });

    const baseY = 5;
    for (let i = 0; i < 5; i++) {
      const prevZ = z;
      z = zGap(z, padD, padD);
      const y = baseY + i * 0.3;
      addPlatform(g, this.platforms, (i % 2 === 0 ? 0.5 : -0.5), y, z, padD, padD, padH, 0x4c1d95, {
        emissive: 0x5b21b6, emissiveIntensity: 0.22,
      });

      // Lightning in the gap at i=0, i=2
      if (i === 1 || i === 3) {
        const gapZ = (prevZ + z) / 2;
        this.addLightning(-1, gapZ, y + padH);
        this.addLightning(1.5, gapZ + 1.5, y + padH);
      }

      // Spinner at i=2
      if (i === 2) {
        const top = y + padH;
        this.addSpinner(0, top + 0.9, (prevZ + z) / 2, LASER_LEN, LASER_THICK);
        this.addCannon(-6.5, z, top, 1.4, 3.2);
        this.addCannon(6.5, z, top, 1.5, 3.5);
      }

      // Spike at i=4
      if (i === 4) {
        this.addSpikeObstacle(0, y, z, 1.5, 1.5, 2);
      }
    }

    z = zGap(z, padD, padD);
    this.addCheckpoint(3, 0, 7, z, 0x7c3aed);
    addPlatform(g, this.platforms, 0, 7, z, padD, padD, padH, 0x6d28d9, {
      emissive: 0x7c3aed, emissiveIntensity: 0.3,
    });

    this.addTipSign(
      ["Yellow circle = incoming bolt!", "You have 0.5s to escape!", "Stand in the clear zones"],
      0, 5, zGap(this._lightningEntryZ, padD, padD), -1
    );

    this._courtEntryZ = z;
  }

  buildCourtSection() {
    const zone = ZONES_L5[3];
    const g = this.group;
    const padD = 5;
    const padH = 1.2;
    let z = zGap(this._courtEntryZ, padD, padD);
    this.addZonePad(zone, z - 35, 70);
    this.addZoneGate(zone, 0, 7, z + 5);

    // Two bridge platforms leading to court
    addPlatform(g, this.platforms, 0, 7.5, z, padD, padD, padH, 0x292524, {
      emissive: 0x44403c, emissiveIntensity: 0.15,
    });

    z = zGap(z, padD, padD);
    addPlatform(g, this.platforms, 0, 8, z, padD, padD, padH, 0x44403c, {
      emissive: 0x57534e, emissiveIntensity: 0.12,
    });

    // ── Basketball Court Platform ──────────────────────────────────────────
    const courtW = 18;
    const courtD = 24;
    const courtBaseY = 8.5;
    const courtZ = zAfterPrev(z, padD, courtD, GAP);
    const court = addPlatform(g, this.platforms, 0, courtBaseY, courtZ, courtW, courtD, padH, 0xb45309, {
      emissive: 0x92400e, emissiveIntensity: 0.12,
    });
    this._courtPlatform = court;
    const courtTop = courtBaseY + padH;

    // Court floor markings
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeeeeee, emissiveIntensity: 0.4 });
    const mkLine = (lx, lz, lw, ld) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.05, ld), lineMat);
      m.position.set(lx, courtTop + 0.01, lz);
      g.add(m);
    };
    // Centre line
    mkLine(0, courtZ, courtW - 0.5, 0.12);
    // Key box (near throw zone)
    const throwZ = courtZ + courtD / 2 - 4;
    mkLine(0, throwZ - 2, 5, 0.1);
    mkLine(-2.5, throwZ - 5, 0.1, 6);
    mkLine(2.5, throwZ - 5, 0.1, 6);

    // ── Throw Zone (gold ring on floor) ────────────────────────────────────
    this.throwZoneCenter = new THREE.Vector3(0, courtTop, throwZ);
    const throwRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.15, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffa500, emissiveIntensity: 0.7 })
    );
    throwRing.rotation.x = Math.PI / 2;
    throwRing.position.set(0, courtTop + 0.03, throwZ);
    g.add(throwRing);
    this.throwRing = throwRing;

    // ── Basketball Hoop ────────────────────────────────────────────────────
    const hoopZ = courtZ - courtD / 2 + 4;
    const hoopRimY = courtTop + 3.5;
    this.hoopPos = new THREE.Vector3(0, hoopRimY, hoopZ);

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.18, hoopRimY - courtTop + 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.7 })
    );
    pole.position.set(0, courtTop + (hoopRimY - courtTop) / 2, hoopZ - 0.55);
    g.add(pole);

    // Backboard
    const backboard = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 2.6, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.82 })
    );
    backboard.position.set(0, hoopRimY + 0.9, hoopZ - 0.55);
    g.add(backboard);

    // Red square on backboard
    const redSq = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.7, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xcc2200, emissiveIntensity: 0.5 })
    );
    redSq.position.set(0, hoopRimY + 0.35, hoopZ - 0.46);
    g.add(redSq);

    // Rim
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.09, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xcc4400, emissiveIntensity: 0.55 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, hoopRimY, hoopZ);
    g.add(rim);
    this.hoopRim = rim;

    // Net
    const net = new THREE.Mesh(
      new THREE.CylinderGeometry(0.86, 0.56, 1.4, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.45, wireframe: true })
    );
    net.position.set(0, hoopRimY - 0.75, hoopZ);
    g.add(net);

    // ── Win pad (behind the hoop — stand here after scoring, not in the rim) ─
    const winPadZ = courtZ - courtD / 2 - 3.5;
    const winPad = addPlatform(g, this.platforms, 0, courtBaseY, winPadZ, 7, 4, padH, 0x555555, {
      emissive: 0x333333, emissiveIntensity: 0.08,
    });
    this._winPad = winPad;

    // ── Cannons firing during the court challenge ─────────────────────────
    this.addCannon(-8, courtZ + 2, courtTop, 1.2, 2.8);
    this.addCannon(8, courtZ + 2, courtTop, 1.4, 3.0);
    this.addCannon(-8, courtZ - 6, courtTop, 1.3, 2.9);
    this.addCannon(8, courtZ - 6, courtTop, 1.5, 3.2);

    // ── Decorative elements ───────────────────────────────────────────────
    // Animated scoreboard sign
    const scoreTex = createSignTexture("Shoot to Win!", "#cc5500", "#ffffff");
    const scoreboard = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.4),
      new THREE.MeshBasicMaterial({ map: scoreTex, transparent: true, side: THREE.DoubleSide })
    );
    scoreboard.position.set(0, courtTop + 7, hoopZ);
    g.add(scoreboard);

    this.addTipSign(
      ["Stand in the GOLD RING", "Press E to shoot!", "Score 1 basket to win!"],
      0, 7.5, zGap(this._courtEntryZ, padD, padD), 1
    );

    // Pulsing throw ring
    this.decor.push({
      update: (time) => {
        if (!this.basketScored) {
          throwRing.material.emissiveIntensity = 0.4 + Math.sin(time * 2.8) * 0.35;
        }
      },
    });
  }

  getZoneAt(z) {
    for (const zone of ZONES_L5) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES_L5[ZONES_L5.length - 1];
  }

  // ─── Main update loop ─────────────────────────────────────────────────────

  update(time, playerPos = null) {
    const dt = this._lastTime !== undefined ? Math.min(time - this._lastTime, 0.05) : 0.016;
    this._lastTime = time;

    updateSyncedCannons(this, time, playerPos);

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const age = time - p.spawnTime;
      if (age > p.maxAge) { this.group.remove(p.mesh); this.projectiles.splice(i, 1); continue; }
      p.center.copy(p.start).addScaledVector(p.dir, p.speed * age);
      p.mesh.position.copy(p.center);
      p.mesh.material.emissiveIntensity = 0.5 + Math.sin(time * 15) * 0.25;
    }

    // Moving platforms
    for (const mp of this.movingPlatforms) {
      if (mp.update) mp.update(time);
    }

    // Rim flash animation on score
    if (this._rimFlashTime !== undefined && this.hoopRim) {
      const age = time - this._rimFlashTime;
      const total = 1.0;
      if (age < total) {
        const frac = age / total;
        this.hoopRim.material.emissiveIntensity = 6.0 * Math.pow(1 - frac, 1.6) + 0.55;
        this.hoopRim.material.color.setHex(frac < 0.35 ? 0x00ff88 : 0x00ff44);
        this.hoopRim.material.emissive.setHex(frac < 0.35 ? 0x00ff44 : 0x00cc22);
      } else {
        this._rimFlashTime = undefined;
      }
    }

    // Decor & lightning
    for (const d of this.decor) {
      if (d.update) d.update(time);
    }

    // Basketballs — only shot balls passing through the rim can score
    for (let i = this.basketballs.length - 1; i >= 0; i--) {
      const ball = this.basketballs[i];
      const prevY = ball.position.y;
      ball.velocity.y -= 20 * dt;
      ball.position.addScaledVector(ball.velocity, dt);
      ball.mesh.position.copy(ball.position);
      ball.mesh.rotation.x += dt * 4;

      if (this.tryScoreBall(ball, playerPos)) {
        ball.scored = true;
        if (!this.basketScored) {
          this._rimFlashTime = time;
          this._onBasketScored();
        }
      }
      ball.prevY = prevY;

      if (ball.position.y < -30) {
        this.group.remove(ball.mesh);
        this.basketballs.splice(i, 1);
      }
    }

    // Tornado knockback impulse
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
