// Central definition of crate rarities — used by opencrate, givecrate, and
// the daily/quest drop logic so there's only one place to tune the economy.
const RARITIES = {
  common: { label: 'Common', emoji: '📦', color: 0x99aab5, min: 50, max: 150, dropWeight: 60 },
  uncommon: { label: 'Uncommon', emoji: '🎁', color: 0x2ecc71, min: 150, max: 400, dropWeight: 25 },
  rare: { label: 'Rare', emoji: '💠', color: 0x3498db, min: 400, max: 900, dropWeight: 10 },
  epic: { label: 'Epic', emoji: '🔮', color: 0x9b59b6, min: 900, max: 2000, dropWeight: 4 },
  legendary: { label: 'Legendary', emoji: '👑', color: 0xf1c40f, min: 2000, max: 5000, dropWeight: 1 },
};

const RARITY_KEYS = Object.keys(RARITIES);

// Picks a rarity key at random, weighted by each rarity's dropWeight —
// used when quest hands out a random crate.
function pickWeightedRarity() {
  const totalWeight = RARITY_KEYS.reduce((sum, key) => sum + RARITIES[key].dropWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const key of RARITY_KEYS) {
    roll -= RARITIES[key].dropWeight;
    if (roll <= 0) return key;
  }
  return RARITY_KEYS[0];
}

// Rolls a reward within a rarity's [min, max] range, nudged by the user's
// luck stat (-100 to 100) the same way gambling odds are — this is what
// makes /setluck and /addluck double as a "rig the crates" lever.
function luckWeightedReward(min, max, luck) {
  const t = Math.random();
  const bias = luck / 250; // modest pull toward the top or bottom of the range
  const biasedT = Math.min(1, Math.max(0, t + bias));
  return Math.floor(min + biasedT * (max - min));
}

module.exports = { RARITIES, RARITY_KEYS, pickWeightedRarity, luckWeightedReward };
