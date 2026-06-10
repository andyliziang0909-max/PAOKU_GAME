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

export const ZONES_L2 = [
  {
    name: "Starfall Deck",
    sky: 0x1e1b4b,
    fog: 0x4c1d95,
    void: 0x7c3aed,
    zMin: 8,
    zMax: -8,
    tip: "Level 2 — Dream Sky · Double jump is your best friend",
  },
  {
    name: "Bounce Gardens",
    sky: 0x134e4a,
    fog: 0x2dd4bf,
    void: 0x14b8a6,
    zMin: -8,
    zMax: -45,
    tip: "Land on glowing green pads — they launch you up!",
  },
  {
    name: "Ghost Steps",
    sky: 0x312e81,
    fog: 0x818cf8,
    void: 0x6366f1,
    zMin: -45,
    zMax: -80,
    tip: "Purple pads blink on and off — jump when they glow",
  },
  {
    name: "Sky Elevators",
    sky: 0x0f172a,
    fog: 0x6366f1,
    void: 0x4338ca,
    zMin: -80,
    zMax: -118,
    tip: "Ride the cyan lifts — they go up AND down · Time your jumps",
  },
  {
    name: "Spiral Ascent",
    sky: 0x831843,
    fog: 0xf472b6,
    void: 0xdb2777,
    zMin: -118,
    zMax: -158,
    tip: "Follow the spiral of crystal platforms upward",
  },
  {
    name: "Comet Express",
    sky: 0x0c4a6e,
    fog: 0x38bdf8,
    void: 0x0284c7,
    zMin: -158,
    zMax: -198,
    tip: "Ride the comet platform — then leap to the next island",
  },
  {
    name: "Nebula Crown",
    sky: 0xfef08a,
    fog: 0xfbbf24,
    void: 0xf59e0b,
    zMin: -198,
    zMax: -250,
    tip: "Reach the floating crown platform to win Level 2!",
  },
];

const CRYSTAL = [0xc084fc, 0xa78bfa, 0x818cf8, 0x38bdf8, 0x2dd4bf, 0xf472b6, 0xfbbf24];

