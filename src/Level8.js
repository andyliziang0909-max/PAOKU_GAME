import * as THREE from "three";
import {
  makeMaterial,
  addPlatform,
  createSignTexture,
  createTipTexture,
} from "./levelHelpers.js";
import { spawnFlyingBall, velocityFromAim } from "./basketballShooting.js";
import { registerBasketScore, detectTrickType } from "./basketballFun.js";

const PAD_H = 1.2;
const ROUND_DURATION = 120;
const SCORE_GOAL = 15;
const HOOP_RESCORE_COOLDOWN = 2.5;
const LEVEL8_SHOT_SPEED = 21; // high arc still reaches deep hoops

export const ZONES_L8 = [
  {
    name: "Moving Court Entry",
    sky: 0x0c1a2e,
    fog: 0x1e3a5f,
    void: 0x060e1a,
    zMin: 8,
    zMax: -12,
    tip: "Level 8 — Moving Hoops! Three lanes of sliding baskets.",
  },
  {
    name: "Moving Hoops Arena",
    sky: 0x080f1c,
    fog: 0x1e40af,
    void: 0x0c1a2e,
    zMin: -12,
    zMax: -120,
    tip: "Touch rim or backboard to score! 15 pts in 2 min — hoops slide slowly.",
  },
];

export class Level8 {
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
    this._rimWorldPos = new THREE.Vector3();
    this._boardWorldPos = new THREE.Vector3();

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

