import * as THREE from "three";
import { Player } from "./Player.js";
import { Level, ZONES } from "./Level.js";
import { Level2, ZONES_L2 } from "./Level2.js";
import { Level3, ZONES_L3 } from "./Level3.js";
import { Level4, ZONES_L4 } from "./Level4.js";
import { Level5, ZONES_L5 } from "./Level5.js";
import { Level6, ZONES_L6 } from "./Level6.js";
import { Level7, ZONES_L7 } from "./Level7.js";
import { Level8, ZONES_L8 } from "./Level8.js";
import { BasketballFunState } from "./basketballFun.js";
import { GameJuice } from "./gameJuice.js";
import {
  loadMeta,
  saveMeta,
  syncDaily,
  getDailyChallenge,
  recordLevelWin,
  formatMedals,
  getTitle,
  getBallSkin,
  BALL_SKINS,
} from "./gameMeta.js";
import { getCharacterBonus } from "./characterBonuses.js";
import {
  CHARACTERS,
  createCharacterPreviewGroup,
  preloadCharacterModels,
  disposeCharacterRoot,
} from "./characters.js";
import {
  getShootStart,
  TrajectoryPreview,
  HeldBallVisual,
} from "./basketballShooting.js";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const winScreen = document.getElementById("win-screen");
const startBtn = document.getElementById("start-btn");
const retryBtn = document.getElementById("retry-btn");
const continueBtn = document.getElementById("continue-btn");
const zoneLabel = document.getElementById("zone-label");
const levelLabel = document.getElementById("level-label");
const tipLabel = document.getElementById("tip-label");
const checkpointLabel = document.getElementById("checkpoint-label");
const timerLabel = document.getElementById("timer-label");
const dashBar = document.getElementById("dash-bar");
const scoreFlash = document.getElementById("score-flash");
const shootPrompt = document.getElementById("shoot-prompt");
const crosshair = document.getElementById("crosshair");
const cameraAimDir = new THREE.Vector3();
let trajectoryPreview = null;
let heldBallVisual = null;
const bounceHud = document.getElementById("bounce-hud");
const bounceScoreEl = document.getElementById("bounce-score");
const bounceGoalEl = document.getElementById("bounce-goal");
const bounceTimerEl = document.getElementById("bounce-timer");
const bouncePpmEl = document.getElementById("bounce-ppm");
const bounceModsEl = document.getElementById("bounce-mods");
const winTitle = document.getElementById("win-title");
const winMessage = document.getElementById("win-message");
const winTimeLabel = document.getElementById("win-time");
const characterGrid = document.getElementById("character-grid");
const selectedCharacterName = document.getElementById("selected-character-name");
const previewCanvas = document.getElementById("character-preview-canvas");
const testModeCheckbox = document.getElementById("test-mode-checkbox");
const testLevelPicker = document.getElementById("test-level-picker");
const testLevelButtons = document.getElementById("test-level-buttons");
const streakHud = document.getElementById("streak-hud");
const hypeMeter = document.getElementById("hype-meter");
const dailyChallengeEl = document.getElementById("daily-challenge");
const playerTitleEl = document.getElementById("player-title");
const characterBonusEl = document.getElementById("character-bonus");
const ballPickerEl = document.getElementById("ball-picker");
const winMedalsEl = document.getElementById("win-medals");

const LEVEL_START_OPTIONS = [
  { num: 1, label: "Rainbow World", zone: "Grasslands" },
  { num: 2, label: "Dream Sky", zone: "Starfall Deck" },
  { num: 3, label: "Cosmic Factory", zone: "Loading Bay" },
  { num: 4, label: "Danger Fort", zone: "Fort Entrance" },
  { num: 5, label: "Storm Court", zone: "Storm Entry" },
  { num: 6, label: "Ultimate Gauntlet", zone: "Rainbow Relay" },
  { num: 7, label: "Bounce Round", zone: "Bonus Entry" },
  { num: 8, label: "Moving Court", zone: "Moving Court Entry" },
];

let gameMeta = loadMeta();
const basketballFun = new BasketballFunState();
let juice = null;
let deathCount = 0;

let testModeEnabled = false;
let testStartLevel = 1;
let selectedTestLevelBtn = null;

let previewScene = null;
let previewCamera = null;
let previewRenderer = null;
let previewGroup = null;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa7f3d0, 35, 110);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 250);
juice = new GameJuice(camera);

