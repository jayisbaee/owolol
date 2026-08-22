const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl && config.databaseUrl.includes('railway')
    ? { rejectUnauthorized: false }
    : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
});

// Makes sure the users table exists so you don't have to run schema.sql by hand.
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id      TEXT PRIMARY KEY,
      balance      BIGINT NOT NULL DEFAULT 0,
      bank         BIGINT NOT NULL DEFAULT 0,
      luck         INTEGER NOT NULL DEFAULT 0,
      last_daily   TIMESTAMPTZ,
      last_work    TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Adds the luck column to a database that already had the users table
  // created before this feature existed — harmless no-op if it's already there.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS luck INTEGER NOT NULL DEFAULT 0;`);
}

async function getUser(userId) {
  const { rows } = await pool.query(
    `INSERT INTO users (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId]
  );
  return rows[0];
}

// Adds (or subtracts, with a negative amount) from a user's balance.
// Never lets balance go below 0. Returns the updated row.
async function addBalance(userId, amount) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users
     SET balance = GREATEST(balance + $2, 0)
     WHERE user_id = $1
     RETURNING *`,
    [userId, amount]
  );
  return rows[0];
}

async function setBalance(userId, amount) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users SET balance = $2 WHERE user_id = $1 RETURNING *`,
    [userId, Math.max(0, amount)]
  );
  return rows[0];
}

async function setLastDaily(userId, date) {
  await pool.query(`UPDATE users SET last_daily = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastWork(userId, date) {
  await pool.query(`UPDATE users SET last_work = $2 WHERE user_id = $1`, [userId, date]);
}

async function getLeaderboard(limit = 10) {
  const { rows } = await pool.query(
    `SELECT user_id, balance FROM users ORDER BY balance DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

// Luck is a hidden per-user stat (-100 to 100) that nudges win probability in
// coinflip/dice/slots/jackpot. Owner-only — see the admin luck commands.
async function setLuck(userId, value) {
  await getUser(userId);
  const clamped = Math.max(-100, Math.min(100, value));
  const { rows } = await pool.query(
    `UPDATE users SET luck = $2 WHERE user_id = $1 RETURNING *`,
    [userId, clamped]
  );
  return rows[0];
}

async function addLuck(userId, delta) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users SET luck = GREATEST(-100, LEAST(100, luck + $2)) WHERE user_id = $1 RETURNING *`,
    [userId, delta]
  );
  return rows[0];
}

// Resets every tracked user's balance to 0. Returns how many rows were affected.
async function resetAllBalances() {
  const { rowCount } = await pool.query(`UPDATE users SET balance = 0`);
  return rowCount;
}

// Resets every tracked user's luck stat back to 0 (neutral).
async function resetAllLuck() {
  const { rowCount } = await pool.query(`UPDATE users SET luck = 0`);
  return rowCount;
}

async function getUserCount() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
  return rows[0].count;
}

module.exports = {
  pool,
  ensureSchema,
  getUser,
  addBalance,
  setBalance,
  setLastDaily,
  setLastWork,
  getLeaderboard,
  setLuck,
  addLuck,
  resetAllBalances,
  resetAllLuck,
  getUserCount,
};
