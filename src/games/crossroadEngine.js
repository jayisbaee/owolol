// Progressive risk/reward game: each lane crossed raises your multiplier,
// but carries a chance of getting hit. Cash out anytime to lock in your
// current multiplier, or push further for more (and risk losing it all).
const TOTAL_LANES = 10;
const MAX_MULTIPLIER = 15;
const BASE_SURVIVAL_CHANCE = 0.8; // per-lane chance of making it across safely

// Multiplier climbs smoothly from 1x toward MAX_MULTIPLIER as more lanes are
// crossed, reaching exactly MAX_MULTIPLIER at the final lane.
function multiplierFor(lanesCrossed) {
  if (lanesCrossed <= 0) return 1;
  return Math.pow(MAX_MULTIPLIER, lanesCrossed / TOTAL_LANES);
}

module.exports = { TOTAL_LANES, MAX_MULTIPLIER, BASE_SURVIVAL_CHANCE, multiplierFor };
