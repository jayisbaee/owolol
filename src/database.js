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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_quest TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_rob TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_beg TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_crime TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS crates_common INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS crates_uncommon INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS crates_rare INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS crates_epic INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS crates_legendary INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS drills INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_vaultbreak TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_hunt TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tickets INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_pet_id INTEGER;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_game TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_started_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS farm_duration_minutes INTEGER;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0;`);

  // Pets are admin-defined custom creatures — see the pet engine and admin
  // commands for how win_boost and payout_multiplier get applied in games.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pets (
      id                SERIAL PRIMARY KEY,
      owner_id          TEXT NOT NULL,
      name              TEXT NOT NULL,
      win_boost         REAL NOT NULL DEFAULT 0,
      payout_multiplier REAL NOT NULL DEFAULT 1,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Per-server custom command aliases (e.g. "cr" -> "crates"). Managed by
  // anyone with Discord's Manage Server permission in that guild — separate
  // from the bot owner's global ADMIN_IDS.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_aliases (
      guild_id      TEXT NOT NULL,
      alias         TEXT NOT NULL,
      command_name  TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (guild_id, alias)
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
// Postgres BIGINT's real ceiling, minus headroom — clamping here means no
// caller anywhere in the codebase can ever crash this query with an
// out-of-range value, even if a future feature forgets its own safety cap.
const BIGINT_SAFE_MAX = 9_000_000_000_000_000_000;

async function addBalance(userId, amount) {
  await getUser(userId);
  const safeAmount = Math.max(-BIGINT_SAFE_MAX, Math.min(BIGINT_SAFE_MAX, Math.trunc(amount)));
  const { rows } = await pool.query(
    `UPDATE users
     SET balance = GREATEST(LEAST(balance + $2, ${BIGINT_SAFE_MAX}), 0)
     WHERE user_id = $1
     RETURNING *`,
    [userId, safeAmount]
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

// Adds (or subtracts, with a negative amount) to a user's bank. Never lets
// bank go below 0. Returns the updated row. Bank is untouched by /rob and
// only vulnerable to /vaultbreak, which requires an electric drill.
async function addBank(userId, amount) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users
     SET bank = GREATEST(bank + $2, 0)
     WHERE user_id = $1
     RETURNING *`,
    [userId, amount]
  );
  return rows[0];
}

