import * as THREE from "three";
import { buildPlayerAppearance, disposeCharacterRoot } from "./characters.js";
import { getCharacterBonus } from "./characterBonuses.js";
import { PlayerAnimator } from "./PlayerAnimator.js";

export class Player {
  constructor(scene) {
    this.radius = 0.4;
    this.height = 1.6;
    this.halfHeight = this.height / 2;

    this.mesh = new THREE.Group();
    this.appearanceGroup = new THREE.Group();
    this.mesh.add(this.appearanceGroup);
    scene.add(this.mesh);

    this.characterId = null;
    this.animator = null;

    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.platformVelocity = new THREE.Vector3();
    this.standingPlatform = null;

    this.baseWalkSpeed = 7.5;
    this.baseJumpForce = 10.5;
    this.baseDoubleJumpForce = 9;
    this.baseDashSpeed = 28;
    this.baseDashCooldown = 1.2;
    this.walkSpeed = this.baseWalkSpeed;
    this.jumpForce = this.baseJumpForce;
    this.doubleJumpForce = this.baseDoubleJumpForce;
    this.maxJumps = 2;
    this.jumpsLeft = this.maxJumps;
    this.gravity = 20;

    // Dash
    this.dashSpeed = this.baseDashSpeed;
    this.dashDuration = 0.18;
    this.dashCooldown = this.baseDashCooldown;
    this.dashTime = -999;       // time when dash started
    this.lastDashEnd = -999;    // time when last dash ended
    this.isDashing = false;

    this.spawnPoint = new THREE.Vector3(0, 1, 0);
    this.checkpointIndex = 0;
    this.yaw = 0; // camera orbit (mouse)
    this.facingYaw = 0; // model faces movement, not camera
    this.pitch = -0.25;

    this.reset();
  }

  clearAppearance() {
    if (this.animator) {
      this.animator.dispose();
      this.animator = null;
    }
    while (this.appearanceGroup.children.length) {
      const child = this.appearanceGroup.children[0];
      this.appearanceGroup.remove(child);
      disposeCharacterRoot(child);
    }
  }

  async setCharacter(character) {
    if (!character) return;
    if (this.characterId === character.id && this.appearanceGroup.children.length > 0) return;
    this.characterId = character.id;
    this.clearAppearance();
    const { mixer, clips, root, animated, baseRotation } = await buildPlayerAppearance(
      this.appearanceGroup, character, this.radius, this.halfHeight
    );
    this.animator = new PlayerAnimator(mixer, clips, root, { animated, baseRotation });
    this.applyCharacterBonuses(character.id);
  }

  applyCharacterBonuses(characterId) {
    this.walkSpeed = this.baseWalkSpeed;
    this.jumpForce = this.baseJumpForce;
    this.doubleJumpForce = this.baseDoubleJumpForce;
    this.dashSpeed = this.baseDashSpeed;
    this.dashCooldown = this.baseDashCooldown;
    this.characterBonus = getCharacterBonus(characterId);

    const b = this.characterBonus;
    if (!b) return;
    if (b.walkMult) this.walkSpeed *= b.walkMult;
    if (b.jumpMult) {
      this.jumpForce *= b.jumpMult;
      this.doubleJumpForce *= b.jumpMult;
    }
    if (b.dashSpeedMult) this.dashSpeed *= b.dashSpeedMult;
    if (b.dashCooldownMult) this.dashCooldown *= b.dashCooldownMult;
  }

  reset() {
    this.mesh.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.platformVelocity.set(0, 0, 0);
    this.grounded = false;
    this.standingPlatform = null;
    this.jumpsLeft = this.maxJumps;
    this.isDashing = false;
    this.lastDashEnd = -999;
  }

  respawn(platforms) {
    this.mesh.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.platformVelocity.set(0, 0, 0);
    this.grounded = false;
    this.standingPlatform = null;
    this.jumpsLeft = this.maxJumps;
    if (platforms) this.snapToPlatforms(platforms);
  }