const hemi = new THREE.HemisphereLight(0xffffff, 0x64748b, 1.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1cc, 1.5);
sun.position.set(20, 40, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x0f172a, emissiveIntensity: 0.25 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -30;
ground.receiveShadow = true;
scene.add(ground);

const zoneLight = new THREE.PointLight(0xa7f3d0, 1.2, 80);
zoneLight.position.set(0, 12, 0);
scene.add(zoneLight);

const currentSky = new THREE.Color(ZONES[0].sky);
const currentFog = new THREE.Color(ZONES[0].fog);
const targetSky = currentSky.clone();
const targetFog = currentFog.clone();

let zones = ZONES;
let currentLevelNum = 1;
let level = null;
let totalCheckpoints = 5;
let currentZoneName = ZONES[0].name;
let currentZoneTip = ZONES[0].tip;

const player = new Player(scene);

let selectedCharacter = null;
let selectedCard = null;
let wasBasketScored = false;
let lastPointPopupTime = -1;

const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  dashPressed: false,
  actionPressed: false,
};

let pointerLocked = false;
let running = false;
let won = false;
let elapsed = 0;
let clock = new THREE.Clock();

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
}

function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Direction the player should SHOOT in — forward (yaw) + upward arc */
function getPlayerShootDirection() {
  const yaw = player.yaw;
  const highArc = Boolean(level?.highArcShots);
  let pitchBase = highArc ? 0.58 : 0.42;
  let pitchMin = highArc ? 0.32 : 0.18;
  if (player.characterBonus?.arcBonus) {
    pitchBase += 0.1;
    pitchMin += 0.06;
  }
  const pitchAim = Math.max(-player.pitch * 0.4 + pitchBase, pitchMin);
  cameraAimDir.set(
    -Math.sin(yaw) * Math.cos(pitchAim),
     Math.sin(pitchAim),
    -Math.cos(yaw) * Math.cos(pitchAim)
  );
  return cameraAimDir;
}

function showScoreFlash(text, quick = false) {
  scoreFlash.textContent = text;
  scoreFlash.classList.remove("hidden", "fade-out", "scoring");
  scoreFlash.classList.add("scoring");
  const hold = quick ? 900 : 2000;
  setTimeout(() => {
    scoreFlash.classList.add("fade-out");
    setTimeout(() => scoreFlash.classList.add("hidden"), 800);
  }, hold);
}

function getSpawnForLevel(num) {
  return num === 1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1, 0);
}

function disposeShootVisuals() {
  if (trajectoryPreview) trajectoryPreview.dispose();
  if (heldBallVisual) heldBallVisual.dispose();
  trajectoryPreview = null;
  heldBallVisual = null;
}

function ensureShootVisuals() {
  if (!level?.group || trajectoryPreview) return;
  trajectoryPreview = new TrajectoryPreview(level.group);
  trajectoryPreview.setDotScale(level.trajectoryDotScale ?? 1);
  heldBallVisual = new HeldBallVisual(level.group);
}

function hideShootVisuals() {
  trajectoryPreview?.hide();
  heldBallVisual?.hide();
}

function isBonusAimMode() {
  return Boolean(level?.bonusRoundActive);
}

function updateShootingAim() {
  if (!level?.canHoldBall || !level.canHoldBall(player.mesh.position)) {
    hideShootVisuals();
    return false;
  }
  ensureShootVisuals();
  const start = getShootStart(player.mesh.position);
  const aimDir = isBonusAimMode() ? getPlayerShootDirection() : null;
  const velocity = level.computeShotVelocity(start, aimDir);
  const trajOpts = isBonusAimMode()
    ? {
        maxSteps: level.trajectoryMaxSteps ?? 55,
        step: 0.065,
        floorY: start.y - (level.trajectoryDrop ?? 28),
      }
    : {};
  trajectoryPreview.update(start, velocity, trajOpts);
  heldBallVisual.showAt(start);
  const ballR = level.ballRadius ?? 0.34;
  heldBallVisual.mesh.scale.setScalar(ballR / 0.34);
  return true;
}