// Adds (or removes, with a negative amount) electric drills — consumable
// items bought from the shop and spent one-per-attempt on /vaultbreak.
async function addDrills(userId, amount) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users SET drills = GREATEST(drills + $2, 0) WHERE user_id = $1 RETURNING *`,
    [userId, amount]
  );
  return rows[0];
}

async function setLastVaultbreak(userId, date) {
  await pool.query(`UPDATE users SET last_vaultbreak = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastHunt(userId, date) {
  await pool.query(`UPDATE users SET last_hunt = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastDaily(userId, date) {
  await pool.query(`UPDATE users SET last_daily = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastWork(userId, date) {
  await pool.query(`UPDATE users SET last_work = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastQuest(userId, date) {
  await pool.query(`UPDATE users SET last_quest = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastRob(userId, date) {
  await pool.query(`UPDATE users SET last_rob = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastBeg(userId, date) {
  await pool.query(`UPDATE users SET last_beg = $2 WHERE user_id = $1`, [userId, date]);
}

async function setLastCrime(userId, date) {
  await pool.query(`UPDATE users SET last_crime = $2 WHERE user_id = $1`, [userId, date]);
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

// Whitelisted column lookup — never build this from raw user input, since it's
// interpolated directly into SQL below. Rarity keys must match src/games/crateEngine.js.
const CRATE_COLUMNS = {
  common: 'crates_common',
  uncommon: 'crates_uncommon',
  rare: 'crates_rare',
  epic: 'crates_epic',
  legendary: 'crates_legendary',
};

// Adds (or removes, with a negative amount) crates of a given rarity for a
// user. Never lets the count go below 0. Returns the updated row.
async function addCrates(userId, rarityKey, amount) {
  const column = CRATE_COLUMNS[rarityKey];
  if (!column) throw new Error(`Unknown crate rarity: ${rarityKey}`);
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users SET ${column} = GREATEST(${column} + $2, 0) WHERE user_id = $1 RETURNING *`,
    [userId, amount]
  );
  return rows[0];
}

// Adds (or removes, with a negative amount) raffle tickets — a separate
// currency spent one-per-play on /raffle. Never lets the count go below 0.
async function addTickets(userId, amount) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users SET tickets = GREATEST(tickets + $2, 0) WHERE user_id = $1 RETURNING *`,
    [userId, amount]
  );
  return rows[0];
}

// Creates a new custom pet owned by a user. winBoost is percentage points
// added directly to win chance (can push all the way to guaranteed 100%
// regardless of base odds or luck — this is the "make it OP" lever).
// payoutMultiplier scales winnings on top of that.
async function createPet(ownerId, name, winBoost, payoutMultiplier) {
  await getUser(ownerId);
  const { rows } = await pool.query(
    `INSERT INTO pets (owner_id, name, win_boost, payout_multiplier)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [ownerId, name, winBoost, payoutMultiplier]
  );
  return rows[0];
}

async function getPetsByOwner(ownerId) {
  const { rows } = await pool.query(
    `SELECT * FROM pets WHERE owner_id = $1 ORDER BY created_at`,
    [ownerId]
  );
  return rows;
}

// Case-insensitive lookup across ALL pets (any owner) — used by /givepet to
// clone an existing pet's stats onto a new owner.
async function findPetByName(name) {
  const { rows } = await pool.query(
    `SELECT * FROM pets WHERE LOWER(name) = LOWER($1) ORDER BY created_at LIMIT 1`,
    [name]
  );
  return rows[0] || null;
}

// Case-insensitive lookup scoped to one owner — used by /equippet.
async function findOwnedPetByName(ownerId, name) {
  const { rows } = await pool.query(
    `SELECT * FROM pets WHERE owner_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [ownerId, name]
  );
  return rows[0] || null;
}

async function setActivePet(userId, petId) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users SET active_pet_id = $2 WHERE user_id = $1 RETURNING *`,
    [userId, petId]
  );
  return rows[0];
}

// Returns the user's currently equipped pet row, or null if they don't have
// one active. This is what game commands check to apply pet effects.
async function getActivePet(userId) {
  const { rows } = await pool.query(
    `SELECT p.* FROM users u
     JOIN pets p ON p.id = u.active_pet_id
     WHERE u.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

// Sets (or overwrites) a per-server alias, e.g. guildId, "cr", "crates".
async function setGuildAlias(guildId, alias, commandName) {
  const { rows } = await pool.query(
    `INSERT INTO guild_aliases (guild_id, alias, command_name)
     VALUES ($1, LOWER($2), $3)
     ON CONFLICT (guild_id, alias) DO UPDATE SET command_name = EXCLUDED.command_name
     RETURNING *`,
    [guildId, alias, commandName]
  );
  return rows[0];
}

async function removeGuildAlias(guildId, alias) {
  const { rowCount } = await pool.query(
    `DELETE FROM guild_aliases WHERE guild_id = $1 AND alias = LOWER($2)`,
    [guildId, alias]
  );
  return rowCount > 0;
}

async function getGuildAliases(guildId) {
  const { rows } = await pool.query(
    `SELECT * FROM guild_aliases WHERE guild_id = $1 ORDER BY alias`,
    [guildId]
  );
  return rows;
}

// Looks up a single alias for one server. Returns the real command name, or
// null if this server hasn't defined that alias.
async function resolveGuildAlias(guildId, alias) {
  const { rows } = await pool.query(
    `SELECT command_name FROM guild_aliases WHERE guild_id = $1 AND alias = LOWER($2) LIMIT 1`,
    [guildId, alias]
  );
  return rows[0]?.command_name || null;
}

// Starts a new autofarm session, overwriting any previous one.
async function startFarm(userId, game, durationMinutes) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users
     SET farm_game = $2, farm_started_at = now(), farm_duration_minutes = $3
     WHERE user_id = $1
     RETURNING *`,
    [userId, game, durationMinutes]
  );
  return rows[0];
}

// Clears an autofarm session (after claiming it).
async function clearFarm(userId) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users
     SET farm_game = NULL, farm_started_at = NULL, farm_duration_minutes = NULL
     WHERE user_id = $1
     RETURNING *`,
    [userId]
  );
  return rows[0];
}

async function setDailyStreak(userId, streak) {
  await getUser(userId);
  const { rows } = await pool.query(
    `UPDATE users SET daily_streak = $2 WHERE user_id = $1 RETURNING *`,
    [userId, streak]
  );
  return rows[0];
}

module.exports = {
  pool,
  ensureSchema,
  getUser,
  addBalance,
  setBalance,
  addBank,
  addDrills,
  setLastDaily,
  setLastWork,
  setLastQuest,
  setLastRob,
  setLastBeg,
  setLastCrime,
  setLastVaultbreak,
  setLastHunt,
  getLeaderboard,
  setLuck,
  addLuck,
  resetAllBalances,
  resetAllLuck,
  getUserCount,
  addCrates,
  addTickets,
  createPet,
  getPetsByOwner,
  findPetByName,
  findOwnedPetByName,
  setActivePet,
  getActivePet,
  setGuildAlias,
  removeGuildAlias,
  getGuildAliases,
  resolveGuildAlias,
  startFarm,
  clearFarm,
  setDailyStreak,
};
