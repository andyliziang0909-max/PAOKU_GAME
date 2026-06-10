const COMMENTATOR_3PT = ["FROM THE LOGO!", "BANG!", "OH MY!", "SPLASH!", "DEEP!"];
const COMMENTATOR_2PT = ["Nice!", "Clean!", "Money!", "In the pocket!"];
const COMMENTATOR_BANK = ["BANK!", "Off the glass!", "Glass work!"];
const COMMENTATOR_SWISH = ["SWISH!", "Pure!", "Nothing but net!"];
const COMMENTATOR_BOSS = ["BOSS HOOP!", "GIANT BUCKET!"];
const COMMENTATOR_SECRET = ["SECRET HOOP!", "HIDDEN GEM!"];
const COMMENTATOR_HOT = ["HOT POTATO!", "Right on time!"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class BasketballFunState {
  constructor() {
    this.streak = 0;
    this.bestStreak = 0;
    this.banksThisRun = 0;
    this.hypeLevel = 0;
  }

  reset() {
    this.streak = 0;
    this.hypeLevel = 0;
    this.banksThisRun = 0;
  }

  getMultiplier() {
    if (this.streak >= 4) return 2.5;
    if (this.streak >= 3) return 2;
    if (this.streak >= 2) return 1.5;
    return 1;
  }

  getStreakLabel() {
    if (this.streak >= 4) return "UNSTOPPABLE!";
    if (this.streak >= 3) return "ON FIRE!";
    if (this.streak >= 2) return "HEATING UP!";
    return null;
  }

  /**
   * @param {number} basePoints
   * @param {object} meta - trick, hotPotato, boss, secret, hazard, bounce, characterBonus
   * @param {object} levelMods - pointMult from roguelite
   */
  processScore(basePoints, meta = {}, levelMods = {}) {
    this.streak += 1;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;

    let mult = this.getMultiplier();
    if (levelMods.pointMult) mult *= levelMods.pointMult;
    if (meta.characterStreakMult) mult *= meta.characterStreakMult;

    let bonusFlat = 0;
    if (meta.trick === "bank") {
      bonusFlat += 1;
      this.banksThisRun += 1;
    }
    if (meta.trick === "swish") bonusFlat += 2;
    if (meta.trick === "bounce") bonusFlat += 1;
    if (meta.hotPotato) bonusFlat += 2;
    if (meta.boss) bonusFlat = 0; // boss uses fixed points
    if (meta.secret) bonusFlat += 5;
    if (meta.hazard) bonusFlat += 2;

    const points = meta.boss
      ? basePoints
      : Math.max(1, Math.round(basePoints * mult) + bonusFlat);

    this.hypeLevel = Math.min(3, Math.floor(this.streak / 2));

    let call = pick(COMMENTATOR_2PT);
    if (meta.boss) call = pick(COMMENTATOR_BOSS);
    else if (meta.secret) call = pick(COMMENTATOR_SECRET);
    else if (meta.hotPotato) call = pick(COMMENTATOR_HOT);
    else if (meta.trick === "bank") call = pick(COMMENTATOR_BANK);
    else if (meta.trick === "swish") call = pick(COMMENTATOR_SWISH);
    else if (basePoints >= 3) call = pick(COMMENTATOR_3PT);

    const streakLabel = this.getStreakLabel();
    const text = streakLabel
      ? `+${points} ${call} · ${streakLabel}`
      : `+${points} ${call}`;

    return {
      points,
      text,
      streak: this.streak,
      streakLabel,
      banks: this.banksThisRun,
      hypeLevel: this.hypeLevel,
    };
  }

  onMiss() {
    this.streak = 0;
    this.hypeLevel = 0;
  }

  nearMissText() {
    return "RIM!";
  }
}

/** Shared scoring hook for bonus levels */
export function registerBasketScore(level, basePoints, meta, time, funState, levelMods = {}) {
  const charBonus = meta.characterStreakMult ? { characterStreakMult: meta.characterStreakMult } : {};
  const result = funState.processScore(basePoints, { ...meta, ...charBonus }, levelMods);
  level.bonusRoundScore += result.points;
  level.lastPointPopup = { text: result.text, time, duration: 1.35, hype: result.hypeLevel };

  if (level.bonusRoundActive && level.bonusRoundScore >= level.bonusMinScore) {
    if (level.endBonusRound) level.endBonusRound(time);
    else if (level._onRoundWon) level._onRoundWon(level.getPointsPerMinute?.(time) ?? 0);
  }

  if (level.onCrowdCheer) level.onCrowdCheer(time);
  if (level.onHoopReact) level.onHoopReact(meta.hoop, time);

  return result;
}

export function detectTrickType(rimTouch, boardTouch) {
  if (rimTouch && !boardTouch) return "swish";
  if (boardTouch) return "bank";
  return "touch";
}
