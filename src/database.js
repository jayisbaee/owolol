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
      last_daily   TIMESTAMPTZ,
      last_work    TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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

module.exports = {
  pool,
  ensureSchema,
  getUser,
  addBalance,
  setBalance,
  setLastDaily,
  setLastWork,
  getLeaderboard,
};
