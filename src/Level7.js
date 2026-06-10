import * as THREE from "three";
import {
  makeMaterial,
  addPlatform,
  createSignTexture,
  createTipTexture,
} from "./levelHelpers.js";
import { spawnFlyingBall, velocityFromAim } from "./basketballShooting.js";
import { registerBasketScore } from "./basketballFun.js";

const PAD_H = 1.2;
const ROUND_DURATION = 60;
const SCORE_GOAL = 15;

export const ZONES_L7 = [
  {
    name: "Bonus Entry",
    sky: 0x1e1b4b,
    fog: 0x7c3aed,
    void: 0x5b21b6,
    zMin: 8,
    zMax: -12,
    tip: "Level 7 — Bonus Bounce Round! Shoot hoops for 1, 2, and 3 points.",
  },
  {
    name: "Bounce Round",
    sky: 0x080c0f,
    fog: 0xcc5500,
    void: 0xb91c1c,
    zMin: -12,
    zMax: -90,
    tip: "Close = 1 pt · Mid = 2 pts · Far = 3 pts · 15 pts in 1 min to win!",
  },
];

export class Level7 {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.platforms = [];
    this.hoops = [];
    this.basketballs = [];
    this.decor = [];
    this.checkpointCount = 1;
    this.checkpoints = [];
    this.hazards = [];
    this.finishBox = null;
    this.requiresGroundedWin = true;
    this.basketScored = false;
    this.throwZoneCenter = null;
    this.throwRing = null;
    this._winPad = null;
    this._lastTime = undefined;
    this.shotCount = 0;
    this.lastShotTime = -999;

    this.courtBox = null;
    this.courtCenterZ = 0;
    this.bonusRoundActive = false;
    this.bonusRoundEnded = false;
    this.bonusRoundStartTime = 0;
    this.bonusRoundDuration = ROUND_DURATION;
    this.bonusRoundScore = 0;
    this.bonusMinScore = SCORE_GOAL;
    this.lastPointPopup = null;
    this._roundStarted = false;

    this.ballRadius = 0.48;
    this.highArcShots = true;
    this.trajectoryDotScale = 1.2;
    this.trajectoryMaxSteps = 58;
    this.trajectoryDrop = 32;

