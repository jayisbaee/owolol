// Returns true if a new daily claim should CONTINUE the existing streak
// (claimed within the grace window of the last one), or false if the streak
// is broken and should restart at 1 (first-ever claim also restarts at 1).
function streakContinues(lastDailyDate, graceHours) {
  if (!lastDailyDate) return false;
  const hoursSince = (Date.now() - new Date(lastDailyDate).getTime()) / (1000 * 60 * 60);
  return hoursSince <= graceHours;
}

// Turns a streak count into a reward multiplier bonus (e.g. 0.02 = +2%),
// capped so it can never exceed maxBonus regardless of how long the streak runs.
function computeStreakBonus(streak, bonusPerDay, maxBonus) {
  return Math.min(streak * bonusPerDay, maxBonus);
}

module.exports = { streakContinues, computeStreakBonus };
