import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

// ─── Character definitions ────────────────────────────────────────────────────

export const CHARACTERS = [
  // ── Voxel animals (OBJ, no animation) ──
  { id: "fox",        name: "Fox",        emoji: "🦊", type: "obj", folder: "fox",        color: 0xfb923c },
  { id: "cat",        name: "Cat",        emoji: "🐱", type: "obj", folder: "cat",        color: 0xfb923c },
  { id: "dog",        name: "Dog",        emoji: "🐶", type: "obj", folder: "dog",        color: 0xca8a04 },
  { id: "bunny",      name: "Bunny",      emoji: "🐰", type: "obj", folder: "bunny",      color: 0xf9a8d4 },
  { id: "bear",       name: "Bear",       emoji: "🐻", type: "obj", folder: "bear",       color: 0xa16207 },
  { id: "panda",      name: "Panda",      emoji: "🐼", type: "obj", folder: "panda",      color: 0x1c1917 },
  { id: "penguin",    name: "Penguin",    emoji: "🐧", type: "obj", folder: "penguin",    color: 0x1c1917 },
  { id: "turtle",     name: "Turtle",     emoji: "🐢", type: "obj", folder: "turtle",     color: 0x15803d },
  { id: "frog",       name: "Frog",       emoji: "🐸", type: "obj", folder: "frog",       color: 0x4ade80 },
  { id: "axolotl",    name: "Axolotl",    emoji: "🦎", type: "obj", folder: "axolotl",    color: 0xfb7185 },
  { id: "chicken",    name: "Chicken",    emoji: "🐔", type: "obj", folder: "chicken",    color: 0xfbbf24 },
  { id: "cow",        name: "Cow",        emoji: "🐄", type: "obj", folder: "cow",        color: 0xf5f5f4 },
  { id: "crocodile",  name: "Crocodile",  emoji: "🐊", type: "obj", folder: "crocodile",  color: 0x16a34a },
  { id: "elephant",   name: "Elephant",   emoji: "🐘", type: "obj", folder: "elephant",   color: 0x9ca3af },
  { id: "mole",       name: "Mole",       emoji: "🐭", type: "obj", folder: "mole",       color: 0x78716c },
  { id: "monkey",     name: "Monkey",     emoji: "🐒", type: "obj", folder: "monkey",     color: 0xa16207 },
  { id: "mouse",      name: "Mouse",      emoji: "🐭", type: "obj", folder: "mouse",      color: 0xd4d4d8 },
  { id: "parrot",     name: "Parrot",     emoji: "🦜", type: "obj", folder: "parrot",     color: 0x22c55e },
  { id: "piglet",     name: "Piglet",     emoji: "🐷", type: "obj", folder: "piglet",     color: 0xfda4af },
  { id: "unicorn",    name: "Unicorn",    emoji: "🦄", type: "obj", folder: "unicorn",    color: 0xc084fc },
  // ── Plush animals (FBX, animated) ──
  { id: "plush-bear",  name: "Plush Bear",  emoji: "🧸", type: "fbx", file: "Bear.fbx",  color: 0xa16207 },
  { id: "plush-bunny", name: "Plush Bunny", emoji: "🐰", type: "fbx", file: "Bunny.fbx", color: 0xf9a8d4 },
  { id: "plush-cat",   name: "Plush Cat",   emoji: "😺", type: "fbx", file: "Cat.fbx",   color: 0xfb923c },
  { id: "plush-dog",   name: "Plush Dog",   emoji: "🐕", type: "fbx", file: "Dog.fbx",   color: 0xca8a04 },
];

// ─── Path resolution ──────────────────────────────────────────────────────────

const VOXEL_DIR_CANDIDATES = ["/models/voxel/", "/public/models/voxel/"];
const FBX_DIR_CANDIDATES   = ["/models/plushies/", "/public/models/plushies/"];

async function resolveDir(candidates, probeFile) {
  for (const dir of candidates) {
    try {
      const res = await fetch(dir + probeFile, { method: "HEAD" });
      if (res.ok) return dir;
    } catch { /* next */ }
  }
  throw new Error(`Model dir not found. Tried: ${candidates.join(", ")}`);
}

let voxelDir = null;
let fbxDir   = null;

async function getVoxelDir() { return (voxelDir ??= await resolveDir(VOXEL_DIR_CANDIDATES, "fox/fox.vox.obj")); }
async function getFbxDir()   { return (fbxDir   ??= await resolveDir(FBX_DIR_CANDIDATES, "Bear.fbx")); }

// ─── Loaders ─────────────────────────────────────────────────────────────────

const fbxLoader = new FBXLoader();
const objLoader = new OBJLoader();
const textureLoader = new THREE.TextureLoader();
const cache = new Map();

function loadFbx(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((ok, err) => fbxLoader.load(url, ok, undefined, err)));
  }
  return cache.get(url);
}