  setCheckpoint(index, position) {
    this.checkpointIndex = index;
    this.spawnPoint.copy(position);
  }

  doJump(force, input) {
    if (this.jumpsLeft <= 0) return;

    this.velocity.y = force;
    if (this.grounded) {
      this.velocity.x += this.platformVelocity.x;
      this.velocity.z += this.platformVelocity.z;
    }
    this.jumpsLeft--;
    this.grounded = false;
    this.standingPlatform = null;
  }

  update(dt, input, level) {
    // ── Dash logic ───────────────────────────────────────────────────
    const now = level._clock ?? (level._clock = 0);
    // We track elapsed ourselves since we don't have a clock ref here.
    this._elapsed = (this._elapsed ?? 0) + dt;
    const t = this._elapsed;

    // Trigger dash on Shift press (not held), grounded or air, with cooldown.
    if (input.dashPressed) {
      const cooldownDone = t - this.lastDashEnd >= this.dashCooldown;
      if (!this.isDashing && cooldownDone) {
        this.isDashing = true;
        this.dashTime = t;
        // Dash in current facing direction
        const dx = -Math.sin(this.facingYaw);
        const dz = -Math.cos(this.facingYaw);
        this.velocity.x = dx * this.dashSpeed;
        this.velocity.z = dz * this.dashSpeed;
        if (this.grounded) this.velocity.y = 2.5; // tiny hop for feel
      }
    }

    if (this.isDashing) {
      const dashAge = t - this.dashTime;
      if (dashAge >= this.dashDuration) {
        this.isDashing = false;
        this.lastDashEnd = t;
        // Bleed off dash speed quickly
        this.velocity.x *= 0.25;
        this.velocity.z *= 0.25;
      }
    }

    // ── Normal movement (suppressed during dash) ──────────────────────
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();

    if (input.forward) move.add(forward);
    if (input.backward) move.sub(forward);
    if (input.left) move.sub(right);
    if (input.right) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(this.walkSpeed);
      this.facingYaw = Math.atan2(-move.x, -move.z);
    }