    // Tall arc + big ball so long shots stay visible
    this.ballRadius = 0.58;
    this.highArcShots = true;
    this.trajectoryDotScale = 1.4;
    this.trajectoryMaxSteps = 75;
    this.trajectoryDrop = 40;

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
    this.buildCourt();
  }

  addTipSign(lines, x, y, z, side = 1) {
    const tex = createTipTexture(lines, "#0c1a2e");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.4),
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

  buildEntry() {
    addPlatform(this.group, this.platforms, 0, 0, 0, 10, 10, PAD_H, 0x1e3a5f, {
      emissive: 0x1e40af, emissiveIntensity: 0.25,
    });
    this.addTipSign(
      ["Level 8 — Moving Court!", "Hoops slide across 3 lanes", "Time your aim & release!"],
      0, 0, -2, -1
    );
    addPlatform(this.group, this.platforms, 0, 0, -8, 6, 6, PAD_H, 0x1e40af, {
      emissive: 0x2563eb, emissiveIntensity: 0.3,
    });
    this.addCheckpoint(1, 0, 0, -8, 0x3b82f6);
  }

  buildCourt() {
    const courtBaseY = 0;
    const courtW = 28;
    const courtD = 46;
    const courtZ = -45;
    this.courtCenterZ = courtZ;
    const courtTop = courtBaseY + PAD_H;

    // Main court floor — hardwood orange
    addPlatform(this.group, this.platforms, 0, courtBaseY, courtZ, courtW, courtD, PAD_H, 0xb45309, {
      emissive: 0x92400e, emissiveIntensity: 0.18,
    });

    this.courtBox = {
      minX: -courtW / 2 + 0.5,
      maxX: courtW / 2 - 0.5,
      minY: courtTop - 0.5,
      maxY: courtTop + 14,
      minZ: courtZ - courtD / 2 + 0.5,
      maxZ: courtZ + courtD / 2 - 0.5,
    };

    // Arc center: front edge of court (where player shoots from)
    const frontZ = courtZ + courtD / 2 - 4;
    const lineY = courtTop + 0.05;
    const halfCourtW = courtW / 2 - 0.5;

    // Row Z: straight-ahead centre of each arc
    const row1Z = frontZ - 13;  // 1 PT — close
    const row2Z = frontZ - 22;  // 2 PT — mid
    const row3Z = frontZ - 33;  // 3 PT — far

    // ── Draw 3 arc lines on the court floor ─────────────────────────────────
    this._drawArc(frontZ, 13, lineY, 0x22c55e, halfCourtW);  // green  — 1 PT
    this._drawArc(frontZ, 22, lineY, 0xeab308, halfCourtW);  // yellow — 2 PT
    this._drawArc(frontZ, 33, lineY, 0xf97316, halfCourtW);  // orange — 3 PT

    // ── Zone label plaques on the left wall ─────────────────────────────────
    const wallX = -courtW / 2 + 0.06;
    this._addWallLabel("1 PT", wallX, courtTop + 1.8, row1Z, 0x22c55e, 1);
    this._addWallLabel("2 PT", wallX, courtTop + 1.8, row2Z, 0xeab308, 1);
    this._addWallLabel("3 PT", wallX, courtTop + 1.8, row3Z, 0xf97316, 1);

    // ── Gate sign above court entrance ──────────────────────────────────────
    const gateTex = createSignTexture("MOVING COURT", "#1d4ed8", "#ffffff");
    const gate = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 1.6),
      new THREE.MeshBasicMaterial({ map: gateTex, transparent: true, side: THREE.DoubleSide })
    );
    gate.position.set(0, courtTop + 9, courtZ + courtD / 2 + 2);
    this.group.add(gate);

    // ── Moving hoops (slow slide — easier to time) ───────────────────────────
    // Row 1: 1 PT — close
    this._addMovingHoop(-5,  row1Z, courtTop, courtTop + 3.0, 1, 0x22c55e,  2.8, 0.32, 0.0);
    this._addMovingHoop( 0,  row1Z, courtTop, courtTop + 3.0, 1, 0x22c55e,  2.5, 0.34, 1.3);
    this._addMovingHoop( 5,  row1Z, courtTop, courtTop + 3.0, 1, 0x22c55e,  2.8, 0.30, 2.6);

    // Row 2: 2 PT — mid
    this._addMovingHoop(-6,  row2Z, courtTop, courtTop + 3.8, 2, 0xeab308,  3.2, 0.38, 0.5);
    this._addMovingHoop( 0,  row2Z, courtTop, courtTop + 3.8, 2, 0xeab308,  3.0, 0.40, 1.8);
    this._addMovingHoop( 6,  row2Z, courtTop, courtTop + 3.8, 2, 0xeab308,  3.0, 0.36, 3.1);

    // Row 3: 3 PT — far (still slowest row, but not frantic)
    this._addMovingHoop(-7,  row3Z, courtTop, courtTop + 4.4, 3, 0xf97316,  3.5, 0.44, 0.2);
    this._addMovingHoop( 0,  row3Z, courtTop, courtTop + 4.4, 3, 0xf97316,  3.2, 0.46, 1.5);
    this._addMovingHoop( 7,  row3Z, courtTop, courtTop + 4.4, 3, 0xf97316,  3.2, 0.42, 2.8);

    // ── Entry ring (decorative — no longer a gate) ───────────────────────────
    const throwZ = courtZ + courtD / 2 - 4;
    this.throwZoneCenter = new THREE.Vector3(0, courtTop, throwZ);
    const throwRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.15, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffa500, emissiveIntensity: 0.75 })
    );
    throwRing.rotation.x = Math.PI / 2;
    throwRing.position.set(0, courtTop + 0.03, throwZ);
    this.group.add(throwRing);
    this.throwRing = throwRing;

    // ── Win pad at back of court ──────────────────────────────────────────────
    this._winPad = addPlatform(this.group, this.platforms, 0, courtBaseY, courtZ - 16, 9, 7, PAD_H, 0x555555, {
      emissive: 0x333333, emissiveIntensity: 0.1,
    });

    this.addTipSign(
      ["Step on court to start!", "2 min · 15 pts to win", "Hit rim or board — it counts!"],
      0, courtBaseY, courtZ - courtD / 2 - 4, 1
    );

    this.decor.push({
      update: (time) => {
        if (!this.basketScored && this.bonusRoundActive) {
          throwRing.material.emissiveIntensity = 0.55 + Math.sin(time * 4) * 0.35;
        } else if (!this.basketScored) {
          throwRing.material.emissiveIntensity = 0.4 + Math.sin(time * 2.5) * 0.3;
        }
      },
    });
  }

  // Draw a semicircular arc on the court floor centred at (0, y, frontZ)
  // extending toward negative Z with the given radius.
  _drawArc(frontZ, radius, lineY, color, halfWidth) {
    const segments = 42;
    const halfAngle = Math.asin(Math.min(0.99, halfWidth / radius));
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = -halfAngle + (i / segments) * 2 * halfAngle;
      pts.push(new THREE.Vector3(
        Math.sin(a) * radius,
        lineY,
        frontZ - Math.cos(a) * radius
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const arc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    this.group.add(arc);

    // Straight baseline along the arc ends for clarity
    const leftX = Math.sin(-halfAngle) * radius;
    const rightX = Math.sin(halfAngle) * radius;
    const arcZ = frontZ - Math.cos(halfAngle) * radius;
    const basePts = [
      new THREE.Vector3(leftX,  lineY, arcZ),
      new THREE.Vector3(rightX, lineY, arcZ),
    ];
    const baseGeo = new THREE.BufferGeometry().setFromPoints(basePts);
    const base = new THREE.Line(baseGeo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    this.group.add(base);
  }

  _addWallLabel(text, x, y, z, color, side = 1) {
    const hex = `#${color.toString(16).padStart(6, "0")}`;
    const tex = createSignTexture(text, hex, "#ffffff");
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.7),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.group.add(mesh);
  }

  _addMovingHoop(baseX, hoopZ, courtTop, rimY, points, labelHex, moveRange, moveSpeed, movePhase) {
    const hoopGroup = new THREE.Group();
    hoopGroup.position.x = baseX;
    this.group.add(hoopGroup);

    const poleH = rimY - courtTop + 0.5;

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.17, poleH, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.4 })
    );
    pole.position.set(0, courtTop + poleH / 2, hoopZ);
    hoopGroup.add(pole);

    // Backboard (glass-look)
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.0, 0.07),
      new THREE.MeshStandardMaterial({
        color: 0xe0f2fe, emissive: 0x7dd3fc, emissiveIntensity: 0.08,
        transparent: true, opacity: 0.82,
      })
    );
    board.position.set(0, rimY + 0.1, hoopZ - 0.52);
    hoopGroup.add(board);

    // Red box on backboard
    const square = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.09),
      new THREE.MeshStandardMaterial({
        color: 0xff1111, emissive: 0xff0000, emissiveIntensity: 0.4,
        transparent: true, opacity: 0.65,
      })
    );
    square.position.set(0, rimY + 0.1, hoopZ - 0.475);
    hoopGroup.add(square);

    // Rim (orange torus)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.085, 8, 24),
      makeMaterial(0xff5500, 0xcc4400, 0.55)
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, rimY, hoopZ);
    hoopGroup.add(rim);

    // Point badge above hoop
    const label = `${points} PT${points > 1 ? "S" : ""}`;
    const hex = `#${labelHex.toString(16).padStart(6, "0")}`;
    const badgeTex = createSignTexture(label, hex, "#ffffff");
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.65),
      new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, side: THREE.DoubleSide })
    );
    badge.position.set(0, rimY + 1.25, hoopZ);
    hoopGroup.add(badge);

    const hoop = {
      id: this.hoops.length,
      hoopGroup,
      rim,
      board,
      badge,
      points,
      baseX,
      moveRange,
      moveSpeed,
      movePhase,
      lastScoreTime: -999,
      flashUntil: 0,
      flashStart: 0,
    };
    this.hoops.push(hoop);
    return hoop;
  }

  // ── Bonus round state ────────────────────────────────────────────────────

  isOnCourt(playerPos) {
    if (!this.courtBox || !playerPos) return false;
    const b = this.courtBox;
    return (
      playerPos.x >= b.minX && playerPos.x <= b.maxX &&
      playerPos.y >= b.minY && playerPos.y <= b.maxY &&
      playerPos.z >= b.minZ && playerPos.z <= b.maxZ
    );
  }

  isInThrowZone(playerPos) { return this.isOnCourt(playerPos); }
  isOnBounceCourt(playerPos) { return this.isOnCourt(playerPos); }

  startBonusRound(time) {
    if (this._roundStarted || this.basketScored) return;
    this._roundStarted = true;
    this.bonusRoundActive = true;
    this.bonusRoundEnded = false;
    this.bonusRoundStartTime = time;
    this.bonusRoundScore = 0;
    this.shotCount = 0;
    for (const hoop of this.hoops) {
      hoop.lastScoreTime = -999;
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
    if (this.bonusRoundScore >= this.bonusMinScore) {
      this._onRoundWon(this.getPointsPerMinute(time));
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
    return {
      score: this.bonusRoundScore,
      timeLeft: Math.max(0, this.bonusRoundDuration - (time - this.bonusRoundStartTime)),
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

  _registerPointPopup(pts, time, meta = {}) {
    const extra = this._characterMeta?.() ?? {};
    if (this._funState) {
      registerBasketScore(this, pts, { ...extra, ...meta }, time, this._funState, {});
    } else {
      this.lastPointPopup = { text: `+${pts} PTS!`, time, duration: 1.1 };
      this.bonusRoundScore += pts;
      if (this.bonusRoundActive && this.bonusRoundScore >= this.bonusMinScore) {
        this.endBonusRound(time);
      }
    }
  }

  _onRoundWon(ppm) {
    this.basketScored = true;
    this.lastPointPopup = { text: `STEPH CURRY! ${ppm} pts/min`, time: this._lastTime ?? 0, duration: 3.5 };
    if (this._winPad) {
      const wp = this._winPad;
      this.finishBox = {
        minX: wp.minX, maxX: wp.maxX,
        minY: wp.topY, maxY: wp.topY + 0.25,
        minZ: wp.minZ, maxZ: wp.maxZ,
      };
      wp.mesh.material.color.setHex(0xffd700);
      wp.mesh.material.emissive.setHex(0xffaa00);
      wp.mesh.material.emissiveIntensity = 1.2;
    }
    if (this.throwRing) {
      this.throwRing.material.color.setHex(0x00ff88);
      this.throwRing.material.emissive.setHex(0x00cc44);
      this.throwRing.material.emissiveIntensity = 1.5;
    }
    for (const hoop of this.hoops) {
      hoop.rim.material.color.setHex(0xffd700);
      hoop.rim.material.emissive.setHex(0xffaa00);
      hoop.rim.material.emissiveIntensity = 1.5;
    }
  }

  // ── Shooting ─────────────────────────────────────────────────────────────

  canHoldBall(playerPos) {
    if (this.basketScored || !playerPos) return false;
    if (!this.bonusRoundActive) return false;
    const now = this._lastTime ?? 0;
    if (now - this.lastShotTime < 0.55) return false;
    return true;
  }

  computeShotVelocity(startPos, aimDir) {
    if (!aimDir || aimDir.lengthSq() < 0.0001) return new THREE.Vector3(0, 0, -1);
    return velocityFromAim(aimDir, LEVEL8_SHOT_SPEED);
  }

  fireShot(startPos, velocity) {
    if (this.basketScored) return;
    this.lastShotTime = this._lastTime ?? 0;
    this.shotCount++;
    spawnFlyingBall(this, startPos, velocity);
  }

  // ── Scoring — touch rim or backboard and it goes in ─────────────────────

  _ballTouchesRim(pos, rimWorld) {
    const dx = pos.x - rimWorld.x;
    const dz = pos.z - rimWorld.z;
    const horiz = Math.sqrt(dx * dx + dz * dz);
    const vert = Math.abs(pos.y - rimWorld.y);
    // Generous rim cylinder — grazing the orange ring counts
    const r = this.ballRadius ?? 0.35;
    return horiz < 1.25 + r && vert < 1.1 + r;
  }

  _ballTouchesBackboard(pos, boardWorld) {
    const pad = (this.ballRadius ?? 0.35) + 0.12;
    return (
      Math.abs(pos.x - boardWorld.x) < 0.85 + pad &&
      Math.abs(pos.y - boardWorld.y) < 0.65 + pad &&
      Math.abs(pos.z - boardWorld.z) < 0.35 + pad
    );
  }

  _ballTouchesHoop(ball, hoop) {
    const pos = ball.position;
    const rimWorld = this._rimWorldPos;
    const boardWorld = this._boardWorldPos;
    hoop.rim.getWorldPosition(rimWorld);
    hoop.board.getWorldPosition(boardWorld);

    if (this._ballTouchesRim(pos, rimWorld) || this._ballTouchesBackboard(pos, boardWorld)) {
      return true;
    }

    // Also check one step back for fast balls so touches don't get skipped
    const prev = pos.clone().addScaledVector(ball.velocity, -0.02);
    return (
      this._ballTouchesRim(prev, rimWorld) ||
      this._ballTouchesBackboard(prev, boardWorld)
    );
  }

  tryScoreBall(ball, playerPos) {
    if (!ball.fromShot || ball.scored) return false;
    const now = this._lastTime ?? 0;
    if (now - ball.spawnTime < 0.2) return false;
    if (ball.position.distanceTo(ball.spawnPos) < 2) return false;

    for (const hoop of this.hoops) {
      if (now - hoop.lastScoreTime < HOOP_RESCORE_COOLDOWN) continue;

      const rimWorld = this._rimWorldPos;
      const boardWorld = this._boardWorldPos;
      hoop.rim.getWorldPosition(rimWorld);
      hoop.board.getWorldPosition(boardWorld);
      const pos = ball.position;
      const rimTouch = this._ballTouchesRim(pos, rimWorld);
      const boardTouch = this._ballTouchesBackboard(pos, boardWorld);
      if (!rimTouch && !boardTouch) {
        const dx = pos.x - rimWorld.x;
        const dz = pos.z - rimWorld.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.6) this.lastNearMiss = { time: now, duration: 0.85 };
        continue;
      }

      const trick = ball.fromBounce ? "bounce" : detectTrickType(rimTouch, boardTouch);
      ball.scored = true;
      hoop.lastScoreTime = now;
      this._flashHoop(hoop, now);
      this._registerPointPopup(hoop.points, now, { trick, hoop });
      if (this.onCrowdCheer) this.onCrowdCheer(now);
      if (this.onHoopReact) this.onHoopReact(hoop, now);
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
  }

  // ── Zone / update ─────────────────────────────────────────────────────────

  getZoneAt(z) {
    for (const zone of ZONES_L8) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES_L8[ZONES_L8.length - 1];
  }

  update(time, playerPos = null) {
    const dt = this._lastTime !== undefined ? Math.min(time - this._lastTime, 0.05) : 0.016;
    this._lastTime = time;

    // Slide all hoops along their row
    for (const hoop of this.hoops) {
      hoop.hoopGroup.position.x =
        hoop.baseX + Math.sin(time * hoop.moveSpeed + hoop.movePhase) * hoop.moveRange;
    }

    // Start / tick bonus round
    if (playerPos && !this.basketScored) {
      if (!this.bonusRoundActive && !this.bonusRoundEnded && this.isOnCourt(playerPos)) {
        this.startBonusRound(time);
      }
      if (this.bonusRoundActive && time - this.bonusRoundStartTime >= this.bonusRoundDuration) {
        this.endBonusRound(time);
      }
    }

    // Basketball physics
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

    // Rim flash animation
    for (const hoop of this.hoops) {
      if (hoop.flashUntil && time <= hoop.flashUntil) {
        const frac = (time - hoop.flashStart) / (hoop.flashUntil - hoop.flashStart);
        hoop.rim.material.emissiveIntensity = 6.0 * Math.pow(1 - frac, 1.6) + 0.55;
        hoop.rim.material.color.setHex(frac < 0.4 ? 0x00ff88 : 0xff5500);
        hoop.rim.material.emissive.setHex(frac < 0.4 ? 0x00ff44 : 0xcc4400);
      } else if (hoop.flashUntil && time > hoop.flashUntil && !this.basketScored) {
        hoop.flashUntil = 0;
        hoop.rim.material.color.setHex(0xff5500);
        hoop.rim.material.emissive.setHex(0xcc4400);
        hoop.rim.material.emissiveIntensity = 0.55;
      }
    }

    for (const d of this.decor) {
      if (d.update) d.update(time);
    }
  }
}
