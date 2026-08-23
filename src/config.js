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
};