    if (!this.isDashing) {
      if (this.grounded) {
        this.velocity.x = move.x;
        this.velocity.z = move.z;
      } else if (move.lengthSq() > 0) {
        const airControl = 1 - Math.exp(-6 * dt);
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, move.x, airControl);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, move.z, airControl);
      }
    }

    // Tornado knockback (one-shot impulse when entering range)
    if (level.tornadoImpulse && level.tornadoImpulse.lengthSq() > 0.01) {
      const resist = this.characterBonus?.knockbackResist ?? 0;
      this.velocity.add(level.tornadoImpulse.clone().multiplyScalar(1 - resist));
      this.grounded = false; // launch into air
    }

    let jumpedThisFrame = false;
    if (input.jumpPressed && this.jumpsLeft > 0) {
      const canJump = this.jumpsLeft < this.maxJumps || this.grounded;
      if (canJump) {
        const force = this.jumpsLeft === this.maxJumps ? this.jumpForce : this.doubleJumpForce;
        this.doJump(force, input);
        jumpedThisFrame = true;
      }
    }

    const substeps = Math.max(1, Math.ceil(dt / 0.008));
    const subDt = dt / substeps;

    for (let i = 0; i < substeps; i++) {
      if (!this.grounded) {
        this.velocity.y -= this.gravity * subDt;
      }

      this.mesh.position.x += this.velocity.x * subDt;
      this.mesh.position.y += this.velocity.y * subDt;
      this.mesh.position.z += this.velocity.z * subDt;

      this.grounded = false;
      this.platformVelocity.set(0, 0, 0);
      this.standingPlatform = null;

      const skipLand = jumpedThisFrame && i === 0;
      this.resolvePlatforms(level.platforms, subDt, skipLand);

      if (this.grounded && this.standingPlatform) {
        this.mesh.position.addScaledVector(this.platformVelocity, subDt);
        if (this.standingPlatform.topY !== undefined) {
          this.mesh.position.y = this.standingPlatform.topY;
        }
        this.clampToPlatform(this.standingPlatform);
        this.verifyStillOnPlatform(this.standingPlatform);
      }
    }

    for (const hazard of level.hazards) {
      if (this.intersectsHazard(hazard)) {
        this.respawn(level.platforms);
        return "fall";
      }
    }

    if (level.projectiles) {
      for (const proj of level.projectiles) {
        if (this.intersectsProjectile(proj)) {
          this.respawn(level.platforms);
          return "fall";
        }
      }
    }

    if (this.mesh.position.y < -25) {
      this.respawn(level.platforms);
      return "fall";
    }

    for (const checkpoint of level.checkpoints) {
      if (!checkpoint.active && this.intersectsBox(checkpoint.box)) {
        checkpoint.active = true;
        checkpoint.mesh.material.emissiveIntensity = 0.85;
        if (checkpoint.ring) checkpoint.ring.material.emissiveIntensity = 0.9;
        this.setCheckpoint(checkpoint.index, checkpoint.respawn);
        return "checkpoint";
      }
    }

    if (level.finishBox && this.intersectsBox(level.finishBox)) {
      if (level.requiresGroundedWin && !this.grounded) return null;
      return "win";
    }

    this.appearanceGroup.rotation.y = this.facingYaw;

    if (this.animator) {
      const isMoving = this.isDashing || !!(input.forward || input.backward || input.left || input.right);
      this.animator.update(dt, {
        isMoving,
        isSprinting: this.isDashing,
        isGrounded: this.grounded,
        isJumping: this.velocity.y > 0.5,
      });
    }

    return null;
  }

  resolvePlatforms(platforms, dt, skipLand = false) {
    if (skipLand) return;

    const pos = this.mesh.position;
    const prevFeet = pos.y - this.velocity.y * dt;
    const feet = pos.y;
    const margin = 0.35;

    if (this.velocity.y > 0.05) return;

    let bestPlatform = null;
    let bestTop = -Infinity;

    for (const platform of platforms) {
      if (platform.solid === false) continue;
      const top = platform.topY;
      if (!this.isOverPlatform(platform, margin)) continue;

      const onSurface = Math.abs(feet - top) <= margin;
      const crossedSurface = prevFeet >= top - margin && feet <= top + margin;
      const tunneled = prevFeet > top && feet < top - margin;

      if ((onSurface || crossedSurface || tunneled) && top > bestTop) {
        bestPlatform = platform;
        bestTop = top;
      }
    }

    if (!bestPlatform) return;

    pos.y = bestTop;
    this.standingPlatform = bestPlatform;
    this.clampToPlatform(bestPlatform);

    if (bestPlatform.bounceForce && this.velocity.y <= 0.1) {
      const bounceMult = this.characterBonus?.bounceMult ?? 1;
      this.velocity.y = bestPlatform.bounceForce * bounceMult;
      this.grounded = false;
      this.jumpsLeft = this.maxJumps;
    } else {
      this.velocity.y = 0;
      this.grounded = true;
      this.jumpsLeft = this.maxJumps;
    }

    if (bestPlatform.velocity) {
      this.platformVelocity.copy(bestPlatform.velocity);
    }
  }

  isOverPlatform(platform, extra = 0) {
    const pos = this.mesh.position;
    return (
      pos.x >= platform.minX - extra &&
      pos.x <= platform.maxX + extra &&
      pos.z >= platform.minZ - extra &&
      pos.z <= platform.maxZ + extra
    );
  }

  clampToPlatform(platform) {
    if (!platform) return;

    const pos = this.mesh.position;
    const inset = this.radius + 0.05;
    const width = platform.maxX - platform.minX;
    const depth = platform.maxZ - platform.minZ;

    if (width <= inset * 2) {
      pos.x = (platform.minX + platform.maxX) / 2;
    } else {
      pos.x = THREE.MathUtils.clamp(pos.x, platform.minX + inset, platform.maxX - inset);
    }

    if (depth <= inset * 2) {
      pos.z = (platform.minZ + platform.maxZ) / 2;
    } else {
      pos.z = THREE.MathUtils.clamp(pos.z, platform.minZ + inset, platform.maxZ - inset);
    }

    pos.y = platform.topY;
  }

  verifyStillOnPlatform(platform) {
    if (!platform || platform.solid === false) {
      this.grounded = false;
      this.standingPlatform = null;
      return;
    }

    const pos = this.mesh.position;
    const inset = this.radius + 0.02;
    const width = platform.maxX - platform.minX;
    const depth = platform.maxZ - platform.minZ;
    const supportedX =
      width <= inset * 2 ||
      (pos.x >= platform.minX + inset && pos.x <= platform.maxX - inset);
    const supportedZ =
      depth <= inset * 2 ||
      (pos.z >= platform.minZ + inset && pos.z <= platform.maxZ - inset);
    const supportedY = Math.abs(pos.y - platform.topY) <= 0.35;

    if (!supportedX || !supportedZ || !supportedY) {
      this.grounded = false;
      this.standingPlatform = null;
    }
  }

  snapToPlatforms(platforms) {
    const pos = this.mesh.position;
    let best = null;
    let bestTop = -Infinity;

    for (const platform of platforms) {
      if (platform.solid === false) continue;
      if (this.isOverPlatform(platform, this.radius) && platform.topY <= pos.y + 1 && platform.topY > bestTop) {
        best = platform;
        bestTop = platform.topY;
      }
    }

    if (best) {
      pos.y = best.topY;
      this.clampToPlatform(best);
      this.grounded = true;
      this.standingPlatform = best;
      this.jumpsLeft = this.maxJumps;
    }
  }

  intersectsHazard(hazard) {
    if (hazard.spinner) return this.intersectsSpinner(hazard.spinner);
    if (hazard.box) {
      // Lightning and other conditional hazards can be toggled off
      if (typeof hazard.active === "boolean" && !hazard.active) return false;
      return this.intersectsBox(hazard.box);
    }
    return false;
  }

  intersectsProjectile(proj) {
    const pos = this.mesh.position;
    const c = proj.center;
    const pr = (proj.radius ?? 0.4) * 0.85;
    const feet = pos.y;
    const head = feet + this.height;

    if (c.y + pr < feet || c.y - pr > head) return false;

    const closestY = THREE.MathUtils.clamp(c.y, feet, head);
    const dy = c.y - closestY;
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const hitR = this.radius + pr;
    return dx * dx + dy * dy + dz * dz < hitR * hitR;
  }

  intersectsSpinner(spinner) {
    const { x, y, z, half, thickness, angle } = spinner;
    const barTop = y + thickness / 2;
    const barBottom = y - thickness / 2;
    const feet = this.mesh.position.y;
    const head = feet + this.height;

    if (feet > barTop + 0.25) return false;
    if (head < barBottom || feet > barTop) return false;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ax = x - half * cos;
    const az = z - half * sin;
    const bx = x + half * cos;
    const bz = z + half * sin;

    const dist = this.distPointToSegmentXZ(
      this.mesh.position.x,
      this.mesh.position.z,
      ax,
      az,
      bx,
      bz
    );
    return dist < this.radius + thickness * 0.35;
  }

  distPointToSegmentXZ(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  }

  intersectsBox(box) {
    const pos = this.mesh.position;
    return (
      pos.x >= box.minX - this.radius &&
      pos.x <= box.maxX + this.radius &&
      pos.y >= box.minY &&
      pos.y <= box.maxY + this.height &&
      pos.z >= box.minZ - this.radius &&
      pos.z <= box.maxZ + this.radius
    );
  }
}
