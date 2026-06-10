import * as THREE from "three";
import {
  RAINBOW,
  zAfterPrev,
  zAfterMover,
  makeMaterial,
  addPlatform,
  createSignTexture,
  createTipTexture,
} from "./levelHelpers.js";

export const ZONES_L3 = [
  {
    name: "Loading Bay",
    sky: 0x0c0a09,
    fog: 0x44403c,
    void: 0x78716c,
    zMin: 8,
    zMax: -10,
    tip: "Level 3 — Cosmic Factory · Watch the moving belts",
  },
  {
    name: "Conveyor Rush",
    sky: 0x1c1917,
    fog: 0xf97316,
    void: 0xea580c,
    zMin: -10,
    zMax: -50,
    tip: "Ride the orange belts · Jump when they line up",
  },
  {
    name: "Pulse Bridge",
    sky: 0x1e1b4b,
    fog: 0xa855f7,
    void: 0x7c3aed,
    zMin: -50,
    zMax: -88,
    tip: "Violet pads flicker — jump only when they glow",
  },
  {
    name: "Stack Tower",
    sky: 0x042f2e,
    fog: 0x14b8a6,
    void: 0x0d9488,
    zMin: -88,
    zMax: -128,
    tip: "Climb the teal tower · Use lifts going up and down",
  },
  {
    name: "Orbit Ring",
    sky: 0x0f172a,
    fog: 0x38bdf8,
    void: 0x0284c7,
    zMin: -128,
    zMax: -168,
    tip: "Follow the ring of platforms around the void",
  },
  {
    name: "Launch Pad",
    sky: 0x450a0a,
    fog: 0xef4444,
    void: 0xdc2626,
    zMin: -168,
    zMax: -220,
    tip: "Stand on the rocket pad to finish the whole game!",
  },
];

const NEON = [0xf97316, 0xfacc15, 0x4ade80, 0x22d3ee, 0xa78bfa, 0xf472b6];

export class Level3 {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.platforms = [];
    this.movingPlatforms = [];
    this.hazards = [];
    this.checkpoints = [];
    this.blinkPlatforms = [];
    this.finishBox = null;
    this.decor = [];
    this.checkpointCount = 5;

