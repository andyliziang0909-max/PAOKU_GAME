import * as THREE from "three";

export const RAINBOW = [0xf87171, 0xfb923c, 0xfacc15, 0x4ade80, 0x38bdf8, 0xa78bfa, 0xf472b6];
export const PLATFORM_GAP = 3.5;

export function zAfterPrev(prevZ, prevDepth, nextDepth, gap = PLATFORM_GAP) {
  return prevZ - prevDepth / 2 - gap - nextDepth / 2;
}

/** Next platform center along -Z with extra clearance for a mover that slides ±travel on Z. */
export function zAfterMover(prevZ, prevDepth, nextDepth, travel, gap = PLATFORM_GAP) {
  return prevZ - prevDepth / 2 - gap - travel - nextDepth / 2;
}

export function makeMaterial(color, emissive = 0x000000, emissiveIntensity = 0, opts = {}) {
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

export function addPlatform(group, platforms, x, y, z, w, d, h, color, options = {}) {
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
    solid: true,
    bounceForce: options.bounceForce ?? null,
    blinkPhase: options.blinkPhase ?? null,
  };
  platforms.push(platform);
  return platform;
}

export function createSignTexture(text, bg, fg) {
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

export function createTipTexture(lines, bg = "#1e3a5f", fg = "#ffffff") {
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

/**
 * Fire all in-range cannons together on the same global volley beat.
 */
export function updateSyncedCannons(level, time, playerPos) {
  const period = level.cannonVolleyPeriod ?? 3;
  const volleyIndex = Math.floor(time / period);

  for (const cannon of level.cannons) {
    const inRange = playerPos
      ? cannon.muzzle.distanceTo(playerPos) <= cannon.triggerRange
      : false;
    if (!cannon.active && inRange) cannon.active = true;
    else if (cannon.active && !inRange) cannon.active = false;
  }

  const anyInRange = level.cannons.some(
    (c) => playerPos && c.muzzle.distanceTo(playerPos) <= c.triggerRange
  );
  if (!anyInRange) {
    level._cannonWarmupUntil = undefined;
  } else if (level.cannonWarmupSec && level._cannonWarmupUntil === undefined) {
    level._cannonWarmupUntil = time + level.cannonWarmupSec;
  }
  if (level._cannonWarmupUntil && time < level._cannonWarmupUntil) return;

  if (volleyIndex <= (level._lastFiredVolleyIndex ?? -1)) return;

  const ready = level.cannons.filter(
    (c) => playerPos && c.muzzle.distanceTo(playerPos) <= c.triggerRange
  );
  if (ready.length === 0) return;

  for (const cannon of ready) {
    level.fireProjectile(cannon, time, playerPos);
  }
  level._lastFiredVolleyIndex = volleyIndex;
}
