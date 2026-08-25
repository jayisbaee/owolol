require('dotenv').config();

const adminIds = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  databaseUrl: process.env.DATABASE_URL,
  adminIds,
  prefix: process.env.PREFIX || 'jayjay ',
  currencySymbol: '🪙',
  dailyAmount: 500,
  workMin: 100,
  workMax: 350,
  workCooldownMs: 60 * 60 * 1000, // 1 hour
  dailyCooldownMs: 24 * 60 * 60 * 1000, // 24 hours
  questMin: 150,
  questMax: 400,
  questCooldownMs: 20 * 60 * 1000, // 20 minutes — faster than work, for quick grinding
  robCooldownMs: 30 * 60 * 1000, // 30 minutes
  robMinTargetBalance: 100, // victim needs at least this much to be worth robbing
  robMinStealPct: 0.10,
  robMaxStealPct: 0.25,
  robFailPenaltyPct: 0.10, // robber loses this % of their own balance if caught
  begMin: 5,
  begMax: 60,
  begCooldownMs: 5 * 60 * 1000, // 5 minutes — very fast, small filler income
  begNothingChance: 0.25, // chance of getting nothing at all, for flavor
  crimeMin: 300,
  crimeMax: 700,
  crimeCooldownMs: 15 * 60 * 1000, // 15 minutes
  crimeSuccessChance: 0.55,
  crimeFailPenaltyPct: 0.15, // % of current balance lost as a "fine" on failure
  questCrateChance: 0.4, // chance /quest also drops a random-rarity crate
  luckUpgradeCost: 5000,
  luckUpgradeAmount: 5, // luck gained per purchase (capped at 100 overall)
  drillCost: 2000,
  vaultbreakCooldownMs: 45 * 60 * 1000, // 45 minutes
  vaultbreakMinTargetBank: 200, // victim's bank needs at least this much to be worth cracking
  vaultbreakSuccessChance: 0.3, // lower than /rob — banks are meant to be safer
  vaultbreakMinStealPct: 0.05,
  vaultbreakMaxStealPct: 0.15,
  huntCooldownMs: 10 * 60 * 1000, // 10 minutes — fast, no penalty on loss
};
