// Solo PvE encounters for /hunt — no target needed, just you vs. the forest.
// Harder monsters give bigger rewards, better crate odds, but lower success chance.
const MONSTERS = [
  { name: 'Squirrel', emoji: '🐿️', minReward: 50, maxReward: 150, successChance: 0.85, crateChance: 0.10, encounterWeight: 40 },
  { name: 'Wild Boar', emoji: '🐗', minReward: 150, maxReward: 350, successChance: 0.75, crateChance: 0.20, encounterWeight: 30 },
  { name: 'Wolf', emoji: '🐺', minReward: 350, maxReward: 700, successChance: 0.60, crateChance: 0.35, encounterWeight: 18 },
  { name: 'Bear', emoji: '🐻', minReward: 700, maxReward: 1400, successChance: 0.45, crateChance: 0.50, encounterWeight: 10 },
  { name: 'Dragon', emoji: '🐉', minReward: 1400, maxReward: 3000, successChance: 0.25, crateChance: 0.85, encounterWeight: 2 },
];

const FLEE_LINES = [
  'You got spooked and ran back home empty-handed.',
  'It got the better of you — you barely escaped.',
  'You tripped over a root and it got away from you.',
  'You fought bravely but had to retreat.',
];

// Picks a monster weighted by encounterWeight — rare monsters like the
// Dragon show up far less often than common ones like the Squirrel.
function pickWeightedMonster() {
  const totalWeight = MONSTERS.reduce((sum, m) => sum + m.encounterWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const monster of MONSTERS) {
    roll -= monster.encounterWeight;
    if (roll <= 0) return monster;
  }
  return MONSTERS[0];
}

module.exports = { MONSTERS, FLEE_LINES, pickWeightedMonster };
