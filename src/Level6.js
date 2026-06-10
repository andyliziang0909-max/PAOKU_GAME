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

const GAP = 4.5;
const PAD_H = 1.2;
const LASER_LEN = 2.0;
const LASER_THICK = 0.2;
const CANNON_SPEED = 26;

function zGap(prevZ, prevD, nextD) {
  return zAfterPrev(prevZ, prevD, nextD, GAP);
}

export const ZONES_L6 = [
  {
    name: "Rainbow Relay",
    sky: 0x7dd3fc, fog: 0xa7f3d0, void: 0x22c55e,
    zMin: 8, zMax: -28,
    tip: "Level 6 — Ultimate Gauntlet · Every mechanic from all levels!",
  },
  {
    name: "Sky Gardens",
    sky: 0xfbcfe8, fog: 0xfda4af, void: 0xf472b6,
    zMin: -28, zMax: -62,
    tip: "Blink pads flicker fast — only jump when they glow bright!",
  },
  {
    name: "Conveyor Chaos",
    sky: 0x1e1b4b, fog: 0x6366f1, void: 0x4338ca,
    zMin: -62, zMax: -98,
    tip: "Belts surge at random speeds — watch before you leap!",
  },
  {
    name: "Fort Raid",
    sky: 0x1a0505, fog: 0xdc2626, void: 0x7f1d1d,
    zMin: -98, zMax: -138,
    tip: "Synced volleys + wild aim — dash or die!",
  },
  {
    name: "Thunder Storm",
    sky: 0x0f172a, fog: 0x6d28d9, void: 0x5b21b6,
    zMin: -138, zMax: -178,
    tip: "Lightning + lifts + tornadoes — dash through!",
  },
  {
    name: "Championship Court",
    sky: 0x080c0f, fog: 0xcc5500, void: 0xb91c1c,
    zMin: -178, zMax: -235,
    tip: "Score 1 basket in the gold ring · Press E — then step on the gold pad!",
  },
];

export class Level6 {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.platforms = [];
    this.movingPlatforms = [];
    this.blinkPlatforms = [];
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
    this.throwRing = null;
    this.requiresGroundedWin = true;
    this._winPad = null;
    this.finishBox = null;
    this.decor = [];
    this.checkpointCount = 6;
    this._lastTime = undefined;
    this.cannonVolleyPeriod = 2.0;
    this.cannonWarmupSec = 1;
    this._lastFiredVolleyIndex = -1;
    this._pendingExtraShots = [];
    this.shotCount = 0;
    this.lastShotTime = -999;