    this.build();
  }

  dispose() {
    this.scene.remove(this.group);
    this.platforms = [];
    this.movingPlatforms = [];
    this.hazards = [];
    this.checkpoints = [];
    this.blinkPlatforms = [];
    this.decor = [];
  }

  build() {
    this.buildLoadingBay();
    this.buildConveyorRush();
    this.buildPulseBridge();
    this.buildStackTower();
    this.buildOrbitRing();
    this.buildLaunchPad();
  }

  addZonePad(zone, centerZ, length) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(42, length),
      makeMaterial(zone.void, zone.void, 0.28, { transparent: true, opacity: 0.5 })
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
    const tex = createTipTexture(lines, "#292524");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x + side * 5.5, y + 2.4, z);
    sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(sign);
  }

  addBlinkPlatform(g, x, y, z, w, d, h, color, phase) {
    const p = addPlatform(g, this.platforms, x, y, z, w, d, h, color, {
      emissive: color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.95,
      blinkPhase: phase,
    });
    p.solid = true;
    this.blinkPlatforms.push(p);
    return p;
  }

  addVerticalMover(g, x, baseY, z, w, d, h, color, options = {}) {
    const amp = options.amplitude ?? 3;
    const speed = options.speed ?? 0.8;
    const phase = options.phase ?? 0;
    const p = addPlatform(g, this.platforms, x, baseY, z, w, d, h, color, {
      emissive: options.emissive ?? color,
      emissiveIntensity: options.emissiveIntensity ?? 0.4,
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

  addBeltMover(g, x, baseY, z, w, d, h, color, travel, speed, phase = 0) {
    const p = addPlatform(g, this.platforms, x, baseY, z, w, d, h, color, {
      emissive: color,
      emissiveIntensity: 0.45,
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
      p.velocity.y = 0;
    };
    this.movingPlatforms.push(p);
    return p;
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

  buildLoadingBay() {
    const zone = ZONES_L3[0];
    const g = this.group;
    this.addZonePad(zone, 0, 14);
    this.addZoneGate(zone, 0, 0, -4);

    addPlatform(g, this.platforms, 0, 0, 0, 10, 10, 1.2, 0x57534e, {
      emissive: 0x44403c,
      emissiveIntensity: 0.2,
    });

    for (let i = 0; i < 6; i++) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        makeMaterial(NEON[i % NEON.length], NEON[i % NEON.length], 0.2)
      );
      crate.position.set(-5 + i * 2, 0.6, -3 + (i % 2));
      g.add(crate);
    }

    this.addTipSign(
      ["Welcome to the Cosmic Factory", "Orange belts move forward and back", "Time your jumps"],
      0, 0, -2, -1
    );
  }

  buildConveyorRush() {
    const zone = ZONES_L3[1];
    const g = this.group;
    const padD = 4.5;
    const padH = 1.2;
    let z = zAfterPrev(0, 10, padD);
    this.addZonePad(zone, z - 22, 42);
    this.addZoneGate(zone, 0, 1, z + 5);

    addPlatform(g, this.platforms, 0, 1, z, padD, padD, padH, 0x78716c, {
      emissive: 0x57534e,
      emissiveIntensity: 0.15,
    });

    const belt1Z = zAfterMover(z, padD, padD, 3.5);
    this.addBeltMover(g, 0, 1, belt1Z, padD, padD, padH, 0xf97316, 3.5, 1.0, 0);

    const midZ = zAfterMover(belt1Z, padD, padD, 3.5);
    addPlatform(g, this.platforms, 0, 1.2, midZ, padD, padD, padH, 0x57534e, {
      emissive: 0x44403c,
      emissiveIntensity: 0.15,
    });

    const belt2Z = zAfterMover(midZ, padD, padD, 4);
    this.addBeltMover(g, -2, 1.2, belt2Z, padD, padD, padH, 0xfb923c, 4, 0.85, 1.5);

    const belt3Z = zAfterMover(belt2Z, padD, padD, 4);
    this.addBeltMover(g, 2, 1.2, belt3Z, padD, padD, padH, 0xea580c, 3.5, 1.1, 3);

    const cpZ = zAfterMover(belt3Z, padD, padD, 3.5);
    this.addCheckpoint(1, 0, 2, cpZ, 0xf97316);
    addPlatform(g, this.platforms, 0, 2, cpZ, padD, padD, padH, 0xf97316, {
      emissive: 0xea580c,
      emissiveIntensity: 0.2,
    });
    this._pulseEntryZ = cpZ;

    this.addTipSign(
      ["Wait for the belt to come close", "Jump on · ride it · leap to the next"],
      0, 1, belt1Z, 1
    );
  }

  buildPulseBridge() {
    const zone = ZONES_L3[2];
    const g = this.group;
    const padD = 4.5;
    const padH = 1.2;
    let z = zAfterPrev(this._pulseEntryZ, padD, padD);
    this.addZonePad(zone, z - 20, 40);
    this.addZoneGate(zone, 0, 2, z + 5);

    addPlatform(g, this.platforms, 0, 2, z, padD, padD, padH, 0x6366f1, {
      emissive: 0x4f46e5,
      emissiveIntensity: 0.2,
    });

    for (let i = 0; i < 7; i++) {
      z = i === 0 ? zAfterPrev(z, padD, padD) : zAfterPrev(z, padD, padD);
      this.addBlinkPlatform(g, 0, 2.2, z, padD, padD, padH, NEON[i % NEON.length], i * 1.1);
    }

    const cpZ = zAfterPrev(z, padD, padD);
    this.addCheckpoint(2, 0, 3, cpZ, 0xa855f7);
    addPlatform(g, this.platforms, 0, 3, cpZ, padD, padD, padH, 0x7c3aed, {
      emissive: 0x6d28d9,
      emissiveIntensity: 0.25,
    });
    this._towerEntryZ = cpZ;

    this.addTipSign(
      ["Pads blink on and off", "Only jump when bright purple", "Patience wins here"],
      0, 2, zAfterPrev(this._pulseEntryZ, padD, padD), -1
    );
  }

  buildStackTower() {
    const zone = ZONES_L3[3];
    const g = this.group;
    const padD = 4.5;
    const padH = 1.2;
    let z = zAfterPrev(this._towerEntryZ, padD, padD);
    this.addZonePad(zone, z - 22, 42);
    this.addZoneGate(zone, 0, 3, z + 5);

    addPlatform(g, this.platforms, 0, 3, z, padD, padD, padH, 0x0d9488, {
      emissive: 0x0f766e,
      emissiveIntensity: 0.2,
    });

    const lift1Z = zAfterPrev(z, padD, padD);
    this.addVerticalMover(g, 0, 4, lift1Z, padD, padD, padH, 0x2dd4bf, {
      amplitude: 3,
      speed: 0.75,
      phase: 0,
    });

    const z2 = zAfterPrev(lift1Z, padD, padD);
    addPlatform(g, this.platforms, 0, 5, z2, padD, padD, padH, 0x14b8a6, {
      emissive: 0x0d9488,
      emissiveIntensity: 0.22,
    });

    const lift2Z = zAfterPrev(z2, padD, padD);
    this.addVerticalMover(g, 0, 5.5, lift2Z, padD, padD, padH, 0x22d3ee, {
      amplitude: 4,
      speed: 0.95,
      phase: 2,
    });

    const z3 = zAfterPrev(lift2Z, padD, padD);
    addPlatform(g, this.platforms, 0, 7, z3, padD, padD, padH, 0x06b6d4, {
      emissive: 0x0891b2,
      emissiveIntensity: 0.2,
    });

    const bounceZ = zAfterPrev(z3, padD, padD);
    addPlatform(g, this.platforms, 0, 7, bounceZ, padD, padD, padH, 0x4ade80, {
      emissive: 0x22c55e,
      emissiveIntensity: 0.5,
      bounceForce: 14,
    });

    const cpZ = zAfterPrev(bounceZ, padD, padD);
    this.addCheckpoint(3, 0, 8.5, cpZ, 0x2dd4bf);
    addPlatform(g, this.platforms, 0, 8.5, cpZ, padD, padD, padH, 0x14b8a6, {
      emissive: 0x0d9488,
      emissiveIntensity: 0.2,
    });
    this._orbitEntryZ = cpZ;

    this.addTipSign(
      ["Teal lifts go up AND down", "Green pad launches you high", "Double jump to the next island"],
      0, 4, lift1Z, 1
    );
  }

  buildOrbitRing() {
    const zone = ZONES_L3[4];
    const g = this.group;
    const padD = 4;
    const padH = 1.2;
    let z = zAfterPrev(this._orbitEntryZ, padD, padD);
    this.addZonePad(zone, z - 22, 42);
    this.addZoneGate(zone, 0, 8.5, z + 5);

    addPlatform(g, this.platforms, 0, 8.5, z, padD, padD, padH, 0x0284c7, {
      emissive: 0x0369a1,
      emissiveIntensity: 0.2,
    });

    const ringCount = 8;
    let lastZ = z;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 1.2 - Math.PI * 0.1;
      const x = Math.sin(angle) * 5;
      const y = 8.5 + Math.sin(angle * 0.5) * 0.8;
      const pz = i === 0 ? zAfterPrev(z, padD, padD) : zAfterPrev(lastZ, padD, padD);
      lastZ = pz;
      const color = RAINBOW[i % RAINBOW.length];
      addPlatform(g, this.platforms, x, y, pz, padD, padD, padH, color, {
        emissive: color,
        emissiveIntensity: 0.35,
      });
    }

    addPlatform(g, this.platforms, 0, 9, zAfterPrev(lastZ, padD, padD), padD, padD, padH, 0x38bdf8, {
      emissive: 0x2563eb,
      emissiveIntensity: 0.25,
    });

    const cpZ = zAfterPrev(lastZ, padD, padD);
    this.addCheckpoint(4, 0, 9.5, cpZ, 0x38bdf8);
    addPlatform(g, this.platforms, 0, 9.5, cpZ, padD, padD, padH, 0x0ea5e9, {
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
    });
    this._launchEntryZ = cpZ;

    const ringVis = new THREE.Mesh(
      new THREE.TorusGeometry(5.5, 0.08, 8, 48),
      makeMaterial(0x38bdf8, 0x22d3ee, 0.4, { transparent: true, opacity: 0.5 })
    );
    ringVis.rotation.x = Math.PI / 2;
    ringVis.position.set(0, 9, z - 18);
    g.add(ringVis);
    this.decor.push({
      mesh: ringVis,
      update: (time) => {
        ringVis.rotation.z = time * 0.4;
      },
    });

    this.addTipSign(
      ["Follow the curved ring of pads", "Cut the corners with double jump", "Stay over the blue void"],
      0, 8.5, z, -1
    );
  }

  buildLaunchPad() {
    const zone = ZONES_L3[5];
    const g = this.group;
    const padD = 5;
    const padH = 1.2;
    let z = zAfterPrev(this._launchEntryZ, padD, padD);
    this.addZonePad(zone, z - 20, 38);
    this.addZoneGate(zone, 0, 9.5, z + 5);

    addPlatform(g, this.platforms, 0, 9.5, z, padD, padD, padH, 0x57534e, {
      emissive: 0x44403c,
      emissiveIntensity: 0.15,
    });

    const z2 = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, 10.5, z2, padD, padD, padH, 0xdc2626, {
      emissive: 0xb91c1c,
      emissiveIntensity: 0.25,
    });

    const rocketD = 9;
    const rocketZ = zAfterPrev(z2, padD, rocketD);
    addPlatform(g, this.platforms, 0, 12, rocketZ, rocketD, rocketD, 1.5, 0xef4444, {
      emissive: 0xdc2626,
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

    const rocket = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.6, 5, 12),
      makeMaterial(0xf87171, 0xef4444, 0.4)
    );
    body.position.y = 2.5;
    rocket.add(body);
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 2, 12),
      makeMaterial(0xfbbf24, 0xf59e0b, 0.5)
    );
    nose.position.y = 6;
    rocket.add(nose);
    const fin1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2, 1.5),
      makeMaterial(0xdc2626, 0xb91c1c, 0.3)
    );
    fin1.position.set(1.4, 1, 0);
    rocket.add(fin1);
    const fin2 = fin1.clone();
    fin2.position.x = -1.4;
    rocket.add(fin2);
    rocket.position.set(0, 13.5, rocketZ);
    g.add(rocket);
    this.decor.push({
      mesh: rocket,
      update: (time) => {
        rocket.position.y = 13.5 + Math.sin(time * 1.5) * 0.15;
        const flame = Math.sin(time * 12) * 0.5 + 0.5;
        body.material.emissiveIntensity = 0.3 + flame * 0.25;
      },
    });

    for (let i = 0; i < 8; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 6, 6),
        makeMaterial(0xf97316, 0xef4444, 0.7, { transparent: true, opacity: 0.7 })
      );
      puff.position.set((i % 2 === 0 ? -1 : 1) * 1.5, 12, rocketZ - 2 - i * 0.4);
      g.add(puff);
      this.decor.push({
        mesh: puff,
        update: (time) => {
          puff.position.y = 12 + Math.sin(time * 8 + i) * 0.5;
          puff.scale.setScalar(0.8 + Math.sin(time * 10 + i) * 0.3);
        },
      });
    }

    this.addTipSign(
      ["Final stop — the rocket pad", "Stand on the red platform to win", "Level 4 — Danger Fort awaits!"],
      0, 9.5, z, 1
    );
  }

  getZoneAt(z) {
    for (const zone of ZONES_L3) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES_L3[ZONES_L3.length - 1];
  }

  update(time) {
    for (const mp of this.movingPlatforms) {
      if (mp.update) mp.update(time);
    }

    for (const p of this.blinkPlatforms) {
      const on = Math.sin(time * 2.5 + p.blinkPhase) > 0.05;
      p.solid = on;
      p.mesh.visible = on;
      p.mesh.material.transparent = true;
      p.mesh.material.opacity = on ? 0.95 : 0.12;
      p.mesh.material.emissiveIntensity = on ? 0.45 : 0.05;
    }

    for (const d of this.decor) {
      if (d.spin) d.mesh.rotation.y = time * 1.5;
      if (d.update) d.update(time);
    }
  }
}
