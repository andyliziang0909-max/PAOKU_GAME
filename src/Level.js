import * as THREE from "three";
import { zAfterMover } from "./levelHelpers.js";

export const ZONES = [
  { name: "Grasslands", sky: 0x7dd3fc, fog: 0xa7f3d0, void: 0x22c55e, zMin: 6, zMax: -4, tip: "Press W to move · Space to jump · Space again in air for double jump" },
  { name: "Rainbow Steps", sky: 0xfbcfe8, fog: 0xfda4af, void: 0xf472b6, zMin: -4, zMax: -55, tip: "Hop across each colored pad · Touch the pink checkpoint" },
  { name: "Cloud Walk", sky: 0xe0f2fe, fog: 0xf0f9ff, void: 0x38bdf8, zMin: -55, zMax: -95, tip: "Walk straight ahead · Jump across the gap to the next pad" },
  { name: "Ocean Express", sky: 0x0369a1, fog: 0x0ea5e9, void: 0x0284c7, zMin: -95, zMax: -135, tip: "Wait for the blue pad · Jump on · Ride it across" },
  { name: "Volcano Rush", sky: 0x7f1d1d, fog: 0xea580c, void: 0xdc2626, zMin: -135, zMax: -175, tip: "Jump over the red laser · Or wait for it to spin away" },
  { name: "Neon Galaxy", sky: 0x1e1b4b, fog: 0x6d28d9, void: 0x7c3aed, zMin: -175, zMax: -215, tip: "Short jumps · Follow the glowing pads forward" },
  { name: "Golden Summit", sky: 0xfef08a, fog: 0xfbbf24, void: 0xf59e0b, zMin: -215, zMax: -260, tip: "Climb the gold steps · Stand on the big gold pad to win!" },
];

const RAINBOW = [0xf87171, 0xfb923c, 0xfacc15, 0x4ade80, 0x38bdf8, 0xa78bfa, 0xf472b6];
const PLATFORM_GAP = 3.5;

/** Next platform center (along -Z) with a clear gap — no overlap. */
function zAfterPrev(prevZ, prevDepth, nextDepth, gap = PLATFORM_GAP) {
  return prevZ - prevDepth / 2 - gap - nextDepth / 2;
}

