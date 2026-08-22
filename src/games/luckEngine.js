// Converts a base win probability (0-1) plus a user's luck stat (-100 to 100)
// into an adjusted win probability, clamped so no one gets a guaranteed win
// or guaranteed loss no matter how extreme their luck value is.
// luck +100 shifts win chance up by 0.4 (40 percentage points), -100 shifts it down.
function luckAdjustedChance(baseChance, luck) {
  const shift = (luck / 100) * 0.4;
  const adjusted = baseChance + shift;
  return Math.min(0.95, Math.max(0.05, adjusted));
}

// Picks a win/tie/loss outcome for a "your die vs. house die" game weighted by
// luck, then generates two 1-6 values that are visually consistent with that
// outcome (so the displayed dice always match what actually happened).
function luckyDiceRoll(luck, randInt) {
  const tieChance = 1 / 6;
  const winShare = luckAdjustedChance(0.5, luck); // 0.05–0.95
  const r = Math.random();

  let outcome;
  if (r < tieChance) {
    outcome = 'tie';
  } else {
    const remaining = (r - tieChance) / (1 - tieChance);
    outcome = remaining < winShare ? 'win' : 'loss';
  }

  if (outcome === 'tie') {
    const n = randInt(1, 6);
    return { outcome, yourRoll: n, houseRoll: n };
  }
  if (outcome === 'win') {
    const houseRoll = randInt(1, 5);
    const yourRoll = randInt(houseRoll + 1, 6);
    return { outcome, yourRoll, houseRoll };
  }
  const yourRoll = randInt(1, 5);
  const houseRoll = randInt(yourRoll + 1, 6);
  return { outcome, yourRoll, houseRoll };
}

// Nudges a set of 3 slot reels toward (positive luck) or away from (negative
// luck) a match, without guaranteeing an outcome — it's a weighted chance to
// upgrade/downgrade what would have landed naturally.
function applyLuckToReels(reels, luck, symbols, randInt) {
  const boost = luck / 100; // -1 .. 1
  const allMatch = reels[0] === reels[1] && reels[1] === reels[2];
  const anyMatch = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];

  if (boost > 0 && !allMatch) {
    const forceProb = boost * 0.35;
    if (Math.random() < forceProb) {
      reels[2] = reels[0]; // upgrades to at least a two-match, sometimes a three-match if reels[1] already matched reels[0]
    }
  } else if (boost < 0 && anyMatch) {
    const breakProb = -boost * 0.35;
    if (Math.random() < breakProb) {
      let newSymbol;
      do {
        newSymbol = symbols[randInt(0, symbols.length - 1)];
      } while (newSymbol === reels[0] || newSymbol === reels[1]);
      reels[2] = newSymbol;
    }
  }
  return reels;
}

module.exports = { luckAdjustedChance, luckyDiceRoll, applyLuckToReels };