function loadLevel(num) {
  disposeShootVisuals();
  if (level) level.dispose();

  currentLevelNum = num;
  if (num === 1) {
    level = new Level(scene);
    zones = ZONES;
    scene.fog.far = 110;
    sun.shadow.camera.far = 120;
    camera.far = 200;
  } else if (num === 2) {
    level = new Level2(scene);
    zones = ZONES_L2;
    scene.fog.far = 150;
    sun.shadow.camera.far = 180;
    camera.far = 250;
  } else if (num === 3) {
    level = new Level3(scene);
    zones = ZONES_L3;
    scene.fog.far = 160;
    sun.shadow.camera.far = 200;
    camera.far = 280;
  } else if (num === 4) {
    level = new Level4(scene);
    zones = ZONES_L4;
    scene.fog.far = 170;
    sun.shadow.camera.far = 220;
    camera.far = 300;
  } else if (num === 5) {
    level = new Level5(scene);
    zones = ZONES_L5;
    scene.fog.far = 190;
    sun.shadow.camera.far = 260;
    camera.far = 340;
  } else if (num === 6) {
    level = new Level6(scene);
    zones = ZONES_L6;
    scene.fog.far = 210;
    sun.shadow.camera.far = 280;
    camera.far = 360;
  } else if (num === 7) {
    level = new Level7(scene);
    zones = ZONES_L7;
    scene.fog.far = 200;
    sun.shadow.camera.far = 260;
    camera.far = 320;
  } else {
    level = new Level8(scene);
    zones = ZONES_L8;
    scene.fog.far = 220;
    sun.shadow.camera.far = 280;
    camera.far = 350;
  }

  level.ballSkin = getBallSkin(gameMeta.selectedBall);

  totalCheckpoints = level.checkpointCount;
  targetSky.setHex(zones[0].sky);
  targetFog.setHex(zones[0].fog);
  currentSky.copy(targetSky);
  currentFog.copy(targetFog);
  scene.background = currentSky.clone();
  scene.fog.color.copy(currentFog);
  zoneLight.color.setHex(zones[0].fog);
  currentZoneName = zones[0].name;
  currentZoneTip = zones[0].tip;
}

function updateHud() {
  levelLabel.textContent = `Level ${currentLevelNum}`;
  zoneLabel.textContent = currentZoneName;
  tipLabel.textContent = currentZoneTip;
  checkpointLabel.textContent = `Checkpoint ${player.checkpointIndex} / ${totalCheckpoints}`;
  timerLabel.textContent = formatTime(elapsed);

  // Dash cooldown bar: full=ready (white-blue), draining=grey
  const t = player._elapsed ?? 0;
  const sinceEnd = t - player.lastDashEnd;
  const fill = player.isDashing ? 0 : Math.min(1, sinceEnd / player.dashCooldown);
  dashBar.style.width = (fill * 100) + "%";
  dashBar.style.background = fill >= 1
    ? "linear-gradient(90deg, #38bdf8, #818cf8)"
    : "rgba(255,255,255,0.25)";
}

function updateZoneAtmosphere(dt) {
  const zone = level.getZoneAt(player.mesh.position.z);
  if (zone.name !== currentZoneName) {
    currentZoneName = zone.name;
    currentZoneTip = zone.tip;
    targetSky.setHex(zone.sky);
    targetFog.setHex(zone.fog);
    zoneLight.color.setHex(zone.fog);
  }

  currentSky.lerp(targetSky, 1 - Math.exp(-3 * dt));
  currentFog.lerp(targetFog, 1 - Math.exp(-3 * dt));
  scene.background.copy(currentSky);
  scene.fog.color.copy(currentFog);
  zoneLight.position.set(player.mesh.position.x, 14, player.mesh.position.z - 6);
}

function updateCamera() {
  const dist = 6;
  const height = 2.5;
  const offset = new THREE.Vector3(
    Math.sin(player.yaw) * Math.cos(player.pitch) * dist,
    Math.sin(-player.pitch) * dist + height,
    Math.cos(player.yaw) * Math.cos(player.pitch) * dist
  );
  const target = player.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
}

function resetCheckpoints() {
  for (const cp of level.checkpoints) {
    cp.active = false;
    cp.mesh.material.emissiveIntensity = 0.4;
    if (cp.ring) cp.ring.material.emissiveIntensity = 0.45;
  }
}

function disposePreviewGroup(group) {
  if (!group) return;
  if (group.userData.mixer) group.userData.mixer.stopAllAction();
  for (const child of [...group.children]) disposeCharacterRoot(child);
}

