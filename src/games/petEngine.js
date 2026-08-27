// Applies an active pet's win_boost (percentage points, can push chance all
// the way to guaranteed 100%) on top of whatever the base/luck-adjusted
// chance already was. This intentionally bypasses the softer 0.05-0.95 clamp
// used elsewhere for luck — pets are the admin's "make it truly OP" lever.
function applyPetToChance(chance, pet) {
  if (!pet) return chance;
  const boosted = chance + pet.win_boost / 100;
  return Math.min(1, Math.max(0, boosted));
}

// Postgres BIGINT maxes out around 9.22 quintillion — this stays comfortably
// under that no matter how large a bet or multiplier gets combined, so a
// misconfigured pet (or a huge "all" bet) can never overflow the balance
// column and crash the command.
const MAX_SAFE_PAYOUT = 9_000_000_000_000_000; // 9 quadrillion

// Scales a payout by the pet's payout_multiplier (default 1x = no change),
// hard-capped so it's always safe to write to the database.
function applyPetToPayout(payout, pet) {
  if (!pet) return payout;
  const multiplied = payout * pet.payout_multiplier;
  return Math.floor(Math.min(multiplied, MAX_SAFE_PAYOUT));
}

module.exports = { applyPetToChance, applyPetToPayout, MAX_SAFE_PAYOUT };