export class Level2 {
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
    this.buildStarfall();
    this.buildBounceGardens();
    this.buildGhostSteps();
    this.buildSkyElevators();
    this.buildSpiralAscent();
    this.buildCometExpress();
    this.buildNebulaCrown();
  }

  addZonePad(zone, centerZ, length) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(40, length),
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
    const tex = createTipTexture(lines, "#312e81");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x + side * 5.5, y + 2.4, z);
    sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(sign);
  }

  addCrystal(x, y, z, scale = 1, color = 0xa78bfa) {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5 * scale, 0),
      makeMaterial(color, color, 0.5, { transparent: true, opacity: 0.85 })
    );
    crystal.position.set(x, y, z);
    this.group.add(crystal);
    this.decor.push({
      mesh: crystal,
      update: (time) => {
        crystal.rotation.y = time * 1.5;
        crystal.position.y = y + Math.sin(time * 2 + x) * 0.2;
      },
    });
  }

  addStarfield(count, zCenter) {
    for (let i = 0; i < count; i++) {
      const star = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 6, 6),
        makeMaterial(RAINBOW[i % RAINBOW.length], RAINBOW[i % RAINBOW.length], 0.8)
      );
      star.position.set(
        -18 + Math.random() * 36,
        4 + Math.random() * 20,
        zCenter - 15 + Math.random() * 30
      );
      this.group.add(star);
      this.decor.push({
        mesh: star,
        update: (time) => {
          star.material.emissiveIntensity = 0.4 + Math.sin(time * 3 + i) * 0.35;
        },
      });
    }
  }

  addVerticalMover(g, x, baseY, z, w, d, h, color, options = {}) {
    const amp = options.amplitude ?? 3;
    const speed = options.speed ?? 0.75;
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
      p.mesh.material.emissiveIntensity =
        0.3 + (Math.sin(time * speed * 2 + phase) * 0.5 + 0.5) * 0.25;
    };
    this.movingPlatforms.push(p);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, amp * 2 + 4, 6),
      makeMaterial(0x64748b, 0x475569, 0.15, { transparent: true, opacity: 0.35 })
    );
    pole.position.set(x, baseY + amp, z);
    g.add(pole);
    this.decor.push({
      mesh: pole,
      update: (time) => {
        const offset = Math.sin(time * speed + phase) * amp;
        pole.position.y = p.baseBottomY + amp + offset * 0.5;
      },
    });

    return p;
  }

  addHorizontalMover(g, x, baseY, z, w, d, h, color, axis, travel, speed, phase = 0) {
    const p = addPlatform(g, this.platforms, x, baseY, z, w, d, h, color, {
      emissive: color,
      emissiveIntensity: 0.4,
    });
    p.baseX = x;
    p.baseZ = z;
    p.halfW = w / 2;
    p.halfD = d / 2;
    p.platformHeight = h;
    p.baseBottomY = baseY;
    p.velocity = new THREE.Vector3(0, 0, 0);
    p.update = (time) => {
      const offset = Math.sin(time * speed + phase) * travel;
      if (axis === "x") {
        p.mesh.position.x = p.baseX + offset;
        p.minX = p.baseX + offset - p.halfW;
        p.maxX = p.baseX + offset + p.halfW;
        p.velocity.x = Math.cos(time * speed + phase) * travel * speed;
        p.velocity.z = 0;
      } else {
        p.mesh.position.z = p.baseZ + offset;
        p.minZ = p.baseZ + offset - p.halfD;
        p.maxZ = p.baseZ + offset + p.halfD;
        p.velocity.z = Math.cos(time * speed + phase) * travel * speed;
        p.velocity.x = 0;
      }
      p.velocity.y = 0;
    };
    this.movingPlatforms.push(p);
    return p;
  }

  addBlinkPlatform(g, x, y, z, w, d, h, color, phase) {
    const p = addPlatform(g, this.platforms, x, y, z, w, d, h, color, {
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.95,
      blinkPhase: phase,
    });
    p.solid = true;
    this.blinkPlatforms.push(p);
    return p;
  }

  addCheckpoint(index, x, y, z, color) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.14, 8, 24),
      makeMaterial(0xfbbf24, 0xfbbf24, 0.5)
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

  buildStarfall() {
    const zone = ZONES_L2[0];
    const g = this.group;
    this.addZonePad(zone, 0, 16);
    this.addZoneGate(zone, 0, 0, -4);
    this.addStarfield(40, 0);

    addPlatform(g, this.platforms, 0, 0, 0, 10, 10, 1.2, 0x7c3aed, {
      emissive: 0x6d28d9,
      emissiveIntensity: 0.25,
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.addCrystal(Math.cos(angle) * 5, 2 + (i % 3) * 0.5, Math.sin(angle) * 5, 0.7, CRYSTAL[i % CRYSTAL.length]);
    }

    this.addTipSign(
      ["Welcome to Dream Sky!", "Gaps between every block", "Use double jump + bounce pads"],
      0, 0, -2, -1
    );
  }

  buildBounceGardens() {
    const zone = ZONES_L2[1];
    const g = this.group;
    const padD = 4.5;
    let z = zAfterPrev(0, 10, padD);
    this.addZonePad(zone, z - 18, 38);
    this.addZoneGate(zone, 0, 1, z + 5);

    const pads = [
      { z: 0, bounce: false, color: 0x2dd4bf },
      { z: 0, bounce: true, color: 0x4ade80 },
      { z: 0, bounce: false, color: 0x14b8a6 },
      { z: 0, bounce: true, color: 0x4ade80 },
      { z: 0, bounce: false, color: 0x2dd4bf },
    ];
    pads[0].z = z;
    for (let i = 1; i < pads.length; i++) {
      pads[i].z = zAfterPrev(pads[i - 1].z, padD, padD);
    }

    pads.forEach((p, i) => {
      addPlatform(g, this.platforms, 0, 1 + (i % 2) * 0.3, p.z, padD, padD, 1, p.color, {
        emissive: p.color,
        emissiveIntensity: p.bounce ? 0.5 : 0.2,
        bounceForce: p.bounce ? 14 : null,
      });
      if (p.bounce) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.8, 0.1, 8, 20),
          makeMaterial(0x4ade80, 0x22c55e, 0.6, { transparent: true, opacity: 0.7 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 2.8, p.z);
        g.add(ring);
        this.decor.push({
          mesh: ring,
          update: (time) => {
            ring.rotation.z = time * 2;
            ring.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
          },
        });
      }
    });

    const cpZ = zAfterPrev(pads[pads.length - 1].z, padD, padD);
    this.addCheckpoint(1, 0, 2, cpZ, 0x4ade80);
    addPlatform(g, this.platforms, 0, 2, cpZ, padD, padD, 1, 0x4ade80, {
      emissive: 0x22c55e,
      emissiveIntensity: 0.2,
    });
    this._ghostEntryZ = cpZ;

    this.addTipSign(
      ["Green glowing pad = bounce!", "Land on it to fly upward", "Then double-jump to the next block"],
      0, 1, pads[1].z,
      1
    );
  }

  buildGhostSteps() {
    const zone = ZONES_L2[2];
    const g = this.group;
    const padD = 4.5;
    let z = zAfterPrev(this._ghostEntryZ, padD, padD);
    this.addZonePad(zone, z - 18, 38);
    this.addZoneGate(zone, 0, 2, z + 5);

    for (let i = 0; i < 6; i++) {
      z = i === 0 ? z : zAfterPrev(z, padD, padD);
      this.addBlinkPlatform(g, 0, 2 + i * 0.15, z, padD, padD, 1, CRYSTAL[i % CRYSTAL.length], i * 1.3);
    }

    const cpZ = zAfterPrev(z, padD, padD);
    this.addCheckpoint(2, 0, 3, cpZ, 0x818cf8);
    addPlatform(g, this.platforms, 0, 3, cpZ, padD, padD, 1, 0x6366f1, {
      emissive: 0x4f46e5,
      emissiveIntensity: 0.25,
    });
    this._elevatorEntryZ = cpZ;

    this.addTipSign(
      ["Watch the purple pads pulse", "Only jump when they are bright", "If they fade — wait!"],
      0, 2, zAfterPrev(this._ghostEntryZ, padD, padD),
      -1
    );
  }

  buildSkyElevators() {
    const zone = ZONES_L2[3];
    const g = this.group;
    const padD = 4.5;
    const padH = 1.2;
    let z = zAfterPrev(this._elevatorEntryZ, padD, padD);
    this.addZonePad(zone, z - 22, 42);
    this.addZoneGate(zone, 0, 3, z + 5);

    addPlatform(g, this.platforms, 0, 3, z, padD, padD, padH, 0x4338ca, {
      emissive: 0x6366f1,
      emissiveIntensity: 0.2,
    });

    const lift1Z = zAfterPrev(z, padD, padD);
    this.addVerticalMover(g, 0, 4, lift1Z, padD, padD, padH, 0x22d3ee, {
      amplitude: 2.5,
      speed: 0.7,
      phase: 0,
      emissive: 0x06b6d4,
    });

    const midZ = zAfterPrev(lift1Z, padD, padD);
    addPlatform(g, this.platforms, 0, 5, midZ, padD, padD, padH, 0x6366f1, {
      emissive: 0x4f46e5,
      emissiveIntensity: 0.22,
    });

    const lift2Z = zAfterPrev(midZ, padD, padD);
    this.addVerticalMover(g, -2, 5.5, lift2Z, padD, padD, padH, 0x38bdf8, {
      amplitude: 3.5,
      speed: 0.9,
      phase: 1.2,
      emissive: 0x2563eb,
    });

    const lift3Z = zAfterPrev(lift2Z, padD, padD);
    this.addVerticalMover(g, 2, 6, lift3Z, padD, padD, padH, 0xa78bfa, {
      amplitude: 4,
      speed: 1.1,
      phase: 2.4,
      emissive: 0x7c3aed,
    });

    const bridgeZ = zAfterPrev(lift3Z, padD, padD);
    addPlatform(g, this.platforms, 0, 7, bridgeZ, padD, padD, padH, 0x818cf8, {
      emissive: 0x6366f1,
      emissiveIntensity: 0.25,
    });

    const lift4Z = zAfterPrev(bridgeZ, padD, padD);
    this.addVerticalMover(g, 0, 7.5, lift4Z, padD, padD, padH, 0x2dd4bf, {
      amplitude: 3,
      speed: 0.85,
      phase: 0.8,
      emissive: 0x14b8a6,
    });

    const sideZ = zAfterPrev(lift4Z, padD, padD);
    this.addHorizontalMover(g, -4.5, 8, sideZ, padD, padD, padH, 0xf472b6, "x", 2.5, 0.8, 0);
    addPlatform(g, this.platforms, 4.5, 8, sideZ, padD, padD, padH, 0xec4899, {
      emissive: 0xdb2777,
      emissiveIntensity: 0.25,
    });

    const exitZ = zAfterPrev(sideZ, padD, padD);
    addPlatform(g, this.platforms, 0, 8.5, exitZ, padD, padD, padH, 0xc084fc, {
      emissive: 0xa855f7,
      emissiveIntensity: 0.3,
    });
    this._spiralEntryZ = exitZ;

    this.addTipSign(
      ["Cyan pads move UP and DOWN", "Stay on them — you ride together", "Jump when the lift is at its highest"],
      0, 4, lift1Z,
      1
    );
    this.addTipSign(
      ["Pink pad slides left-right too", "Use double jump between lifts"],
      4.5, 8, sideZ,
      -1
    );
  }

  buildSpiralAscent() {
    const zone = ZONES_L2[4];
    const g = this.group;
    const padD = 4;
    let z = zAfterPrev(this._spiralEntryZ, padD, padD);
    this.addZonePad(zone, z - 25, 45);
    this.addZoneGate(zone, 0, 3, z + 5);

    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const angle = i * 0.65;
      const x = Math.sin(angle) * 4;
      const y = 3 + i * 0.55;
      z = i === 0 ? z : zAfterPrev(z, padD, padD);
      const color = RAINBOW[i % RAINBOW.length];
      addPlatform(g, this.platforms, x, y, z, padD, padD, 1, color, {
        emissive: color,
        emissiveIntensity: 0.3,
      });
      this.addCrystal(x, y + 1.5, z, 0.5, color);
    }

    const cpZ = zAfterPrev(z, padD, padD);
    this.addCheckpoint(3, 0, 3 + steps * 0.55, cpZ, 0xf472b6);
    addPlatform(g, this.platforms, 0, 3 + steps * 0.55, cpZ, padD, padD, 1, 0xf472b6, {
      emissive: 0xec4899,
      emissiveIntensity: 0.25,
    });
    this._cometEntryZ = cpZ;

    this.addTipSign(
      ["Follow the spiral staircase", "Each pad is higher than the last", "Don't look down!"],
      0, 4, zAfterPrev(this._spiralEntryZ, padD, padD),
      1
    );
  }

  buildCometExpress() {
    const zone = ZONES_L2[5];
    const g = this.group;
    const padD = 4.5;
    const cometTravel = 3;
    let z = zAfterPrev(this._cometEntryZ, padD, padD);
    this.addZonePad(zone, z - 20, 38);
    this.addZoneGate(zone, 0, 8, z + 5);

    addPlatform(g, this.platforms, 0, 8, z, padD, padD, 1, 0x0ea5e9, {
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
    });

    const cometZ = zAfterMover(z, padD, padD, cometTravel);
    const comet = addPlatform(g, this.platforms, 0, 8, cometZ, padD, 1.4, padD, 0x38bdf8, {
      emissive: 0x2563eb,
      emissiveIntensity: 0.45,
    });
    comet.halfW = padD / 2;
    comet.halfD = padD / 2;
    comet.velocity = new THREE.Vector3(0, 0, 0);
    comet.update = (time) => {
      const offset = Math.sin(time * 0.85) * cometTravel;
      comet.mesh.position.z = cometZ + offset;
      comet.minZ = cometZ + offset - padD / 2;
      comet.maxZ = cometZ + offset + padD / 2;
      comet.velocity.z = Math.cos(time * 0.85) * cometTravel * 0.85;
      comet.velocity.y = 0;
      comet.mesh.material.emissiveIntensity =
        0.35 + (Math.sin(time * 8) * 0.5 + 0.5) * 0.3;
    };
    this.movingPlatforms.push(comet);

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 2.5, 8),
      makeMaterial(0x67e8f9, 0x22d3ee, 0.5, { transparent: true, opacity: 0.6 })
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 9, cometZ + 2);
    g.add(tail);
    this.decor.push({
      mesh: tail,
      update: (time) => {
        tail.position.z = comet.mesh.position.z + 2.2;
        tail.material.opacity = 0.4 + Math.sin(time * 10) * 0.2;
      },
    });

    z = zAfterMover(cometZ, padD, padD, cometTravel);
    addPlatform(g, this.platforms, 0, 8, z, padD, padD, 1, 0x06b6d4, {
      emissive: 0x0891b2,
      emissiveIntensity: 0.2,
    });

    const bounceZ = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, 8, bounceZ, padD, padD, 1, 0x4ade80, {
      emissive: 0x22c55e,
      emissiveIntensity: 0.45,
      bounceForce: 13,
    });

    const cpZ = zAfterPrev(bounceZ, padD, padD);
    this.addCheckpoint(4, 0, 9, cpZ, 0x38bdf8);
    addPlatform(g, this.platforms, 0, 9, cpZ, padD, padD, 1, 0x38bdf8, {
      emissive: 0x2563eb,
      emissiveIntensity: 0.25,
    });
    this._crownEntryZ = cpZ;

    this.addTipSign(
      ["Wait for the comet pad", "Ride it while it moves", "Leap off to the cyan island"],
      0, 8, zAfterPrev(this._cometEntryZ, padD, padD),
      -1
    );
  }

  buildNebulaCrown() {
    const zone = ZONES_L2[6];
    const g = this.group;
    const padD = 4.5;
    let z = zAfterPrev(this._crownEntryZ, padD, padD);
    this.addZonePad(zone, z - 18, 35);
    this.addZoneGate(zone, 0, 9, z + 5);

    addPlatform(g, this.platforms, 0, 9, z, padD, padD, 1, 0xc084fc, {
      emissive: 0xa855f7,
      emissiveIntensity: 0.25,
    });

    const z2 = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, 10.5, z2, padD, padD, 1, 0xfbbf24, {
      emissive: 0xf59e0b,
      emissiveIntensity: 0.3,
    });

    const crownD = 8;
    const crownZ = zAfterPrev(z2, padD, crownD);
    addPlatform(g, this.platforms, 0, 12, crownZ, crownD, crownD, 1.5, 0xfacc15, {
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

    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.25, 8, 32),
      makeMaterial(0xfbbf24, 0xf59e0b, 0.7)
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 14.5, crownZ);
    g.add(crown);
    this.decor.push({
      mesh: crown,
      update: (time) => {
        crown.rotation.z = time * 0.6;
        crown.position.y = 14.5 + Math.sin(time) * 0.3;
      },
    });

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.35, 0),
        makeMaterial(CRYSTAL[i % CRYSTAL.length], CRYSTAL[i % CRYSTAL.length], 0.7)
      );
      gem.position.set(Math.cos(angle) * 4, 13 + Math.sin(angle) * 0.5, crownZ + Math.sin(angle) * 4);
      g.add(gem);
      this.decor.push({
        mesh: gem,
        update: (time) => {
          gem.rotation.y = time * 2 + i;
        },
      });
    }

    this.addTipSign(
      ["Climb to the golden crown", "Stand on the big platform", "You beat Dream Sky!"],
      0, 9, z,
      1
    );
  }

  getZoneAt(z) {
    for (const zone of ZONES_L2) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES_L2[ZONES_L2.length - 1];
  }

  update(time) {
    for (const mp of this.movingPlatforms) {
      if (mp.update) mp.update(time);
    }

    for (const p of this.blinkPlatforms) {
      const on = Math.sin(time * 2.2 + p.blinkPhase) > 0.1;
      p.solid = on;
      p.mesh.visible = on;
      p.mesh.material.transparent = true;
      p.mesh.material.opacity = on ? 0.95 : 0.15;
      p.mesh.material.emissiveIntensity = on ? 0.4 : 0.05;
    }

    for (const d of this.decor) {
      if (d.spin) d.mesh.rotation.y = time * 1.5;
      if (d.update) d.update(time);
    }
  }
}