/** Load voxel OBJ + its own palette PNG (each animal has a unique texture). */
function loadVoxelObj(objUrl, texturePath, folder) {
  const key = objUrl;
  if (!cache.has(key)) {
    cache.set(key, new Promise((ok, err) => {
      const texUrl = `${texturePath}${folder}.vox.png`;
      textureLoader.load(
        texUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          const templateMat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.85,
            metalness: 0,
          });
          objLoader.load(
            objUrl,
            (obj) => {
              obj.traverse((child) => {
                if (child.isMesh) child.material = templateMat;
              });
              ok(obj);
            },
            undefined,
            err
          );
        },
        undefined,
        err
      );
    }));
  }
  return cache.get(key);
}

/** Instance clone — materials/textures are owned by this clone, safe to dispose. */
function cloneVoxelInstance(source) {
  const root = source.clone(true);
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.userData.voxelInstance = true;
    const cloneMat = (m) => {
      const nm = m.clone();
      if (nm.map) {
        nm.map = nm.map.clone();
        nm.map.colorSpace = THREE.SRGBColorSpace;
        nm.userData.ownedMap = true;
      }
      return nm;
    };
    child.material = Array.isArray(child.material)
      ? child.material.map(cloneMat)
      : cloneMat(child.material);
  });
  return root;
}

// ─── Preload ──────────────────────────────────────────────────────────────────

let preloadPromise = null;

export function preloadCharacterModels() {
  if (!preloadPromise) {
    preloadPromise = (async () => {
      const vDir = await getVoxelDir();
      const fDir = await getFbxDir().catch(() => null);
      const tasks = CHARACTERS.map(async (c) => {
        try {
          if (c.type === "obj") {
            const base = `${vDir}${c.folder}/`;
            const name = `${c.folder}.vox`;
            await loadVoxelObj(`${base}${name}.obj`, base, c.folder);
          } else if (c.type === "fbx" && fDir) {
            await loadFbx(`${fDir}${c.file}`);
          }
        } catch (e) {
          console.warn(`Failed to load ${c.name}:`, e);
        }
      });
      await Promise.all(tasks);
    })();
  }
  return preloadPromise;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLUSH_HEIGHT = 1.6;
const VOXEL_HEIGHT = 1.05;

function enableShadows(root) {
  root.traverse((obj) => {
    if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
  });
}

/** Scale so world-space Y (up) matches target height, then place feet on y=0. */
function fitToHeightY(root, h) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.y < 0.001) return;
  const scale = h / size.y;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y = -box2.min.y;
}

// ─── Model creation ───────────────────────────────────────────────────────────

export async function createCharacterModel(character, height) {
  await preloadCharacterModels();

  if (character.type === "obj") {
    const vDir = await getVoxelDir();
    const base = `${vDir}${character.folder}/`;
    const name = `${character.folder}.vox`;
    const obj = await loadVoxelObj(`${base}${name}.obj`, base, character.folder);
    const root = cloneVoxelInstance(obj);
    // MagicaVoxel OBJ: Y-up, front faces +Z in file. Flip 180° so face points -Z (away from camera).
    const baseRotation = { x: 0, y: Math.PI, z: 0 };
    root.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
    enableShadows(root);
    fitToHeightY(root, height ?? VOXEL_HEIGHT);
    return { root, mixer: null, clips: [], animated: false, baseRotation };
  }

  if (character.type === "fbx") {
    const fDir = await getFbxDir();
    const fbx = await loadFbx(`${fDir}${character.file}`);
    const root = cloneSkinned(fbx);
    const baseRotation = { x: Math.PI / 2, y: Math.PI, z: 0 };
    root.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
    enableShadows(root);
    fitToHeightY(root, height ?? PLUSH_HEIGHT);
    const clips = fbx.animations ?? [];
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(root) : null;
    return { root, mixer, clips, animated: clips.length > 0, baseRotation };
  }

  throw new Error(`Unknown character type: ${character.type}`);
}

// ─── Dispose ──────────────────────────────────────────────────────────────────

export function disposeCharacterRoot(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose();
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m.userData?.ownedMap) m.map?.dispose();
      m.normalMap?.dispose();
      m.dispose();
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function buildPlayerAppearance(group, character, _radius, halfHeight) {
  const h = character.type === "obj" ? VOXEL_HEIGHT : halfHeight * 2;
  const { root, mixer, clips, animated, baseRotation } = await createCharacterModel(character, h);
  group.add(root);
  return { mixer, clips, root, animated, baseRotation };
}

export async function createCharacterPreviewGroup(character, _radius = 0.4, halfHeight = 0.8) {
  const group = new THREE.Group();
  const h = character.type === "obj" ? VOXEL_HEIGHT : halfHeight * 2;
  const { root, mixer, clips } = await createCharacterModel(character, h);
  group.add(root);
  if (mixer && clips.length > 0) {
    const action = mixer.clipAction(clips[0]);
    action.timeScale = 0.45;
    action.play();
    group.userData.mixer = mixer;
  }
  return group;
}