    this.build();
  }

  dispose() {
    this.scene.remove(this.group);
    this.platforms = [];
    this.movingPlatforms = [];
    this.blinkPlatforms = [];
    this.hazards = [];
    this.checkpoints = [];
    this.projectiles = [];
    this.cannons = [];
    this.tornadoes = [];
    this.lightnings = [];
    this.basketballs = [];
    this.decor = [];
    this._pendingExtraShots = [];
  }

  build() {
    this.buildRainbowRelay();
    this.buildSkyGardens();
    this.buildConveyorChaos();
    this.buildFortRaid();
    this.buildThunderStorm();
    this.buildChampionshipCourt();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  addZonePad(zone, centerZ, length) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(48, length),
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
      new THREE.PlaneGeometry(5.5, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x, y + 11, z);
    this.group.add(sign);
  }

  addPortalArch(y, z, color = 0xa78bfa) {
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.2, 8, 24, Math.PI),
      makeMaterial(color, color, 0.55)
    );
    arch.rotation.z = Math.PI;
    arch.position.set(0, y + 3.5, z);
    this.group.add(arch);
    this.decor.push({
      update: (time) => {
        arch.material.emissiveIntensity = 0.4 + Math.sin(time * 2.5) * 0.25;
      },
    });
  }

  addTipSign(lines, x, y, z, side = 1) {
    const tex = createTipTexture(lines, "#312e81");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x + side * 6, y + 2.4, z);
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

  addSpinner(x, y, z, length = LASER_LEN, thickness = LASER_THICK, speed = null) {
    const spinSpeed = speed ?? 3.2 + Math.random() * 3.2;
    const spinDir = Math.random() < 0.35 ? -1 : 1;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(length, thickness, thickness),
      makeMaterial(0xef4444, 0xdc2626, 0.55)
    );
    bar.position.set(x, y, z);
    this.group.add(bar);
    const spinner = { mesh: bar, x, y, z, half: length / 2, thickness, angle: 0 };
    const phase = Math.random() * Math.PI * 2;
    this.decor.push({
      update: (time) => {
        const wobble = 1 + Math.sin(time * 1.7 + phase) * 0.35;
        spinner.angle = time * spinSpeed * spinDir * wobble;
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
      box: { minX: x - r, maxX: x + r, minY: y, maxY: y + h + 0.5, minZ: z - r, maxZ: z + r },
    });
  }

  addTornado(x, baseY, z, driftAmp = 4.2, driftSpeed = 0.85) {
    const grp = new THREE.Group();
    grp.position.set(x, baseY, z);
    this.group.add(grp);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7e57c2, transparent: true, opacity: 0.62,
      side: THREE.DoubleSide, emissive: 0x5e35b1, emissiveIntensity: 0.35,
    });
    const funnel = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 10, 1, true), mat);
    funnel.position.y = 1.6;
    grp.add(funnel);
    const zDriftAmp = 1.2 + Math.random() * 2.2;
    const zDriftSpeed = driftSpeed * (0.7 + Math.random() * 0.9);
    const xPhase = Math.random() * Math.PI * 2;
    const zPhase = Math.random() * Math.PI * 2;
    const tornado = {
      mesh: grp, baseX: x, baseZ: z, x, z,
      pushRadius: 2.8, pushForce: 14,
      driftAmp, driftSpeed, zDriftAmp, zDriftSpeed, xPhase, zPhase,
      wasInRange: false,
    };
    this.tornadoes.push(tornado);
    this.decor.push({
      update: (time) => {
        grp.rotation.y = time * (5.5 + Math.sin(time * 0.9) * 1.5);
        tornado.x = x + Math.sin(time * driftSpeed + xPhase) * driftAmp;
        tornado.z = z + Math.cos(time * zDriftSpeed + zPhase) * zDriftAmp;
        grp.position.x = tornado.x;
        grp.position.z = tornado.z;
      },
    });
  }

  addLightning(x, z, platformTop, period = null) {
    const warnDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0,
        transparent: true, opacity: 0,
      })
    );
    warnDisk.rotation.x = -Math.PI / 2;
    warnDisk.position.set(x, platformTop + 0.05, z);
    this.group.add(warnDisk);

    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 16, 5),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffff44, emissiveIntensity: 0,
        transparent: true, opacity: 0,
      })
    );
    bolt.position.set(x, platformTop + 8, z);
    this.group.add(bolt);

    const hazard = {
      box: {
        minX: x - 1.2, maxX: x + 1.2,
        minY: platformTop, maxY: platformTop + 5,
        minZ: z - 1.2, maxZ: z + 1.2,
      },
      active: false,
    };
    this.hazards.push(hazard);
    this.lightnings.push(hazard);

    const PERIOD = period ?? 1.6 + Math.random() * 1.6;
    const warnLen = 0.35 + Math.random() * 0.25;
    const strikeLen = 0.45 + Math.random() * 0.35;
    const offLen = PERIOD - warnLen - strikeLen;
    const phase = Math.random() * PERIOD;
    this.decor.push({
      update: (time) => {
        const t = (time + phase) % PERIOD;
        if (t < offLen) {
          hazard.active = false;
          bolt.material.opacity = 0;
          warnDisk.material.opacity = 0;
        } else if (t < offLen + warnLen) {
          hazard.active = false;
          const f = (t - offLen) / warnLen;
          bolt.material.opacity = f * 0.5;
          warnDisk.material.opacity = f * 0.85;
          warnDisk.material.emissiveIntensity = f * 3;
        } else {
          hazard.active = true;
          const flicker = 0.8 + Math.sin(time * 120) * 0.2;
          bolt.material.opacity = flicker;
          bolt.material.emissiveIntensity = 4 * flicker;
          warnDisk.material.opacity = 0.9;
        }
      },
    });
  }

  addVerticalMover(x, baseY, z, w, d, h, color, amp, speed, phase = 0) {
    const p = addPlatform(this.group, this.platforms, x, baseY, z, w, d, h, color, {
      emissive: color, emissiveIntensity: 0.35,
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

  addBeltMover(x, baseY, z, w, d, h, color, travel, speed, phase = 0) {
    const p = addPlatform(this.group, this.platforms, x, baseY, z, w, d, h, color, {
      emissive: color, emissiveIntensity: 0.4,
    });
    p.baseZ = z;
    p.halfW = w / 2;
    p.halfD = d / 2;
    p.platformHeight = h;
    p.baseBottomY = baseY;
    p.velocity = new THREE.Vector3(0, 0, 0);
    p.update = (time) => {
      const offset = Math.sin(time * speed + phase) * travel;
      p.mesh.position.z = p.baseZ + offset;
      p.minZ = p.baseZ + offset - p.halfD;
      p.maxZ = p.baseZ + offset + p.halfD;
      p.velocity.z = Math.cos(time * speed + phase) * travel * speed;
    };
    this.movingPlatforms.push(p);
    return p;
  }

  addBlinkPlatform(x, y, z, w, d, h, color, phase) {
    const p = addPlatform(this.group, this.platforms, x, y, z, w, d, h, color, {
      emissive: color, emissiveIntensity: 0.35,
      transparent: true, opacity: 0.95, blinkPhase: phase,
    });
    p.solid = true;
    p.blinkSpeed = 4.2 + Math.random() * 3.5;
    p.blinkThreshold = 0.12 + Math.random() * 0.28;
    this.blinkPlatforms.push(p);
    return p;
  }

  addBouncePad(x, y, z, w, d, h, color, force = 14) {
    return addPlatform(this.group, this.platforms, x, y, z, w, d, h, color, {
      emissive: color, emissiveIntensity: 0.5, bounceForce: force,
    });
  }

  addFireworkSpawner(x, y, z) {
    const sparks = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 6),
        makeMaterial(RAINBOW[i % RAINBOW.length], RAINBOW[i % RAINBOW.length], 0.8)
      );
      s.visible = false;
      this.group.add(s);
      sparks.push({ mesh: s, t: i * 0.3 });
    }
    this.decor.push({
      update: (time) => {
        sparks.forEach((sp, i) => {
          const cycle = (time + sp.t) % 2.5;
          if (cycle < 1.2) {
            sp.mesh.visible = true;
            const f = cycle / 1.2;
            sp.mesh.position.set(
              x + Math.sin(i * 1.4 + time * 3) * f * 2.5,
              y + f * 4,
              z + Math.cos(i * 1.1 + time * 2) * f * 2
            );
            sp.mesh.material.opacity = 1 - f;
          } else {
            sp.mesh.visible = false;
          }
        });
      },
    });
  }

  computeCannonAim(cannon, playerPos, spread = 1) {
    const dir = new THREE.Vector3();
    if (playerPos) {
      const target = playerPos.clone();
      target.y += 0.75 + (Math.random() - 0.5) * 0.4 * spread;
      target.x += (Math.random() - 0.5) * 1.8 * spread;
      target.z += (Math.random() - 0.5) * 1.4 * spread;
      dir.subVectors(target, cannon.muzzle);
    } else {
      dir.copy(cannon.fallbackDir);
    }
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1);
    dir.normalize();
    dir.x += (Math.random() - 0.5) * 0.18 * spread;
    dir.y += (Math.random() - 0.5) * 0.1 * spread;
    dir.z += (Math.random() - 0.5) * 0.14 * spread;
    dir.normalize();
    return dir;
  }

  aimCannonBarrel(barrel, muzzle, dir) {
    const aim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    barrel.quaternion.copy(aim);
    barrel.position.copy(muzzle).addScaledVector(dir, -0.35);
  }

  addCannon(x, z, platformTop) {
    const muzzleY = platformTop + 1.05;
    const muzzle = new THREE.Vector3(x, muzzleY, z - 0.55);
    const fallbackTarget = new THREE.Vector3(0, platformTop + 0.7, z - 11);
    const fallbackDir = new THREE.Vector3().subVectors(fallbackTarget, muzzle).normalize();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 1.2, 10),
      makeMaterial(0x44403c, 0x78716c, 0.2)
    );
    base.position.set(x, platformTop + 0.55, z);
    this.group.add(base);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 1.8, 8),
      makeMaterial(0x57534e, 0xf97316, 0.45)
    );
    this.group.add(barrel);
    this.aimCannonBarrel(barrel, muzzle, fallbackDir);

    this.cannons.push({
      muzzle: muzzle.clone(), fallbackDir,
      speed: CANNON_SPEED + Math.random() * 6,
      barrel, triggerRange: 24, active: false,
    });
  }

  fireProjectile(cannon, time, playerPos, spread = 1) {
    const dir = this.computeCannonAim(cannon, playerPos, spread);
    this.aimCannonBarrel(cannon.barrel, cannon.muzzle, dir);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 10),
      makeMaterial(0xff4500, 0xff0000, 0.85)
    );
    mesh.position.copy(cannon.muzzle);
    this.group.add(mesh);
    this.projectiles.push({
      mesh, center: cannon.muzzle.clone(),
      spawnTime: time, start: cannon.muzzle.clone(),
      dir: dir.clone(), speed: cannon.speed, radius: 0.32, maxAge: 4.5,
    });
    if (spread === 1 && Math.random() < 0.35) {
      this._pendingExtraShots.push({
        cannon, time: time + 0.08 + Math.random() * 0.18,
        playerPos: playerPos?.clone() ?? null, spread: 1.4,
      });
    }
  }

  // ─── Basketball (from Level 5) ────────────────────────────────────────────

  isInThrowZone(playerPos) {
    if (!this.throwZoneCenter) return false;
    const dx = playerPos.x - this.throwZoneCenter.x;
    const dz = playerPos.z - this.throwZoneCenter.z;
    const dy = playerPos.y - this.throwZoneCenter.y;
    return Math.sqrt(dx * dx + dz * dz) < 2.2 && Math.abs(dy) < 1.5;
  }

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

  tryScoreBall(ball, playerPos) {
    if (!this.hoopPos || ball.scored || !ball.fromShot) return false;
    if (playerPos && this.isPlayerInRim(playerPos)) return false;
    const age = (this._lastTime ?? 0) - ball.spawnTime;
    if (age < 0.35) return false;
    if (ball.position.distanceTo(ball.spawnPos) < 4) return false;
    const rimY = this.hoopPos.y;
    const prevY = ball.prevY ?? ball.position.y;
    if (!(prevY > rimY - 0.15 && ball.position.y <= rimY + 0.25) || ball.velocity.y >= 0.5) return false;

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
    if (this.shotCount <= 2 && Math.random() < 0.25) {
      v.x += (Math.random() < 0.5 ? 1 : -1) * (1.4 + Math.random() * 0.8);
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
    if (this.hoopRim) {
      this.hoopRim.material.color.setHex(0x00ff44);
      this.hoopRim.material.emissive.setHex(0x00cc22);
      this.hoopRim.material.emissiveIntensity = 2.5;
    }
    if (this.throwRing) {
      this.throwRing.material.color.setHex(0x00ff88);
      this.throwRing.material.emissive.setHex(0x00cc44);
      this.throwRing.material.emissiveIntensity = 1.5;
    }
  }

  // ─── Level sections (one from each prior level + finale) ─────────────────

  /** L1 — Rainbow steps & spinners */
  buildRainbowRelay() {
    const zone = ZONES_L6[0];
    const padD = 5;
    this.addZonePad(zone, 0, 22);
    this.addZoneGate(zone, 0, 0, -4);

    addPlatform(this.group, this.platforms, 0, 0, 0, 8, 8, PAD_H, 0x4ade80, {
      emissive: 0x22c55e, emissiveIntensity: 0.2,
    });
    this.addTipSign(
      ["Ultimate gauntlet!", "Every level's tricks in one run", "Rainbow pads ahead"],
      0, 0, -2, -1
    );

    let z = zGap(0, 8, padD);
    for (let i = 0; i < 4; i++) {
      const prevZ = z;
      z = zGap(z, padD, padD);
      addPlatform(this.group, this.platforms, 0, 1 + i * 0.3, z, padD, padD, PAD_H, RAINBOW[i], {
        emissive: RAINBOW[i], emissiveIntensity: 0.35,
      });
      if (i >= 1) {
        this.addSpinner(0, 1 + i * 0.3 + PAD_H + 0.9, (prevZ + z) / 2, LASER_LEN + 0.4);
      }
    }

    z = zGap(z, padD, padD);
    this.addCheckpoint(1, 0, 2.5, z, RAINBOW[0]);
    addPlatform(this.group, this.platforms, 0, 2.5, z, padD, padD, PAD_H, RAINBOW[4], {
      emissive: RAINBOW[4], emissiveIntensity: 0.35,
    });
    this.addPortalArch(2.5, z, 0xf472b6);
    this._skyEntryZ = z;
  }

  /** L2 — Bounce pads & blink platforms */
  buildSkyGardens() {
    const zone = ZONES_L6[1];
    const padD = 5;
    let z = zGap(this._skyEntryZ, padD, padD);
    this.addZonePad(zone, z - 18, 36);
    this.addZoneGate(zone, 0, 2.5, z + 4);

    addPlatform(this.group, this.platforms, 0, 3, z, padD, padD, PAD_H, 0xf472b6, {
      emissive: 0xec4899, emissiveIntensity: 0.25,
    });

    for (let i = 0; i < 3; i++) {
      z = zGap(z, padD, padD);
      if (i === 0) {
        this.addBouncePad(0, 3.5, z, padD, padD, PAD_H, 0x4ade80, 15);
      } else if (i === 1) {
        this.addBlinkPlatform(0, 4, z, padD, padD, PAD_H, 0xa78bfa, i * 1.7);
        this.addBlinkPlatform(-3, 4, z - 1, 3, 3, PAD_H, 0xc084fc, i * 1.7 + 0.5);
        this.addBlinkPlatform(3, 4, z - 1, 3, 3, PAD_H, 0xc084fc, i * 1.7 + 1);
      } else {
        this.addBouncePad(0, 4.5, z, 6, 6, PAD_H, 0x38bdf8, 13);
      }
    }

    z = zGap(z, padD, padD);
    this.addCheckpoint(2, 0, 5, z, 0xf472b6);
    addPlatform(this.group, this.platforms, 0, 5, z, padD, padD, PAD_H, 0xec4899, {
      emissive: 0xdb2777, emissiveIntensity: 0.3,
    });
    this.addPortalArch(5, z, 0x6366f1);
    this._conveyorEntryZ = z;
  }

  /** L3 — Conveyor belt movers */
  buildConveyorChaos() {
    const zone = ZONES_L6[2];
    const padD = 5;
    let z = zGap(this._conveyorEntryZ, padD, padD);
    this.addZonePad(zone, z - 18, 36);
    this.addZoneGate(zone, 0, 5, z + 4);

    addPlatform(this.group, this.platforms, 0, 5.5, z, padD, padD, PAD_H, 0x6366f1, {
      emissive: 0x4f46e5, emissiveIntensity: 0.25,
    });

    for (let i = 0; i < 3; i++) {
      z = zGap(z, padD, padD);
      const beltSpeed = 1.3 + Math.random() * 0.9;
      const travel = 3.8 + Math.random() * 1.4;
      const xOff = (i % 2 === 0 ? -2.5 : 2.5);
      this.addBeltMover(xOff, 5.5 + i * 0.2, z, padD - 0.5, padD, PAD_H, RAINBOW[i + 2], travel, beltSpeed, i * 2.1);
    }

    z = zGap(z, padD, padD);
    this.addCheckpoint(3, 0, 6.5, z, 0x818cf8);
    addPlatform(this.group, this.platforms, 0, 6.5, z, padD, padD, PAD_H, 0x6366f1, {
      emissive: 0x4338ca, emissiveIntensity: 0.3,
    });
    this.addPortalArch(6.5, z, 0xdc2626);
    this._fortEntryZ = z;
  }

  /** L4 — Cannons, spinners, spikes, tornadoes */
  buildFortRaid() {
    const zone = ZONES_L6[3];
    const padD = 5;
    let z = zGap(this._fortEntryZ, padD, padD);
    let y = 7;
    this.addZonePad(zone, z - 22, 44);
    this.addZoneGate(zone, 0, y, z + 4);

    addPlatform(this.group, this.platforms, 0, y, z, padD, padD, PAD_H, 0x991b1b, {
      emissive: 0x7f1d1d, emissiveIntensity: 0.25,
    });

    for (let i = 0; i < 4; i++) {
      const prevZ = z;
      z = zGap(z, padD, padD);
      addPlatform(this.group, this.platforms, 0, y, z, 5.5, 5.5, PAD_H, 0x7f1d1d, {
        emissive: 0x991b1b, emissiveIntensity: 0.22,
      });
      const top = y + PAD_H;
      const gapZ = (prevZ + z) / 2;
      this.addCannon(-8, gapZ, top);
      this.addCannon(8, gapZ, top);
      if (i !== 0) this.addSpinner(0, top + 0.9, gapZ, LASER_LEN + 0.6);
      if (i >= 1) this.addTornado((i % 2 === 0 ? -2 : 2), top, gapZ);
      if (i >= 2) this.addSpikeObstacle((i % 2 === 0 ? 1.5 : -1.5), y, z, 1.2, 1.2, 1.6);
    }

    z = zGap(z, padD, padD);
    this.addCheckpoint(4, 0, y + 0.5, z, 0xef4444);
    addPlatform(this.group, this.platforms, 0, y + 0.5, z, padD, padD, PAD_H, 0xdc2626, {
      emissive: 0xb91c1c, emissiveIntensity: 0.3,
    });
    this.addPortalArch(y, z, 0x6d28d9);
    this._stormEntryZ = z;
  }

  /** L5 — Lightning, lifts, tornadoes */
  buildThunderStorm() {
    const zone = ZONES_L6[4];
    const padD = 5;
    let z = zGap(this._stormEntryZ, padD, padD);
    let y = 8.5;
    this.addZonePad(zone, z - 20, 40);
    this.addZoneGate(zone, 0, y, z + 4);

    addPlatform(this.group, this.platforms, 0, y, z, padD, padD, PAD_H, 0x4c1d95, {
      emissive: 0x5b21b6, emissiveIntensity: 0.25,
    });

    for (let i = 0; i < 3; i++) {
      const prevZ = z;
      z = zGap(z, padD, padD);
      if (i === 1 || i === 2) {
        this.addVerticalMover(0, y, z, 5, 5, PAD_H, 0x7c3aed, 2.4, 1.35, i * 1.8);
      } else {
        addPlatform(this.group, this.platforms, 0, y, z, 5.5, 5.5, PAD_H, 0x6d28d9, {
          emissive: 0x7c3aed, emissiveIntensity: 0.28,
        });
      }
      const gapZ = (prevZ + z) / 2;
      const top = y + PAD_H + (i === 1 ? 2 : 0);
      this.addLightning(-2, gapZ, y + PAD_H);
      this.addLightning(2, gapZ + 0.8, y + PAD_H);
      this.addTornado(0, top, gapZ, 3.5, 0.95);
      this.addCannon(-8, z, top);
      this.addCannon(8, z, top);
      if (i === 2) this.addSpinner(0, top + 0.9, gapZ, LASER_LEN + 0.8);
    }

    z = zGap(z, padD, padD);
    this.addCheckpoint(5, 0, y + 0.5, z, 0xa855f7);
    addPlatform(this.group, this.platforms, 0, y + 0.5, z, padD, padD, PAD_H, 0x7c3aed, {
      emissive: 0x6d28d9, emissiveIntensity: 0.35,
    });
    this.addPortalArch(y, z, 0xcc5500);
    this._courtEntryZ = z;
  }

  /** Simple championship court — one hoop, no cannons */
  buildChampionshipCourt() {
    const zone = ZONES_L6[5];
    const padD = 5;
    let z = zGap(this._courtEntryZ, padD, padD);
    const courtBaseY = 9.5;
    this.addZonePad(zone, z - 22, 44);
    this.addZoneGate(zone, 0, courtBaseY, z + 4);

    addPlatform(this.group, this.platforms, 0, courtBaseY, z, padD, padD, PAD_H, 0x44403c, {
      emissive: 0x57534e, emissiveIntensity: 0.15,
    });

    z = zGap(z, padD, padD);
    const courtW = 16;
    const courtD = 20;
    const courtZ = zAfterPrev(z, padD, courtD, GAP);
    addPlatform(this.group, this.platforms, 0, courtBaseY, courtZ, courtW, courtD, PAD_H, 0xb45309, {
      emissive: 0x92400e, emissiveIntensity: 0.15,
    });
    const courtTop = courtBaseY + PAD_H;

    const throwZ = courtZ + courtD / 2 - 3.5;
    this.throwZoneCenter = new THREE.Vector3(0, courtTop, throwZ);
    const throwRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.15, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffa500, emissiveIntensity: 0.7 })
    );
    throwRing.rotation.x = Math.PI / 2;
    throwRing.position.set(0, courtTop + 0.03, throwZ);
    this.group.add(throwRing);
    this.throwRing = throwRing;

    const hoopZ = courtZ - courtD / 2 + 3.5;
    const hoopRimY = courtTop + 3.5;
    this.hoopPos = new THREE.Vector3(0, hoopRimY, hoopZ);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x94a3b8, emissiveIntensity: 0.08 })
    );
    board.position.set(0, hoopRimY, hoopZ - 0.5);
    this.group.add(board);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.18, hoopRimY - courtTop + 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 })
    );
    pole.position.set(0, courtTop + (hoopRimY - courtTop) / 2, hoopZ - 0.55);
    this.group.add(pole);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.09, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xcc4400, emissiveIntensity: 0.55 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, hoopRimY, hoopZ);
    this.group.add(rim);
    this.hoopRim = rim;

    const winPadZ = courtZ - courtD / 2 - 2.5;
    this._winPad = addPlatform(this.group, this.platforms, 0, courtBaseY, winPadZ, 7, 4, PAD_H, 0x555555, {
      emissive: 0x333333, emissiveIntensity: 0.08,
    });

    this.addTipSign(
      ["Score 1 basket!", "Stand in GOLD · Press E", "Bonus Level 7 unlocks after this!"],
      0, courtBaseY, z, 1
    );

    this.decor.push({
      update: (time) => {
        if (!this.basketScored) {
          throwRing.material.emissiveIntensity = 0.4 + Math.sin(time * 2.8) * 0.35;
        }
      },
    });
  }

  getZoneAt(z) {
    for (const zone of ZONES_L6) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES_L6[ZONES_L6.length - 1];
  }

  update(time, playerPos = null) {
    const dt = this._lastTime !== undefined ? Math.min(time - this._lastTime, 0.05) : 0.016;
    this._lastTime = time;

    const volleyJitter = Math.sin(time * 1.3) * 0.35 + (Math.random() < 0.06 ? 0.55 : 0);
    const savedPeriod = this.cannonVolleyPeriod;
    this.cannonVolleyPeriod = savedPeriod + volleyJitter;
    updateSyncedCannons(this, time, playerPos);
    this.cannonVolleyPeriod = savedPeriod;

    for (let i = this._pendingExtraShots.length - 1; i >= 0; i--) {
      const shot = this._pendingExtraShots[i];
      if (time >= shot.time) {
        this.fireProjectile(shot.cannon, time, shot.playerPos, shot.spread);
        this._pendingExtraShots.splice(i, 1);
      }
    }

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
      p.mesh.material.emissiveIntensity = 0.6 + Math.sin(time * 20) * 0.3;
    }

    for (const mp of this.movingPlatforms) {
      if (mp.update) mp.update(time);
    }

    for (const p of this.blinkPlatforms) {
      const speed = p.blinkSpeed ?? 4.5;
      const threshold = p.blinkThreshold ?? 0.2;
      const on = Math.sin(time * speed + (p.blinkPhase ?? 0)) > threshold;
      p.solid = on;
      p.mesh.material.opacity = on ? 0.95 : 0.12;
      p.mesh.material.emissiveIntensity = on ? 0.65 : 0.05;
    }

    for (let i = this.basketballs.length - 1; i >= 0; i--) {
      const ball = this.basketballs[i];
      const prevY = ball.position.y;
      ball.velocity.y -= 20 * dt;
      ball.position.addScaledVector(ball.velocity, dt);
      ball.mesh.position.copy(ball.position);
      ball.mesh.rotation.x += dt * 4;
      if (this.tryScoreBall(ball, playerPos)) {
        ball.scored = true;
        if (!this.basketScored) this._onBasketScored();
      }
      ball.prevY = prevY;
      if (ball.position.y < -30) {
        this.group.remove(ball.mesh);
        this.basketballs.splice(i, 1);
      }
    }

    for (const d of this.decor) {
      if (d.update) d.update(time);
    }

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
