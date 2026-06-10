import * as THREE from "three";

export const SHOT_GRAVITY = 20;
export const AIM_SHOT_SPEED = 24;
export const HOOP_ARC_TIME = 1.1;

export function getShootStart(fromPos) {
  return new THREE.Vector3(fromPos.x, fromPos.y + 1.5, fromPos.z);
}

export function velocityFromAim(aimDir, speed = AIM_SHOT_SPEED) {
  // aimDir already baked with upward tilt from getPlayerShootDirection()
  return aimDir.clone().normalize().multiplyScalar(speed);
}

export function velocityToHoop(startPos, hoopPos, T = HOOP_ARC_TIME, g = SHOT_GRAVITY) {
  const vy = (hoopPos.y - startPos.y + 0.5 * g * T * T) / T;
  return new THREE.Vector3(
    (hoopPos.x - startPos.x) / T,
    vy,
    (hoopPos.z - startPos.z) / T
  );
}

export function simulateTrajectory(start, velocity, options = {}) {
  const g = options.gravity ?? SHOT_GRAVITY;
  const dt = options.step ?? 0.07;
  const maxSteps = options.maxSteps ?? 42;
  const floorY = options.floorY ?? start.y - 18;

  const points = [start.clone()];
  const pos = start.clone();
  const vel = velocity.clone();

  for (let i = 0; i < maxSteps; i++) {
    vel.y -= g * dt;
    pos.addScaledVector(vel, dt);
    points.push(pos.clone());
    if (pos.y < floorY) break;
  }
  return points;
}

export function spawnFlyingBall(level, startPos, velocity, options = {}) {
  const now = level._lastTime ?? 0;
  const skin = level.ballSkin ?? null;
  const radiusMult = skin?.radiusMult ?? 1;
  const radius = (level.ballRadius ?? 0.35) * radiusMult;
  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 14, 12),
    new THREE.MeshStandardMaterial({
      color: skin?.color ?? 0xff6b1a,
      emissive: skin?.emissive ?? 0xff6600,
      emissiveIntensity: 0.75,
      roughness: 0.45,
      depthTest: true,
    })
  );
  ballMesh.position.copy(startPos);
  ballMesh.castShadow = true;
  if (radius > 0.42) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.4, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff9900,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    ballMesh.add(glow);
  }
  level.group.add(ballMesh);
  level.basketballs.push({
    mesh: ballMesh,
    position: startPos.clone(),
    spawnPos: startPos.clone(),
    spawnTime: now,
    velocity: velocity.clone(),
    scored: false,
    fromShot: true,
    fromBounce: options.fromBounce ?? false,
    prevY: startPos.y,
  });
}

const DOT_COUNT = 36;

/** Dot-based arc preview while holding the ball */
export class TrajectoryPreview {
  constructor(parentGroup) {
    this._parent = parentGroup;
    this._dots = [];

    const geom = new THREE.SphereGeometry(1, 8, 8);
    for (let i = 0; i < DOT_COUNT; i++) {
      const frac = i / DOT_COUNT;
      const r = 0.26 - frac * 0.12;
      const opacity = 0.95 - frac * 0.25;

      const dot = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({
          color: 0xffee44,
          emissive: 0xffcc00,
          emissiveIntensity: 1.6,
          transparent: true,
          opacity,
          depthTest: false,
        })
      );
      dot.scale.setScalar(r);
      dot.visible = false;
      dot.renderOrder = 999;
      parentGroup.add(dot);
      this._dots.push(dot);
    }
    this._sharedGeom = geom;
    this._dotScale = 1;
  }

  setDotScale(scale) {
    this._dotScale = scale;
  }

  update(start, velocity, trajectoryOptions = {}) {
    const points = simulateTrajectory(start, velocity, trajectoryOptions);
    const total = points.length;

    for (let di = 0; di < DOT_COUNT; di++) {
      const t = di / (DOT_COUNT - 1);
      const pi = Math.round(t * (total - 1));
      const frac = di / DOT_COUNT;
      const r = (0.26 - frac * 0.12) * this._dotScale;
      this._dots[di].scale.setScalar(r);
      this._dots[di].position.copy(points[pi]);
      this._dots[di].visible = true;
    }
  }

  hide() {
    for (const d of this._dots) d.visible = false;
  }

  dispose() {
    this._sharedGeom.dispose();
    for (const d of this._dots) {
      d.material.dispose();
      d.parent?.remove(d);
    }
    this._dots = [];
  }
}

/** Ball in hands before release */
export class HeldBallVisual {
  constructor(parentGroup) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff8c42,
        emissive: 0xff6600,
        emissiveIntensity: 0.55,
        roughness: 0.5,
      })
    );
    parentGroup.add(this.mesh);
    this.mesh.visible = false;
  }

  showAt(position) {
    this.mesh.position.copy(position);
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