function initCharacterPreview() {
  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(40, 200 / 240, 0.1, 50);
  previewCamera.position.set(0, 0.8, 2.8);
  previewCamera.lookAt(0, 0.8, 0);

  previewRenderer = new THREE.WebGLRenderer({
    canvas: previewCanvas,
    antialias: true,
    alpha: true,
  });
  previewRenderer.setSize(200, 240);
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;

  previewScene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 3);
  previewScene.add(key);
  const fill = new THREE.DirectionalLight(0xc7d2fe, 0.5);
  fill.position.set(-2, 2, -2);
  previewScene.add(fill);
}

async function updateCharacterPreview(character) {
  if (!previewScene) initCharacterPreview();
  if (previewGroup) {
    previewScene.remove(previewGroup);
    disposePreviewGroup(previewGroup);
  }
  previewGroup = await createCharacterPreviewGroup(character);
  previewScene.add(previewGroup);
}

function renderCharacterPreview(dt) {
  if (!previewRenderer || overlay.classList.contains("hidden")) return;
  if (previewGroup) {
    previewGroup.rotation.y += dt * 0.85;
    previewGroup.userData.mixer?.update(dt);
  }
  previewRenderer.render(previewScene, previewCamera);
}

function updateStartButtonLabel() {
  if (!selectedCharacter) {
    startBtn.textContent = "Start Game";
    return;
  }
  if (testModeEnabled) {
    const opt = LEVEL_START_OPTIONS.find((l) => l.num === testStartLevel);
    startBtn.textContent = `Start — Level ${testStartLevel}: ${opt.label}`;
  } else {
    startBtn.textContent = "Start Game";
  }
}

function selectTestLevel(levelNum, btnEl) {
  testStartLevel = levelNum;
  if (selectedTestLevelBtn) selectedTestLevelBtn.classList.remove("selected");
  selectedTestLevelBtn = btnEl;
  if (selectedTestLevelBtn) selectedTestLevelBtn.classList.add("selected");
  loadLevel(levelNum);
  updateStartButtonLabel();
}

function initTestMode() {
  testLevelButtons.innerHTML = "";
  LEVEL_START_OPTIONS.forEach((opt, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "test-level-btn";
    btn.dataset.level = String(opt.num);
    btn.innerHTML = `<span class="level-num">Level ${opt.num}</span>${opt.label}`;
    btn.addEventListener("click", () => selectTestLevel(opt.num, btn));
    testLevelButtons.appendChild(btn);
    if (index === 0) selectTestLevel(1, btn);
  });

  testModeCheckbox.addEventListener("change", () => {
    testModeEnabled = testModeCheckbox.checked;
    testLevelPicker.classList.toggle("hidden", !testModeEnabled);
    if (testModeEnabled) {
      loadLevel(testStartLevel);
    } else {
      loadLevel(1);
    }
    updateStartButtonLabel();
  });
}

function getStartLevel() {
  return testModeEnabled ? testStartLevel : 1;
}

async function selectCharacter(character, cardEl) {
  selectedCharacter = character;
  if (selectedCard) selectedCard.classList.remove("selected");
  selectedCard = cardEl;
  if (selectedCard) selectedCard.classList.add("selected");
  selectedCharacterName.textContent = `${character.emoji} ${character.name}`;
  const bonus = getCharacterBonus(character.id);
  if (characterBonusEl) {
    characterBonusEl.textContent = bonus ? `Perk: ${bonus.label}` : "Perk: Standard runner";
  }
  await updateCharacterPreview(character);
  await player.setCharacter(character);
  startBtn.disabled = false;
  updateStartButtonLabel();
}

function initMetaUI() {
  syncDaily(gameMeta);
  if (playerTitleEl) playerTitleEl.textContent = `Title: ${getTitle(gameMeta)}`;
  const daily = getDailyChallenge();
  if (dailyChallengeEl) dailyChallengeEl.textContent = `Daily: ${daily.challenge.text}`;
}