    this.build();
  }

  dispose() {
    this.scene.remove(this.group);
    this.platforms = [];
    this.hoops = [];
    this.basketballs = [];
    this.decor = [];
    this.checkpoints = [];
  }

  build() {
    this.buildEntry();
    this.buildBounceArena();
  }

  addTipSign(lines, x, y, z, side = 1) {
    const tex = createTipTexture(lines, "#312e81");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.3),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x + side * 7, y + 2.6, z);
    sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(sign);
  }

  addCheckpoint(index, x, y, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.4, 6),
      makeMaterial(color, color, 0.45)
    );
    mesh.position.set(x, y + 0.2, z);
    this.group.add(mesh);
    const r = 1.5;
    this.checkpoints.push({
      index, mesh, ring: null, active: false,
      respawn: new THREE.Vector3(x, y + 0.35, z),
      box: { minX: x - r, maxX: x + r, minY: y, maxY: y + 2, minZ: z - r, maxZ: z + r },
    });
  }

  addBouncePad(x, y, z, w, d, h, color, force = 14) {
    return addPlatform(this.group, this.platforms, x, y, z, w, d, h, color, {
      emissive: color, emissiveIntensity: 0.5, bounceForce: force,
    });
  }

  addBasketballHoop(hoopX, hoopZ, courtTop, rimY, points, labelColor) {
    const rimPos = new THREE.Vector3(hoopX, rimY, hoopZ);
    const poleH = rimY - courtTop + 0.5;
    const faceYaw = hoopX > 0.5 ? -Math.PI / 2 : hoopX < -0.5 ? Math.PI / 2 : 0;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.17, poleH, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 })
    );
    pole.position.set(hoopX, courtTop + poleH / 2, hoopZ - (hoopX === 0 ? 0.55 : 0));
    if (hoopX > 0.5) pole.position.z = hoopZ;
    if (hoopX < -0.5) pole.position.z = hoopZ;
    this.group.add(pole);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x94a3b8, emissiveIntensity: 0.08 })
    );
    board.position.copy(rimPos);
    board.position.z += hoopX === 0 ? -0.45 : 0;
    board.position.x += hoopX > 0 ? 0.35 : hoopX < 0 ? -0.35 : 0;
    board.rotation.y = faceYaw;
    this.group.add(board);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.085, 8, 24),
      makeMaterial(0xff5500, 0xcc4400, 0.55)
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(rimPos);
    this.group.add(rim);

    const label = `${points} PT${points > 1 ? "S" : ""}`;
    const badgeTex = createSignTexture(label, `#${labelColor.toString(16).padStart(6, "0")}`, "#ffffff");
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.6),
      new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, side: THREE.DoubleSide })
    );
    badge.position.set(hoopX, rimY + 1.1, hoopZ);
    badge.rotation.y = faceYaw;
    this.group.add(badge);

    const hoop = {
      id: this.hoops.length,
      pos: rimPos.clone(),
      rim, board, badge,
      points,
      scored: false,
      lastScoreTime: -999,
      flashUntil: 0,
    };
    this.hoops.push(hoop);
    return hoop;
  }

  buildEntry() {
    addPlatform(this.group, this.platforms, 0, 0, 0, 10, 10, PAD_H, 0x7c3aed, {
      emissive: 0x6d28d9, emissiveIntensity: 0.25,
    });
    this.addTipSign(
      ["Bonus Level 7!", "Bounce Round arena ahead", "No cannons — just hoops"],
      0, 0, -2, -1
    );
    addPlatform(this.group, this.platforms, 0, 0, -8, 6, 6, PAD_H, 0x8b5cf6, {
      emissive: 0x7c3aed, emissiveIntensity: 0.3,
    });
    this.addCheckpoint(1, 0, 0, -8, 0xa855f7);
  }

  buildBounceArena() {
    const courtBaseY = 0;
    const courtW = 24;
    const courtD = 28;
    const courtZ = -38;
    this.courtCenterZ = courtZ;
    const courtTop = courtBaseY + PAD_H;

    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(courtW + 8, courtD + 12),
      makeMaterial(0xb91c1c, 0x7f1d1d, 0.2, { transparent: true, opacity: 0.45 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, -22, courtZ);
    this.group.add(pad);

    const gateTex = createSignTexture("BOUNCE ROUND", "#cc5500", "#ffffff");
    const gate = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.4),
      new THREE.MeshBasicMaterial({ map: gateTex, transparent: true, side: THREE.DoubleSide })
    );
    gate.position.set(0, courtTop + 8, courtZ + courtD / 2 + 2);
    this.group.add(gate);

    addPlatform(this.group, this.platforms, 0, courtBaseY, courtZ, courtW, courtD, PAD_H, 0xb45309, {
      emissive: 0x92400e, emissiveIntensity: 0.18,
    });

    this.courtBox = {
      minX: -courtW / 2 + 0.5,
      maxX: courtW / 2 - 0.5,
      minY: courtTop - 0.5,
      maxY: courtTop + 10,
      minZ: courtZ - courtD / 2 + 0.5,
      maxZ: courtZ + courtD / 2 - 0.5,
    };

    // Bounce pads for height on deep shots
    this.addBouncePad(-6, courtTop, courtZ + 7, 3.5, 3.5, PAD_H, 0x4ade80, 16);
    this.addBouncePad(6, courtTop, courtZ + 7, 3.5, 3.5, PAD_H, 0x38bdf8, 16);
    this.addBouncePad(-6, courtTop, courtZ - 2, 3, 3, PAD_H, 0xa78bfa, 14);
    this.addBouncePad(6, courtTop, courtZ - 2, 3, 3, PAD_H, 0xf472b6, 14);

    const throwZ = courtZ + courtD / 2 - 4.5;
    this.throwZoneCenter = new THREE.Vector3(0, courtTop, throwZ);
    const throwRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.15, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffa500, emissiveIntensity: 0.75 })
    );
    throwRing.rotation.x = Math.PI / 2;
    throwRing.position.set(0, courtTop + 0.03, throwZ);
    this.group.add(throwRing);
    this.throwRing = throwRing;

    const backZ = courtZ - courtD / 2 + 2.5;
    const sideX = courtW / 2 - 1.2;

    // 1-point hoops — close, low (layup range)
    this.addBasketballHoop(-4.5, courtZ + 5, courtTop, courtTop + 3.0, 1, 0x4ade80);
    this.addBasketballHoop(4.5, courtZ + 5, courtTop, courtTop + 3.0, 1, 0x4ade80);
    this.addBasketballHoop(-3, courtZ + 3, courtTop, courtTop + 2.8, 1, 0x22c55e);

    // 2-point hoops — mid range
    this.addBasketballHoop(-sideX, courtZ, courtTop, courtTop + 3.6, 2, 0xfacc15);
    this.addBasketballHoop(sideX, courtZ, courtTop, courtTop + 3.6, 2, 0xfacc15);
    this.addBasketballHoop(0, courtZ - 1, courtTop, courtTop + 3.8, 2, 0xfbbf24);
    this.addBasketballHoop(-5, courtZ + 1, courtTop, courtTop + 3.5, 2, 0xfde047);

    // 3-point hoops — far / deep
    this.addBasketballHoop(0, backZ, courtTop, courtTop + 4.2, 3, 0xf97316);
    this.addBasketballHoop(-sideX, backZ + 1, courtTop, courtTop + 4.0, 3, 0xfb923c);
    this.addBasketballHoop(sideX, backZ + 1, courtTop, courtTop + 4.0, 3, 0xfb923c);
    this.addBasketballHoop(-7, backZ + 2, courtTop, courtTop + 3.9, 3, 0xea580c);
    this.addBasketballHoop(7, backZ + 2, courtTop, courtTop + 3.9, 3, 0xea580c);

    // Win pad (unlocks after bonus round goal)
    this._winPad = addPlatform(this.group, this.platforms, 0, courtBaseY, courtZ, 8, 6, PAD_H, 0x555555, {
      emissive: 0x333333, emissiveIntensity: 0.1,
    });

    this.addTipSign(
      ["Step on court to start!", "1 min · 15 pts to win", "Green=1 · Yellow=2 · Orange=3"],
      0, courtBaseY, courtZ - courtD / 2 - 4, 1
    );

    this.decor.push({
      update: (time) => {
        if (!this.basketScored && this.bonusRoundActive) {
          throwRing.material.emissiveIntensity = 0.55 + Math.sin(time * 4) * 0.35;
        } else if (!this.basketScored) {
          throwRing.material.emissiveIntensity = 0.4 + Math.sin(time * 2.5) * 0.3;
        }
        for (const hoop of this.hoops) {
          if (hoop.flashUntil && time > hoop.flashUntil) {
            hoop.rim.material.emissiveIntensity = 0.55;
            hoop.flashUntil = 0;
          }
        }
      },
    });
  }

  isOnCourt(playerPos) {
    if (!this.courtBox || !playerPos) return false;
    const b = this.courtBox;
    return (
      playerPos.x >= b.minX && playerPos.x <= b.maxX &&
      playerPos.y >= b.minY && playerPos.y <= b.maxY &&
      playerPos.z >= b.minZ && playerPos.z <= b.maxZ
    );
  }

  isInThrowZone(playerPos) {
    return this.isOnCourt(playerPos);
  }

  isOnBounceCourt(playerPos) {
    return this.isOnCourt(playerPos);
  }

  startBonusRound(time) {
    if (this._roundStarted || this.basketScored) return;
    this._roundStarted = true;
    this.bonusRoundActive = true;
    this.bonusRoundEnded = false;
    this.bonusRoundStartTime = time;
    this.bonusRoundScore = 0;
    this.shotCount = 0;
    // Reset all hoops for a fresh round
    for (const hoop of this.hoops) {
      hoop.scored = false;
      hoop.flashUntil = 0;
      hoop.rim.material.color.setHex(0xff5500);
      hoop.rim.material.emissive.setHex(0xcc4400);
      hoop.rim.material.emissiveIntensity = 0.55;
      hoop.badge.material.opacity = 1.0;
    }
  }

  endBonusRound(time) {
    if (this.bonusRoundEnded) return;
    this.bonusRoundEnded = true;
    this.bonusRoundActive = false;
    const ppm = this.getPointsPerMinute(time);
    if (this.bonusRoundScore >= this.bonusMinScore) {
      this._onRoundWon(ppm);
    } else {
      this.lastPointPopup = {
        text: `Need ${this.bonusMinScore} pts — got ${this.bonusRoundScore}`,
        time,
        duration: 3,
      };
      this._roundStarted = false;
      this.bonusRoundEnded = false;
    }
  }

  getBounceRoundHud(time) {
    if (!this.bonusRoundActive) return null;
    const elapsed = Math.min(time - this.bonusRoundStartTime, this.bonusRoundDuration);
    return {
      score: this.bonusRoundScore,
      timeLeft: Math.max(0, this.bonusRoundDuration - elapsed),
      ppm: this.getPointsPerMinute(time),
      goal: this.bonusMinScore,
      active: true,
    };
  }

  getPointsPerMinute(time) {
    const elapsed = this.bonusRoundActive
      ? Math.max(0.01, time - this.bonusRoundStartTime)
      : this.bonusRoundDuration;
    return Math.round(this.bonusRoundScore / Math.max(elapsed / 60, 1 / 60));
  }

  _registerPointPopup(points, time, meta = {}) {
    const extra = this._characterMeta?.() ?? {};
    if (this._funState) {
      registerBasketScore(this, points, { trick: "swish", ...extra, ...meta }, time, this._funState, {});
    } else {
      this.lastPointPopup = { text: `+${points} PTS!`, time, duration: 1.1 };
      this.bonusRoundScore += points;
      if (this.bonusRoundActive && this.bonusRoundScore >= this.bonusMinScore) {
        this.endBonusRound(time);
      }
    }
  }

  _onRoundWon(ppm) {
    this.basketScored = true;
    this.lastPointPopup = { text: `ROUND CLEAR! ${ppm} pts/min`, time: this._lastTime ?? 0, duration: 2.5 };
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
    if (this.throwRing) {
      this.throwRing.material.color.setHex(0x00ff88);
      this.throwRing.material.emissive.setHex(0x00cc44);
      this.throwRing.material.emissiveIntensity = 1.5;
    }
    for (const hoop of this.hoops) {
      hoop.rim.material.color.setHex(0x00ff44);
      hoop.rim.material.emissive.setHex(0x00cc22);
      hoop.rim.material.emissiveIntensity = 1.2;
    }
  }

  isPlayerInRim(hoop, playerPos, playerHeight = 1.6) {
    if (!playerPos) return false;
    const dx = playerPos.x - hoop.pos.x;
    const dz = playerPos.z - hoop.pos.z;
    if (Math.sqrt(dx * dx + dz * dz) > 1.05) return false;
    const rimY = hoop.pos.y;
    const feetY = playerPos.y;
    const headY = feetY + playerHeight;
    return feetY < rimY + 0.35 && headY > rimY - 0.45;
  }

  tryScoreBall(ball, playerPos) {
    if (!ball.fromShot || ball.scored) return false;
    const now = this._lastTime ?? 0;
    if (now - ball.spawnTime < 0.35) return false;
    if (ball.position.distanceTo(ball.spawnPos) < 4) return false;

    for (const hoop of this.hoops) {
      if (hoop.scored) continue;
      if (playerPos && this.isPlayerInRim(hoop, playerPos)) continue;

      const rimY = hoop.pos.y;
      const rimRadius = 0.85; // actual torus inner radius
      const scoreRadius = rimRadius * 0.92; // generous — ball can graze the rim

      // Check current frame and interpolate back one step for fast balls
      const prevY = ball.prevY ?? ball.position.y;
      const crossingDown = prevY > rimY - 0.15 && ball.position.y <= rimY + 0.25;
      if (!crossingDown || ball.velocity.y >= 0.5) continue;

      // Use interpolated position at the rim plane for more accuracy
      let checkX = ball.position.x;
      let checkZ = ball.position.z;
      if (prevY > rimY && ball.position.y < rimY) {
        const t = (prevY - rimY) / (prevY - ball.position.y);
        const prevPos = ball.position.clone().addScaledVector(ball.velocity, -0.016);
        checkX = prevPos.x + (ball.position.x - prevPos.x) * t;
        checkZ = prevPos.z + (ball.position.z - prevPos.z) * t;
      }

      const dx = checkX - hoop.pos.x;
      const dz = checkZ - hoop.pos.z;
      const rimDist = Math.sqrt(dx * dx + dz * dz);
      if (rimDist > scoreRadius) {
        if (rimDist < scoreRadius + 0.4) this.lastNearMiss = { time: now, duration: 0.85 };
        continue;
      }

      // Scored! Mark permanently done
      hoop.scored = true;
      hoop.lastScoreTime = now;
      this._flashHoop(hoop, now);
      this._registerPointPopup(hoop.points, now);
      ball.scored = true;
      return true;
    }
    return false;
  }

  _flashHoop(hoop, now) {
    hoop.rim.material.color.setHex(0x00ff88);
    hoop.rim.material.emissive.setHex(0x00ff44);
    hoop.rim.material.emissiveIntensity = 6.0;
    hoop.flashUntil = now + 0.9;
    hoop.flashStart = now;
    // Grey out the point badge so player knows this hoop is done
    hoop.badge.material.opacity = 0.35;
  }

  canHoldBall(playerPos) {
    if (this.basketScored || !playerPos) return false;
    if (!this.bonusRoundActive) return false;
    const now = this._lastTime ?? 0;
    if (now - this.lastShotTime < 0.55) return false;
    return true;
  }

  computeShotVelocity(startPos, aimDir) {
    if (!aimDir || aimDir.lengthSq() < 0.0001) return new THREE.Vector3(0, 0, -1);
    return velocityFromAim(aimDir);
  }

  fireShot(startPos, velocity) {
    if (this.basketScored) return;
    this.lastShotTime = this._lastTime ?? 0;
    this.shotCount++;
    spawnFlyingBall(this, startPos, velocity);
  }

  getZoneAt(z) {
    for (const zone of ZONES_L7) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES_L7[ZONES_L7.length - 1];
  }

  update(time, playerPos = null) {
    const dt = this._lastTime !== undefined ? Math.min(time - this._lastTime, 0.05) : 0.016;
    this._lastTime = time;

    if (playerPos && !this.basketScored) {
      if (!this.bonusRoundActive && !this.bonusRoundEnded && this.isOnCourt(playerPos)) {
        this.startBonusRound(time);
      }
      if (this.bonusRoundActive && time - this.bonusRoundStartTime >= this.bonusRoundDuration) {
        this.endBonusRound(time);
      }
    }

    for (let i = this.basketballs.length - 1; i >= 0; i--) {
      const ball = this.basketballs[i];
      const prevY = ball.position.y;
      ball.velocity.y -= 20 * dt;
      ball.position.addScaledVector(ball.velocity, dt);
      ball.mesh.position.copy(ball.position);
      ball.mesh.rotation.x += dt * 4;
      if (this.tryScoreBall(ball, playerPos)) {
        this.group.remove(ball.mesh);
        this.basketballs.splice(i, 1);
        continue;
      }
      ball.prevY = prevY;
      if (ball.position.y < -30) {
        if (this._funState) this._funState.onMiss();
        this.group.remove(ball.mesh);
        this.basketballs.splice(i, 1);
      }
    }

    // Animate rim flash — bright green burst then fade back to orange
    for (const hoop of this.hoops) {
      if (hoop.flashUntil && time <= hoop.flashUntil) {
        const age = time - hoop.flashStart;
        const total = hoop.flashUntil - hoop.flashStart;
        const frac = age / total;
        // Pulse: spike to 6 then ease out to 0.55
        const ei = 6.0 * Math.pow(1 - frac, 1.6) + 0.55;
        hoop.rim.material.emissiveIntensity = ei;
        // Shift colour from green back to orange as it fades
        hoop.rim.material.color.setHex(frac < 0.4 ? 0x00ff88 : 0xff5500);
        hoop.rim.material.emissive.setHex(frac < 0.4 ? 0x00ff44 : 0xcc4400);
      } else if (hoop.flashUntil && time > hoop.flashUntil) {
        hoop.flashUntil = 0;
        if (hoop.scored) {
          // Stay dim green — already scored
          hoop.rim.material.color.setHex(0x00aa55);
          hoop.rim.material.emissive.setHex(0x007733);
          hoop.rim.material.emissiveIntensity = 0.4;
        } else {
          hoop.rim.material.color.setHex(0xff5500);
          hoop.rim.material.emissive.setHex(0xcc4400);
          hoop.rim.material.emissiveIntensity = 0.55;
        }
      }
    }

    for (const d of this.decor) {
      if (d.update) d.update(time);
    }
  }
}
