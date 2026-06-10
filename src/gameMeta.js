const STORAGE_KEY = "obbygame_meta_v1";

export const TITLES = [
  { minLevels: 0, minPoints: 0, name: "Rookie" },
  { minLevels: 2, minPoints: 40, name: "Bench Warmer" },
  { minLevels: 4, minPoints: 120, name: "Sixth Man" },
  { minLevels: 6, minPoints: 280, name: "Splash Brother" },
  { minLevels: 8, minPoints: 500, name: "Steph Curry" },
];

/** Gold medal par times (seconds) per level */
export const PAR_TIMES = {
  1: 200, 2: 260, 3: 300, 4: 340, 5: 380, 6: 420, 7: 90, 8: 120,
};

export const BALL_SKINS = {
  classic: { label: "Classic", color: 0xff6b1a, emissive: 0xff6600, radiusMult: 1, unlockAt: 0 },
  gold: { label: "Gold Ball", color: 0xffd700, emissive: 0xffaa00, radiusMult: 1.05, unlockAt: 3 },
  galaxy: { label: "Galaxy", color: 0x818cf8, emissive: 0xa78bfa, radiusMult: 1.08, unlockAt: 6 },
  mini: { label: "Mini Ball", color: 0xf472b6, emissive: 0xec4899, radiusMult: 0.72, unlockAt: 8 },
};

const DAILY_POOL = [
  { text: "Score 12 pts in Bounce Round (Level 7)", level: 7, goal: 12 },
  { text: "Score 15 pts on Moving Court (Level 8)", level: 8, goal: 15 },
  { text: "Hit a 3-streak in any bonus round", type: "streak", goal: 3 },
  { text: "Bank 3 shots off the glass", type: "banks", goal: 3 },
  { text: "Beat Level 5 under par time", level: 5, type: "par" },
  { text: "Score 18 pts on Moving Court (Level 8)", level: 8, goal: 18 },
];

function defaultMeta() {
  return {
    bestTimes: {},
    bestBonusScores: {},
    medals: {},
    unlockedBalls: ["classic"],
    selectedBall: "classic",
    totalPoints: 0,
    levelsBeat: 0,
    dailyDate: "",
    dailyDone: false,
    dailyProgress: {},
    banksToday: 0,
    bestStreak: 0,
  };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMeta();
    return { ...defaultMeta(), ...JSON.parse(raw) };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export function getTitle(meta) {
  let title = TITLES[0].name;
  for (const t of TITLES) {
    if (meta.levelsBeat >= t.minLevels && meta.totalPoints >= t.minPoints) title = t.name;
  }
  return title;
}

export function getDailyChallenge() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const seed = dateStr.split("-").reduce((a, b) => a + parseInt(b, 10), 0);
  return { date: dateStr, challenge: DAILY_POOL[seed % DAILY_POOL.length] };
}

export function syncDaily(meta) {
  const daily = getDailyChallenge();
  if (meta.dailyDate !== daily.date) {
    meta.dailyDate = daily.date;
    meta.dailyDone = false;
    meta.dailyProgress = {};
    meta.banksToday = 0;
  }
  return daily;
}

export function unlockBallsForProgress(meta) {
  for (const [id, skin] of Object.entries(BALL_SKINS)) {
    if (skin.unlockAt <= meta.levelsBeat && !meta.unlockedBalls.includes(id)) {
      meta.unlockedBalls.push(id);
    }
  }
}

export function recordLevelWin(meta, levelNum, elapsed, deathCount, bonusScore = 0) {
  const par = PAR_TIMES[levelNum] ?? 999;
  const medals = meta.medals[levelNum] ?? { bronze: false, silver: false, gold: false };
  medals.bronze = true;
  if (deathCount === 0) medals.silver = true;
  if (elapsed <= par) medals.gold = true;
  meta.medals[levelNum] = medals;

  const prevBest = meta.bestTimes[levelNum];
  const newRecord = prevBest === undefined || elapsed < prevBest;
  if (newRecord) meta.bestTimes[levelNum] = elapsed;
  if (bonusScore > 0) {
    const prev = meta.bestBonusScores[levelNum] ?? 0;
    if (bonusScore > prev) meta.bestBonusScores[levelNum] = bonusScore;
  }

  if (levelNum > meta.levelsBeat) meta.levelsBeat = levelNum;
  meta.totalPoints += Math.round(50 + bonusScore);
  unlockBallsForProgress(meta);
  saveMeta(meta);
  return {
    medals,
    newRecord,
    title: getTitle(meta),
  };
}

export function formatMedals(medals) {
  const parts = [];
  if (medals.gold) parts.push("🥇 Gold");
  if (medals.silver) parts.push("🥈 Silver");
  if (medals.bronze) parts.push("🥉 Bronze");
  return parts.join(" · ") || "";
}

export function getBallSkin(id) {
  return BALL_SKINS[id] ?? BALL_SKINS.classic;
}
