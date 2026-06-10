/** Per-character tiny bonuses — applied in Player.setCharacter */
export const CHARACTER_BONUSES = {
  bear: { label: "Tank — less knockback", knockbackResist: 0.55 },
  "plush-bear": { label: "Tank — less knockback", knockbackResist: 0.55 },
  turtle: { label: "Sturdy shell", knockbackResist: 0.65 },
  cat: { label: "Quick dash", dashCooldownMult: 0.82 },
  "plush-cat": { label: "Quick dash", dashCooldownMult: 0.82 },
  bunny: { label: "Hop master", jumpMult: 1.1 },
  "plush-bunny": { label: "Hop master", jumpMult: 1.1 },
  frog: { label: "Bounce king", bounceMult: 1.2 },
  parrot: { label: "High arc", arcBonus: true },
  unicorn: { label: "Streak bonus", streakMult: 1.15 },
  elephant: { label: "Heavy dash", dashSpeedMult: 1.12 },
  monkey: { label: "Speedy", walkMult: 1.08 },
  penguin: { label: "Ice slide", walkMult: 1.05, dashCooldownMult: 0.9 },
  axolotl: { label: "Lucky swish", swishBonus: 1 },
  crocodile: { label: "Hazard hunter", hazardBonus: true },
};

export function getCharacterBonus(characterId) {
  return CHARACTER_BONUSES[characterId] ?? null;
}
