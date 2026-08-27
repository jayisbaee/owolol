// Applies an active pet's win_boost (percentage points, can push chance all
// the way to guaranteed 100%) on top of whatever the base/luck-adjusted
// chance already was. This intentionally bypasses the softer 0.05-0.95 clamp
// used elsewhere for luck — pets are the admin's "make it truly OP" lever.
function applyPetToChance(chance, pet) {
  if (!pet) return chance;
  const boosted = chance + pet.win_boost / 100;
  return Math.min(1, Math.max(0, boosted));
}

// Scales a payout by the pet's payout_multiplier (default 1x = no change).
function applyPetToPayout(payout, pet) {
  if (!pet) return payout;
  return Math.floor(payout * pet.payout_multiplier);
}

module.exports = { applyPetToChance, applyPetToPayout };