function makeMaterial(color, emissive = 0x000000, emissiveIntensity = 0, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0.12,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

function addPlatform(group, platforms, x, y, z, w, d, h, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    makeMaterial(color, options.emissive, options.emissiveIntensity ?? 0, options)
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const halfW = w / 2;
  const halfD = d / 2;
  const platform = {
    mesh,
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
    topY: y + h,
    velocity: options.velocity ?? null,
    update: options.update ?? null,
  };
  platforms.push(platform);
  return platform;
}

function createSignTexture(text, bg, fg) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(16, 16, 480, 96, 24);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = "bold 52px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTipTexture(lines, bg = "#1e3a5f", fg = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(12, 12, 488, 232, 16);
  ctx.fill();
  ctx.strokeStyle = "#7dd3fc";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fde047";
  ctx.font = "bold 30px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TIP", 256, 44);
  ctx.fillStyle = fg;
  ctx.font = "24px Segoe UI, sans-serif";
  lines.forEach((line, i) => {
    ctx.fillText(line, 256, 82 + i * 34);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Level {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.platforms = [];
    this.movingPlatforms = [];
    this.hazards = [];
    this.checkpoints = [];
    this.finishBox = null;
    this.decor = [];
    this.zonePads = [];

    this.checkpointCount = 5;
    this.scene = scene;
    this.build();
  }

  dispose() {
    this.scene.remove(this.group);
    this.platforms = [];
    this.movingPlatforms = [];
    this.hazards = [];
    this.checkpoints = [];
    this.decor = [];
    this.zonePads = [];
  }

  build() {
    this.buildGrasslands();
    this.buildRainbowSteps();
    this.buildCloudWalk();
    this.buildOceanExpress();
    this.buildVolcanoRush();
    this.buildNeonGalaxy();
    this.buildGoldenSummit();
  }

  addZonePad(zone, centerZ, length) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(36, length),
      makeMaterial(zone.void, zone.void, 0.25, { transparent: true, opacity: 0.55 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, -18, centerZ);
    this.group.add(pad);
    this.zonePads.push(pad);
  }

  addTipSign(lines, x, y, z, side = 1) {
    const tex = createTipTexture(lines);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x + side * 5.5, y + 2.4, z);
    sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(sign);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6),
      makeMaterial(0x64748b, 0x475569, 0.1)
    );
    post.position.set(x + side * 5.5, y + 1.2, z);
    this.group.add(post);
  }

  addZoneGate(zone, x, y, z) {
    const tex = createSignTexture(
      zone.name,
      `#${zone.fog.toString(16).padStart(6, "0")}`,
      "#ffffff"
    );
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 1.1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(x, y + 10, z);
    this.group.add(sign);

    for (const side of [-5, 5]) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 10, 8),
        makeMaterial(zone.void, zone.void, 0.35)
      );
      pillar.position.set(x + side, y + 5, z);
      pillar.castShadow = true;
      this.group.add(pillar);
    }
  }

  addOrbs(colors, positions, pulse = true) {
    for (let i = 0; i < positions.length; i++) {
      const [x, y, z] = positions[i];
      const color = colors[i % colors.length];
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 12),
        makeMaterial(color, color, 0.55, { transparent: true, opacity: 0.85 })
      );
      orb.position.set(x, y, z);
      this.group.add(orb);
      this.decor.push({
        mesh: orb,
        update: pulse
          ? (time) => {
              orb.position.y = y + Math.sin(time * 2 + i) * 0.35;
              orb.material.emissiveIntensity = 0.45 + Math.sin(time * 3 + i) * 0.2;
            }
          : null,
      });
    }
  }

  addCloud(x, y, z, scale = 1) {
    const cloud = new THREE.Group();
    const puffMat = makeMaterial(0xffffff, 0xe0f2fe, 0.08);
    const sizes = [
      [1.2, 0.7, 1.2],
      [0.9, 0.55, 0.9],
      [1, 0.6, 1],
    ];
    const offsets = [
      [0, 0, 0],
      [-0.9, -0.1, 0.2],
      [0.85, -0.05, -0.15],
    ];
    for (let i = 0; i < sizes.length; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10), puffMat);
      puff.scale.set(sizes[i][0] * scale, sizes[i][1] * scale, sizes[i][2] * scale);
      puff.position.set(offsets[i][0] * scale, offsets[i][1] * scale, offsets[i][2] * scale);
      cloud.add(puff);
    }
    cloud.position.set(x, y, z);
    this.group.add(cloud);
    this.decor.push({
      mesh: cloud,
      update: (time) => {
        cloud.position.y = y + Math.sin(time * 0.8 + x) * 0.25;
      },
    });
  }

  buildGrasslands() {
    const zone = ZONES[0];
    const g = this.group;
    this.addZonePad(zone, -1, 14);
    this.addZoneGate(zone, 0, 0, -3);

    addPlatform(g, this.platforms, 0, 0, 0, 12, 12, 1, 0x4ade80, {
      emissive: 0x22c55e,
      emissiveIntensity: 0.12,
    });

    const tileColors = [0x22c55e, 0x16a34a];
    for (let tx = -4; tx <= 4; tx += 2) {
      for (let tz = -4; tz <= 4; tz += 2) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.08, 1.8),
          makeMaterial(tileColors[(tx + tz) % 2 === 0 ? 0 : 1])
        );
        tile.position.set(tx, 1.04, tz);
        g.add(tile);
      }
    }

    this.addOrbs([0xfacc15, 0xf472b6, 0x38bdf8], [
      [-4, 2.5, -2],
      [4, 2.5, 2],
      [0, 3, -3],
    ]);

    this.addTipSign(
      ["W = forward", "Space = jump twice in air", "Reach the rainbow pads ahead"],
      0, 0, -2, -1
    );
  }

  buildRainbowSteps() {
    const zone = ZONES[1];
    const g = this.group;
    this.addZonePad(zone, -16, 24);
    this.addZoneGate(zone, 0, 0, -8);

    const padD = 5;
    const stones = [
      { x: 0, y: 0, z: zAfterPrev(0, 12, padD), w: padD, d: padD },
      { x: 1.5, y: 0.5, z: 0, w: padD, d: padD },
      { x: -1, y: 1, z: 0, w: padD, d: padD },
      { x: 1, y: 1.5, z: 0, w: padD, d: padD },
      { x: 0, y: 2, z: 0, w: padD, d: padD },
    ];
    stones[1].z = zAfterPrev(stones[0].z, padD, padD);
    stones[2].z = zAfterPrev(stones[1].z, padD, padD);
    stones[3].z = zAfterPrev(stones[2].z, padD, padD);
    stones[4].z = zAfterPrev(stones[3].z, padD, padD);

    stones.forEach(({ x, y, z, w, d }, i) => {
      const color = RAINBOW[i % RAINBOW.length];
      addPlatform(g, this.platforms, x, y, z, w, d, 1.2, color, {
        emissive: color,
        emissiveIntensity: 0.22,
      });
    });

    const cpZ = zAfterPrev(stones[4].z, padD, padD);
    this.addCheckpoint(1, 0, 2, cpZ, 0xf472b6, zone);
    addPlatform(g, this.platforms, 0, 2, cpZ, padD, padD, 1, 0xf472b6, {
      emissive: 0xec4899,
      emissiveIntensity: 0.15,
    });

    this.addOrbs(RAINBOW, [
      [-3, 2, stones[1].z],
      [3, 2.5, stones[2].z],
      [-2, 3, stones[3].z],
    ]);

    this.addTipSign(
      ["Jump to each colored pad", "There is a gap between each block", "Pink pad = checkpoint saved"],
      0, 0, stones[0].z, 1
    );
  }

  buildCloudWalk() {
    const zone = ZONES[2];
    const g = this.group;
    const padD = 5;
    const padY = 2;

    const cpPad = this.platforms[this.platforms.length - 1];
    let z = zAfterPrev(cpPad.mesh.position.z, padD, padD);

    this.addZonePad(zone, z - 20, 28);
    this.addZoneGate(zone, 0, padY, z + 4);

    const padZs = [z];
    for (let i = 1; i < 4; i++) {
      padZs.push(zAfterPrev(padZs[i - 1], padD, padD));
    }

    padZs.forEach((pz, i) => {
      addPlatform(g, this.platforms, 0, padY, pz, padD, padD, 1, 0xffffff, {
        emissive: i % 2 === 0 ? 0xbae6fd : 0xe0f2fe,
        emissiveIntensity: 0.15,
      });
    });

    this.addCloud(-14, 14, padZs[1], 0.55);
    this.addCloud(14, 13, padZs[2], 0.5);

    this.addTipSign(
      ["Go straight — don't turn", "Jump across the gap to the next pad", "Yellow pad saves your progress"],
      0, padY, padZs[0], 1
    );

    const lastCloudZ = padZs[padZs.length - 1];
    this.addCheckpoint(2, 0, padY, lastCloudZ, 0xfacc15, zone);

    const oceanBridgeZ = zAfterPrev(lastCloudZ, padD, padD);
    addPlatform(g, this.platforms, 0, padY, oceanBridgeZ, padD, padD, 1, 0x38bdf8, {
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.18,
    });
    this._oceanEntryZ = oceanBridgeZ;
  }

  buildOceanExpress() {
    const zone = ZONES[3];
    const g = this.group;
    const padD = 5;
    const padY = 2;

    let z = this._oceanEntryZ ?? zAfterPrev(-50, padD, padD);
    this.addZonePad(zone, z - 22, 30);
    this.addZoneGate(zone, 0, padY, z + 4);

    const stagingZ = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, padY, stagingZ, padD, padD, 1, 0x0ea5e9, {
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
    });

    const moverZ = zAfterPrev(stagingZ, padD, padD);
    const moverA = addPlatform(g, this.platforms, 0, padY, moverZ, padD, 1.2, padD, 0x22d3ee, {
      emissive: 0x06b6d4,
      emissiveIntensity: 0.35,
    });
    moverA.velocity = new THREE.Vector3(2, 0, 0);
    moverA.update = (time) => {
      const offset = Math.sin(time * 0.7) * 2;
      moverA.mesh.position.x = offset;
      moverA.minX = offset - padD / 2;
      moverA.maxX = offset + padD / 2;
      moverA.velocity.x = Math.cos(time * 0.7) * 2 * 0.7;
    };
    this.movingPlatforms.push(moverA);

    z = zAfterPrev(moverZ, padD, padD);
    addPlatform(g, this.platforms, 0, padY, z, padD, padD, 1, 0x0ea5e9, {
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
    });

    const mover2Z = zAfterMover(z, padD, padD, 2);
    const moverB = addPlatform(g, this.platforms, 0, padY, mover2Z, padD, 1.2, padD, 0x38bdf8, {
      emissive: 0x2563eb,
      emissiveIntensity: 0.35,
    });
    moverB.velocity = new THREE.Vector3(0, 0, 2);
    moverB.update = (time) => {
      const offset = Math.sin(time * 0.75) * 2;
      moverB.mesh.position.z = mover2Z + offset;
      moverB.minZ = mover2Z + offset - padD / 2;
      moverB.maxZ = mover2Z + offset + padD / 2;
      moverB.velocity.z = Math.cos(time * 0.75) * 2 * 0.75;
    };
    this.movingPlatforms.push(moverB);

    z = zAfterMover(mover2Z, padD, padD, 2);
    addPlatform(g, this.platforms, 0, padY + 1, z, padD, padD, 1, 0x06b6d4, {
      emissive: 0x0891b2,
      emissiveIntensity: 0.18,
    });

    this.addCheckpoint(3, 0, padY + 1, z, 0xfb7185, zone);

    const volcanoBridgeZ = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, padY + 1, volcanoBridgeZ, padD, padD, 1, 0xfb7185, {
      emissive: 0xec4899,
      emissiveIntensity: 0.12,
    });
    this._volcanoEntryZ = volcanoBridgeZ;

    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.8, 0.12, 8, 20),
        makeMaterial(0x67e8f9, 0x22d3ee, 0.4, { transparent: true, opacity: 0.8 })
      );
      ring.position.set(i % 2 === 0 ? -12 : 12, 10, moverZ - i * 4);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      this.decor.push({
        mesh: ring,
        update: (time) => {
          ring.rotation.z = time * (1 + i * 0.15);
        },
      });
    }

    this.addTipSign(
      ["Stand still and wait", "Jump onto the moving blue pad", "Ride it — then jump across the gap"],
      0, padY, stagingZ, -1
    );
  }

  buildVolcanoRush() {
    const zone = ZONES[4];
    const g = this.group;
    const padD = 5;
    const padY = 3;

    let z = this._volcanoEntryZ ?? -80;
    this.addZonePad(zone, z - 22, 32);
    this.addZoneGate(zone, 0, padY, z + 4);

    z = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, padY, z, padD, padD, 1, 0x78716c, {
      emissive: 0xea580c,
      emissiveIntensity: 0.25,
    });

    const z2 = zAfterPrev(z, padD, padD);
    const platformTop = padY + 1;
    this.addSpinner(0, platformTop + 0.9, (z + z2) / 2, 2.2, 0.22, 0xef4444, 0xf97316);
    addPlatform(g, this.platforms, 0, padY, z2, padD, padD, 1, 0x78716c, {
      emissive: 0xea580c,
      emissiveIntensity: 0.25,
    });

    const z3 = zAfterPrev(z2, padD, padD);
    this.addSpinner(0, platformTop + 0.9, (z2 + z3) / 2, 2.2, 0.22, 0xdc2626, 0xfbbf24);
    addPlatform(g, this.platforms, 0, padY + 0.5, z3, padD, padD, 1, 0x57534e, {
      emissive: 0xdc2626,
      emissiveIntensity: 0.2,
    });

    this.addCheckpoint(4, 0, padY + 0.5, z3, 0xa855f7, zone);

    const neonBridgeZ = zAfterPrev(z3, padD, padD);
    addPlatform(g, this.platforms, 0, padY + 0.5, neonBridgeZ, padD, padD, 1, 0xa855f7, {
      emissive: 0x7c3aed,
      emissiveIntensity: 0.15,
    });
    this._neonEntryZ = neonBridgeZ;

    for (let i = 0; i < 8; i++) {
      const lava = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 8),
        makeMaterial(0xf97316, 0xef4444, 0.6)
      );
      lava.position.set(-10 + i * 2.8, -16, z - 8 - i * 2);
      g.add(lava);
      this.decor.push({
        mesh: lava,
        update: (time) => {
          lava.position.y = -16 + Math.abs(Math.sin(time * 2 + i)) * 1.5;
          lava.material.emissiveIntensity = 0.5 + Math.sin(time * 4 + i) * 0.25;
        },
      });
    }

    this.addTipSign(
      ["Stop before the red laser", "Jump over it or wait for it to spin away", "Only the red bar hurts you — not the air above"],
      0, padY, zAfterPrev(this._volcanoEntryZ, padD, padD), 1
    );
  }

  buildNeonGalaxy() {
    const zone = ZONES[5];
    const g = this.group;
    const padD = 5;
    const padY = 3.5;

    let z = this._neonEntryZ ?? -110;
    this.addZonePad(zone, z - 22, 32);
    this.addZoneGate(zone, 0, padY, z + 4);

    const jumpZs = [zAfterPrev(z, padD, padD)];
    for (let i = 1; i < 5; i++) {
      jumpZs.push(zAfterPrev(jumpZs[i - 1], padD, padD));
    }

    jumpZs.forEach((jz, i) => {
      const color = RAINBOW[(i + 2) % RAINBOW.length];
      const y = padY + i * 0.35;
      addPlatform(g, this.platforms, 0, y, jz, padD, padD, 1.2, color, {
        emissive: color,
        emissiveIntensity: 0.35,
      });
    });

    for (let i = 0; i < 12; i++) {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.15, 0),
        makeMaterial(RAINBOW[i % RAINBOW.length], RAINBOW[i % RAINBOW.length], 0.7)
      );
      star.position.set(-12 + (i % 3) * 12, 10, jumpZs[i % jumpZs.length] - 2);
      g.add(star);
      this.decor.push({
        mesh: star,
        update: (time) => {
          star.rotation.y = time * 2 + i;
          star.rotation.x = time + i * 0.3;
        },
      });
    }

    const lastJumpZ = jumpZs[jumpZs.length - 1];
    const lastY = padY + (jumpZs.length - 1) * 0.35;
    this.addCheckpoint(5, 0, lastY, lastJumpZ, 0x2dd4bf, zone);

    this._goldenEntryZ = zAfterPrev(lastJumpZ, padD, padD);

    this.addTipSign(
      ["Small hops across each gap", "Follow the glowing pads straight", "Teal pad saves progress"],
      0, padY, jumpZs[0], -1
    );
  }

  buildGoldenSummit() {
    const zone = ZONES[6];
    const g = this.group;
    const padD = 5;
    const padY = 5;

    let z = this._goldenEntryZ ?? -140;
    this.addZonePad(zone, z - 18, 28);
    this.addZoneGate(zone, 0, padY, z + 4);

    z = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, padY, z, padD, padD, 1, 0xfbbf24, {
      emissive: 0xf59e0b,
      emissiveIntensity: 0.25,
    });

    const z2 = zAfterPrev(z, padD, padD);
    addPlatform(g, this.platforms, 0, padY + 1.2, z2, padD, padD, 1, 0xfde047, {
      emissive: 0xeab308,
      emissiveIntensity: 0.3,
    });

    const finishD = 7;
    const finishZ = zAfterPrev(z2, padD, finishD);
    addPlatform(g, this.platforms, 0, padY + 2.4, finishZ, finishD, finishD, 1.4, 0xfacc15, {
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
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

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 6, 8),
      makeMaterial(0xfde047, 0xfbbf24, 0.75, { transparent: true, opacity: 0.9 })
    );
    beacon.position.set(0, padY + 5.5, finishZ);
    g.add(beacon);
    this.decor.push({ mesh: beacon, spin: true });

    for (const side of [-2.8, 2.8]) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.18, 8, 24, Math.PI),
        makeMaterial(RAINBOW[Math.abs(side) > 2 ? 4 : 6], RAINBOW[2], 0.45)
      );
      arch.position.set(side, padY + 4.5, finishZ);
      arch.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(arch);
    }

    this.addOrbs(RAINBOW, [
      [-3, padY + 4, finishZ + 2],
      [0, padY + 5.5, finishZ],
      [3, padY + 4, finishZ + 2],
    ]);

    this.addTipSign(
      ["Jump up each gold step", "There is a gap between each block", "Stand on the big gold pad to win!"],
      0, padY, z, 1
    );
  }

  addCheckpoint(index, x, y, z, color, zone) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.12, 8, 24),
      makeMaterial(zone.void, zone.void, 0.45)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    this.group.add(ring);

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 0.35, 20),
      makeMaterial(color, color, 0.4)
    );
    mesh.position.set(x, y + 0.18, z);
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const r = 1.4;
    this.checkpoints.push({
      index,
      mesh,
      ring,
      zone,
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

  addSpinner(x, y, z, length, thickness, color = 0xef4444, emissive = 0xdc2626) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(length, thickness, thickness),
      makeMaterial(color, emissive, 0.5)
    );
    bar.position.set(x, y, z);
    bar.castShadow = true;
    this.group.add(bar);

    const half = length / 2;
    const spinner = { mesh: bar, x, y, z, half, thickness, angle: 0 };
    this.decor.push({
      mesh: bar,
      update: (time) => {
        spinner.angle = time * 0.9;
        bar.rotation.y = spinner.angle;
        this.hazards = this.hazards.filter((h) => h.spinner !== spinner);
        this.hazards.push({ spinner });
      },
    });
  }

  getZoneAt(z) {
    for (const zone of ZONES) {
      if (z <= zone.zMin && z >= zone.zMax) return zone;
    }
    return ZONES[ZONES.length - 1];
  }

  update(time) {
    for (const mp of this.movingPlatforms) {
      if (mp.update) mp.update(time);
    }
    for (const d of this.decor) {
      if (d.spin) d.mesh.rotation.y = time * 1.5;
      if (d.update) d.update(time);
    }
  }
}
