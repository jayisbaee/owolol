const config = require('../config');

// Idle farming intentionally pays less per minute than actively playing —
// otherwise there'd be no reason to ever manually work/quest/beg again.
const FARM_PENALTY_FACTOR = 0.4;

// Each flavor reuses the real min/max reward and cooldown from that
// command's own config, so farm rates stay consistent with active play and
// only need to be tuned in one place. Only no-risk commands are offered —
// farming implies a guaranteed steady trickle, not a chance of losing money.
const FARM_GAMES = {
  work: {
    label: 'Work',
    emoji: '💼',
    ratePerMinute: ((config.workMin + config.workMax) / 2 / (config.workCooldownMs / 60000)) * FARM_PENALTY_FACTOR,
  },
  quest: {
    label: 'Quest',
    emoji: '🗺️',
    ratePerMinute: ((config.questMin + config.questMax) / 2 / (config.questCooldownMs / 60000)) * FARM_PENALTY_FACTOR,
  },
  beg: {
    label: 'Begging',
    emoji: '🙏',
    ratePerMinute:
      (((config.begMin + config.begMax) / 2) * (1 - config.begNothingChance) / (config.begCooldownMs / 60000)) *
      FARM_PENALTY_FACTOR,
  },
};

const FARM_GAME_KEYS = Object.keys(FARM_GAMES);

// value = minutes. Offered as slash command choices and validated against
// for the prefix version.
const FARM_DURATIONS = [
  { name: '30 minutes', value: 30 },
  { name: '1 hour', value: 60 },
  { name: '2 hours', value: 120 },
  { name: '4 hours', value: 240 },
  { name: '8 hours', value: 480 },
  { name: '12 hours', value: 720 },
  { name: '24 hours', value: 1440 },
];

// Computes earnings for elapsed time, capped at the chosen duration — you
// never earn more than what you signed up for, even if you wait longer
// before claiming.
function computeFarmEarnings(gameKey, elapsedMinutes, durationMinutes) {
  const game = FARM_GAMES[gameKey];
  if (!game) return 0;
  const cappedMinutes = Math.min(elapsedMinutes, durationMinutes);
  return Math.floor(game.ratePerMinute * cappedMinutes);
}

module.exports = { FARM_GAMES, FARM_GAME_KEYS, FARM_DURATIONS, computeFarmEarnings };