function initBallPicker() {
  if (!ballPickerEl) return;
  ballPickerEl.innerHTML = "";
  for (const [id, skin] of Object.entries(BALL_SKINS)) {
    if (!gameMeta.unlockedBalls.includes(id)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ball-btn" + (gameMeta.selectedBall === id ? " selected" : "");
    btn.textContent = skin.label;
    btn.addEventListener("click", () => {
      gameMeta.selectedBall = id;
      saveMeta(gameMeta);
      ballPickerEl.querySelectorAll(".ball-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
    ballPickerEl.appendChild(btn);
  }
}

function initCharacterSelect() {
  characterGrid.innerHTML = "";
  CHARACTERS.forEach((character, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "character-card";
    card.dataset.id = character.id;
    card.innerHTML = `
      <span class="char-emoji">${character.emoji}</span>
      <span class="char-name">${character.name}</span>
      <span class="char-swatch" style="background:#${character.color.toString(16).padStart(6, "0")}"></span>
    `;
    card.addEventListener("click", () => selectCharacter(character, card));
    characterGrid.appendChild(card);
    if (index === 0) selectCharacter(character, card);
  });
}

async function startGame(levelNum = currentLevelNum) {
  if (levelNum !== currentLevelNum) loadLevel(levelNum);
  if (selectedCharacter) await player.setCharacter(selectedCharacter);

  running = true;
  won = false;
  elapsed = 0;
  deathCount = 0;
  wasBasketScored = false;
  basketballFun.reset();
  level._funState = basketballFun;
  level._characterMeta = () => ({
    characterStreakMult: player.characterBonus?.streakMult ?? 1,
  });
  player.reset();
  player.checkpointIndex = 0;
  player.spawnPoint.copy(getSpawnForLevel(currentLevelNum));
  player.snapToPlatforms(level.platforms);
  resetCheckpoints();

  currentZoneName = zones[0].name;
  currentZoneTip = zones[0].tip;
  targetSky.setHex(zones[0].sky);
  targetFog.setHex(zones[0].fog);
  currentSky.copy(targetSky);
  currentFog.copy(targetFog);
  scene.background.copy(currentSky);
  scene.fog.color.copy(currentFog);

  overlay.classList.add("hidden");
  winScreen.classList.add("hidden");
  bounceHud.classList.add("hidden");
  crosshair.classList.add("hidden");
  updateHud();
  canvas.requestPointerLock();
}

function endGame() {
  running = false;
  won = true;
  document.exitPointerLock();

  const bonusScore = level.bonusRoundScore ?? 0;
  const winInfo = recordLevelWin(gameMeta, currentLevelNum, elapsed, deathCount, bonusScore);
  if (basketballFun.bestStreak > gameMeta.bestStreak) {
    gameMeta.bestStreak = basketballFun.bestStreak;
    saveMeta(gameMeta);
  }
  if (basketballFun.banksThisRun > 0) {
    gameMeta.banksToday += basketballFun.banksThisRun;
    saveMeta(gameMeta);
  }

  const medalStr = formatMedals(winInfo.medals);
  if (winMedalsEl) {
    winMedalsEl.textContent = medalStr;
    winMedalsEl.classList.toggle("hidden", !medalStr);
  }
  winTimeLabel.textContent = winInfo.newRecord
    ? `Time: ${formatTime(elapsed)} — NEW RECORD!`
    : `Time: ${formatTime(elapsed)}`;

  if (currentLevelNum === 1) {
    winTitle.textContent = "Level 1 Complete!";
    winMessage.textContent =
      "You conquered the rainbow obby! Level 2 — Dream Sky is unlocked.";
    continueBtn.textContent = "Level 2 — Dream Sky";
    continueBtn.dataset.next = "2";
    continueBtn.classList.remove("hidden");
    retryBtn.textContent = "Replay Level 1";
  } else if (currentLevelNum === 2) {
    winTitle.textContent = "Level 2 Complete!";
    winMessage.textContent =
      "Dream Sky is done! Enter the Cosmic Factory next.";
    continueBtn.textContent = "Level 3 — Cosmic Factory";
    continueBtn.dataset.next = "3";
    continueBtn.classList.remove("hidden");
    retryBtn.textContent = "Replay Level 2";
  } else if (currentLevelNum === 3) {
    winTitle.textContent = "Level 3 Complete!";
    winMessage.textContent =
      "Cosmic Factory cleared! The Danger Fort awaits — cannons and traps ahead.";
    continueBtn.textContent = "Level 4 — Danger Fort";
    continueBtn.dataset.next = "4";
    continueBtn.classList.remove("hidden");
    retryBtn.textContent = "Replay Level 3";
  } else if (currentLevelNum === 4) {
    winTitle.textContent = "Level 4 Complete!";
    winMessage.textContent =
      "You survived the Danger Fort! The Storm Court awaits — tornadoes, lightning, and basketball!";
    continueBtn.textContent = "Level 5 — Storm Court";
    continueBtn.dataset.next = "5";
    continueBtn.classList.remove("hidden");
    retryBtn.textContent = "Replay Level 4";
  } else if (currentLevelNum === 5) {
    winTitle.textContent = "Level 5 Complete!";
    winMessage.textContent =
      "Three-pointer! The Ultimate Gauntlet awaits — every level's tricks in one run!";
    continueBtn.textContent = "Level 6 — Ultimate Gauntlet";
    continueBtn.dataset.next = "6";
    continueBtn.classList.remove("hidden");
    retryBtn.textContent = "Replay Level 5";
  } else if (currentLevelNum === 6) {
    winTitle.textContent = "Level 6 Complete!";
    winMessage.textContent =
      "Gauntlet conquered! Bonus Level 7 — Bounce Round with 1, 2, and 3-point hoops!";
    continueBtn.textContent = "Level 7 — Bounce Round";
    continueBtn.dataset.next = "7";
    continueBtn.classList.remove("hidden");
    retryBtn.textContent = "Replay Level 6";
  } else if (currentLevelNum === 7) {
    winTitle.textContent = "Level 7 Complete!";
    winMessage.textContent =
      "Bonus round crushed! Level 8 — Moving Court awaits: three lines of sliding hoops!";
    continueBtn.textContent = "Level 8 — Moving Court";
    continueBtn.dataset.next = "8";
    continueBtn.classList.remove("hidden");
    retryBtn.textContent = "Replay Level 7";
  } else {
    winTitle.textContent = `🏀 ${winInfo.title}! 🏆`;
    winMessage.textContent =
      "All 8 levels complete — you've earned the title of Steph Curry!";
    continueBtn.classList.add("hidden");
    retryBtn.textContent = "Play Level 1 Again";
  }

  winScreen.classList.remove("hidden");
  initMetaUI();
  initBallPicker();
}

function onKey(change) {
  return (e) => {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        input.forward = change;
        break;
      case "KeyS":
      case "ArrowDown":
        input.backward = change;
        break;
      case "KeyA":
      case "ArrowLeft":
        input.left = change;
        break;
      case "KeyD":
      case "ArrowRight":
        input.right = change;
        break;
      case "Space":
        input.jump = change;
        if (change) {
          input.jumpPressed = true;
          e.preventDefault();
        }
        break;
      case "ShiftLeft":
      case "ShiftRight":
        if (change) input.dashPressed = true; // one-shot on keydown only
        break;
      case "KeyE":
      case "KeyF":
        if (change) input.actionPressed = true;
        break;
    }
  };
}

window.addEventListener("keydown", onKey(true));
window.addEventListener("keyup", onKey(false));

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || !running) return;
  player.yaw -= e.movementX * 0.0025;
  player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0025, -1.1, 0.4);
});

