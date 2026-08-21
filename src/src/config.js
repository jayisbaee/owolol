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
  tenorApiKey: process.env.TENOR_API_KEY || null,
  adminIds,
  prefix: process.env.PREFIX || 'jayjay ',
  currencySymbol: '🪙',
  dailyAmount: 500,
  workMin: 100,
  workMax: 350,
  workCooldownMs: 60 * 60 * 1000, // 1 hour
  dailyCooldownMs: 24 * 60 * 60 * 1000, // 24 hours
};
