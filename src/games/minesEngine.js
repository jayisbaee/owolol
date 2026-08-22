const { randInt } = require('../utils/economyUtils');

// 5 columns x 4 rows = 20 tiles, leaving a 5th button row free for Cash Out
// (Discord caps messages at 5 action rows total).
const COLS = 5;
const ROWS = 4;
const TOTAL_TILES = COLS * ROWS;
const MAX_MULTIPLIER = 16;
const MINE_CHOICES = [1, 3, 5, 8];

// Multiplier climbs smoothly from 1x toward MAX_MULTIPLIER as more safe
// tiles get revealed, reaching exactly MAX_MULTIPLIER once every safe tile
// on the board has been found. More mines -> fewer safe tiles -> the
// multiplier climbs faster per click, which is the risk/reward trade-off.
function multiplierFor(revealed, mines) {
  const safeCount = TOTAL_TILES - mines;
  if (revealed <= 0) return 1;
  return Math.pow(MAX_MULTIPLIER, revealed / safeCount);
}

function pickMinePositions(mines) {
  const positions = new Set();
  while (positions.size < mines) {
    positions.add(randInt(0, TOTAL_TILES - 1));
  }
  return positions;
}

module.exports = { COLS, ROWS, TOTAL_TILES, MAX_MULTIPLIER, MINE_CHOICES, multiplierFor, pickMinePositions };