startBtn.addEventListener("click", () => {
  if (!selectedCharacter) return;
  const levelNum = getStartLevel();
  loadLevel(levelNum);
  startGame(levelNum);
});
retryBtn.addEventListener("click", () => {
  const replay = won && currentLevelNum === 4 ? 1 : currentLevelNum;
  if (replay !== currentLevelNum) loadLevel(replay);
  startGame(replay);
});
continueBtn.addEventListener("click", () => {
  const next = parseInt(continueBtn.dataset.next || "2", 10);
  loadLevel(next);
  startGame(next);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadLevel(1);
initTestMode();
scene.background = currentSky.clone();

async function boot() {
  startBtn.disabled = true;
  startBtn.textContent = "Loading plushies…";
  try {
    await preloadCharacterModels();
  } catch (err) {
    console.error("Some character models failed to load:", err);
  }
  initCharacterPreview();
  initCharacterSelect();
  initMetaUI();
  initBallPicker();
}

boot();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (level) {
    const aimPos = running && !won ? player.mesh.position : null;
    level.update(time, aimPos);
    updateZoneAtmosphere(dt);
  }

  if (juice) juice.update(time);

  if (running && !won) {
    updateCamera();

    const holdingBall = updateShootingAim();

    if (input.actionPressed && level.fireShot && level.canHoldBall?.(player.mesh.position)) {
      const start = getShootStart(player.mesh.position);
      const aimDir = isBonusAimMode() ? getPlayerShootDirection() : null;
      const velocity = level.computeShotVelocity(start, aimDir);
      level.fireShot(start, velocity);
      hideShootVisuals();
    }

    elapsed += dt;
    const simDt = dt * (juice?.getDtScale(time) ?? 1);
    const result = player.update(simDt, input, level);
    if (result === "fall") {
      deathCount += 1;
      if (juice) juice.failClip(time);
      showScoreFlash("WASTED!", true);
    }
    if (result === "win") endGame();
    updateHud();

    if (streakHud) {
      streakHud.textContent = basketballFun.streak > 0
        ? `🔥 Streak ${basketballFun.streak} (×${basketballFun.getMultiplier()})`
        : "";
      streakHud.classList.toggle("hidden", basketballFun.streak < 1);
    }
    if (hypeMeter) {
      hypeMeter.querySelectorAll(".hype-bar").forEach((bar, i) => {
        bar.classList.toggle("lit", i < basketballFun.hypeLevel);
      });
    }

    // Bounce Round HUD
    if (level.getBounceRoundHud) {
      const bh = level.getBounceRoundHud(time);
      if (bh?.active) {
        bounceHud.classList.remove("hidden");
        bounceScoreEl.textContent = String(bh.score);
        bounceGoalEl.textContent = String(bh.goal);
        bounceTimerEl.textContent = formatCountdown(bh.timeLeft);
        bouncePpmEl.textContent = String(bh.ppm);
        if (bounceModsEl) {
          bounceModsEl.textContent = bh.mods ?? "";
          bounceModsEl.classList.toggle("hidden", !bh.mods);
        }
      } else {
        bounceHud.classList.add("hidden");
      }
    } else {
      bounceHud.classList.add("hidden");
    }

    // Shoot prompt & crosshair
    if (!level.basketScored) {
      const onCourt = level.isOnBounceCourt?.(player.mesh.position);
      const bonusActive = level.bonusRoundActive ?? false;
      const showCrosshair = bonusActive && holdingBall;
      crosshair.classList.toggle("hidden", !showCrosshair);

      if (holdingBall) {
        shootPrompt.textContent = "🏀 虚线=轨迹 · E 投篮";
        shootPrompt.classList.remove("hidden");
      } else if ((currentLevelNum === 7 || currentLevelNum === 8) && !bonusActive) {
        shootPrompt.textContent = "🏀 站上球场开始回合";
        shootPrompt.classList.remove("hidden");
      } else {
        shootPrompt.classList.add("hidden");
      }
    } else {
      shootPrompt.classList.add("hidden");
      crosshair.classList.add("hidden");
    }

    // Point popups & round clear
    if (level.lastNearMiss) {
      const nm = level.lastNearMiss;
      if (!nm.shown && time - nm.time < 0.2) {
        nm.shown = true;
        showScoreFlash(basketballFun.nearMissText(), true);
      }
      if (time - nm.time > nm.duration) level.lastNearMiss = null;
    }

    if (level.lastPointPopup) {
      const pop = level.lastPointPopup;
      if (pop.time !== lastPointPopupTime) {
        lastPointPopupTime = pop.time;
        const isScore = pop.text.startsWith("+") || pop.text.includes("PTS");
        showScoreFlash(pop.text, isScore);
        if (isScore) {
          if (juice) juice.celebrate(time);
          player.appearanceGroup.scale.setScalar(1.15);
          setTimeout(() => player.appearanceGroup.scale.setScalar(1), 400);
        }
      }
      if (time - pop.time > pop.duration) level.lastPointPopup = null;
    }

    if (level.basketScored && !wasBasketScored) {
      wasBasketScored = true;
      showScoreFlash("ROUND CLEAR! 🏆");
      bounceHud.classList.add("hidden");
    }
    if (!level.basketScored) wasBasketScored = false;
  } else if (running) {
    shootPrompt.classList.add("hidden");
    crosshair.classList.add("hidden");
    updateHud();
  }

  updateCamera();
  renderCharacterPreview(dt);
  renderer.render(scene, camera);
  input.jumpPressed = false;
  input.dashPressed = false;
  input.actionPressed = false;
}

animate();
