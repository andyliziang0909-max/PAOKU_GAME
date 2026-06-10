import * as THREE from "three";

export class GameJuice {
  constructor(camera) {
    this.camera = camera;
    this.baseFov = camera.fov;
    this.punchUntil = 0;
    this.punchStrength = 0;
    this.slowMoUntil = 0;
    this.slowMoScale = 0.28;
    this.shakeUntil = 0;
    this.shakeStrength = 0;
    this.celebrateUntil = 0;
  }

  punch(time, strength = 4) {
    this.punchUntil = time + 0.35;
    this.punchStrength = strength;
  }

  shake(time, strength = 0.15) {
    this.shakeUntil = time + 0.4;
    this.shakeStrength = strength;
  }

  failClip(time) {
    this.slowMoUntil = time + 0.85;
    this.shake(time, 0.22);
  }

  celebrate(time) {
    this.celebrateUntil = time + 0.6;
    this.punch(time, 5);
  }

  /** Returns dt multiplier for slow-mo */
  getDtScale(time) {
    return time < this.slowMoUntil ? this.slowMoScale : 1;
  }

  update(time) {
    if (time < this.punchUntil) {
      const t = (this.punchUntil - time) / 0.35;
      this.camera.fov = this.baseFov - this.punchStrength * t;
    } else {
      this.camera.fov = this.baseFov;
    }
    this.camera.updateProjectionMatrix();

    if (time < this.shakeUntil) {
      const s = this.shakeStrength * ((this.shakeUntil - time) / 0.4);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.5;
    }
  }
}

/** Simple crowd blocks that jump on scores */
export class Crowd {
  constructor(parentGroup, x, y, z, count = 12, spread = 10) {
    this.parent = parentGroup;
    this.fans = [];
    const colors = [0xf472b6, 0x38bdf8, 0xfacc15, 0x4ade80, 0xa78bfa];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.5, 0.35),
        new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          emissive: colors[i % colors.length],
          emissiveIntensity: 0.35,
        })
      );
      mesh.position.set(
        x + (i - count / 2) * (spread / count) * 1.2,
        y + 0.25,
        z + (Math.random() - 0.5) * 1.5
      );
      parentGroup.add(mesh);
      this.fans.push({ mesh, baseY: mesh.position.y, phase: Math.random() * Math.PI * 2 });
    }
  }

  cheer(time) {
    for (const f of this.fans) {
      f.cheerUntil = time + 0.5;
      f.phase = time;
    }
  }

  update(time) {
    for (const f of this.fans) {
      const bounce = f.cheerUntil && time < f.cheerUntil
        ? Math.sin((time - f.phase) * 22) * 0.35
        : Math.sin(time * 2 + f.phase) * 0.03;
      f.mesh.position.y = f.baseY + bounce;
    }
  }

  dispose() {
    for (const f of this.fans) {
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
      f.mesh.parent?.remove(f.mesh);
    }
    this.fans = [];
  }
}

/** Ghost runner — faint replay path */
export class GhostRunner {
  constructor(parentGroup, path, color = 0x7dd3fc) {
    this.mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.0, 4, 8),
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        emissive: color,
        emissiveIntensity: 0.5,
      })
    );
    parentGroup.add(this.mesh);
    this.path = path;
    this.t = 0;
    this.speed = 0.12;
  }

  update(dt) {
    this.t = (this.t + dt * this.speed) % 1;
    const idx = Math.floor(this.t * (this.path.length - 1));
    const p = this.path[idx];
    this.mesh.position.copy(p);
    if (idx < this.path.length - 1) {
      const next = this.path[idx + 1];
      this.mesh.rotation.y = Math.atan2(next.x - p.x, next.z - p.z);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
