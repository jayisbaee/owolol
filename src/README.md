# OwO-style Discord Economy Bot

A Discord economy/gambling bot inspired by OwO, built with **discord.js v14** and **PostgreSQL**, ready to deploy on **Railway**.

## Features

- **Economy:** `/balance`, `/daily`, `/work`, `/give`, `/leaderboard`
- **Gambling:** `/coinflip`, `/dice`, `/slots`, `/blackjack` (interactive hit/stand buttons)
- **Admin:** `/addmoney`, `/removemoney`, `/setmoney` — add, remove, or set your own or anyone else's balance (restricted to user IDs in `ADMIN_IDS`)

This is a **virtual currency** system for fun server engagement — no real money is involved anywhere in this code.

---

## 1. Create the Discord bot application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Go to **Bot** → **Reset Token** → copy it (this is your `DISCORD_TOKEN`). Keep it secret.
3. On the same Bot page, make sure **Public Bot** is on if you want others to invite it.
4. Go to **OAuth2 → General** and copy the **Application (Client) ID** — this is your `CLIENT_ID`.
5. Go to **OAuth2 → URL Generator**, check `bot` and `applications.commands` scopes, and under bot permissions check `Send Messages`, `Embed Links`, `Use Slash Commands`. Use the generated URL to invite the bot to your server.

## 2. Get your Discord user ID (for admin commands)

Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode), then right-click your own name and **Copy User ID**. Put this in `ADMIN_IDS` (comma-separate multiple IDs for multiple admins).

## 3. Push this project to GitHub

```bash
cd owo-clone-bot
git init
git add .
git commit -m "Initial commit: OwO-style economy bot"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 4. Deploy on Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select your repo.
2. **Add a database:** in the same project, click **+ New** → **Database** → **Add PostgreSQL**. Railway automatically creates a `DATABASE_URL` variable and — importantly — makes it available to your bot service if you reference it (Railway usually auto-links it; if not, copy the Postgres service's `DATABASE_URL` into your bot service's variables).
3. Go to your bot **service → Variables** and add:
   - `DISCORD_TOKEN` — your bot token
   - `CLIENT_ID` — your application client ID
   - `ADMIN_IDS` — your Discord user ID (comma-separated for multiple)
   - `GUILD_ID` — *(optional, recommended while testing)* your server ID, so slash commands register instantly instead of waiting up to an hour globally
   - `DATABASE_URL` — should already be populated if you linked the Postgres plugin
4. Railway will build and start the bot automatically using `npm start` (defined in `railway.json`).

## 5. Register the slash commands

Slash commands need to be registered with Discord once (and again any time you add/change a command). Run this **locally** with the same `.env` values, or as a one-off Railway command:

```bash
npm install
npm run deploy-commands
```

If you set `GUILD_ID`, commands appear in that server within seconds. Without it, they register globally and can take up to an hour to show up everywhere.

## 6. Local development

```bash
cp .env.example .env
# fill in .env with your real values
npm install
npm run deploy-commands   # registers slash commands
npm start                 # starts the bot
```

You'll need a Postgres database for local dev too — the quickest option is spinning up a free one on Railway or [Neon](https://neon.tech) and pointing `DATABASE_URL` at it. The bot auto-creates its table on startup, so you don't need to run `schema.sql` manually (it's included for reference/manual setup).

---

## Project structure

```
src/
  index.js                 # bot entry point — loads commands & events, logs in
  deploy-commands.js       # registers slash commands with Discord
  config.js                # env vars & tunable settings (payouts, cooldowns)
  database.js              # Postgres queries (balance get/set/add, leaderboard)
  commands/
    economy/                balance, daily, work, give, leaderboard
    gambling/                coinflip, dice, slots, blackjack
    admin/                   addmoney, removemoney, setmoney
  events/
    ready.js, interactionCreate.js
```

## Extending it

Ideas for next features, roughly in order of how OwO-like they'd feel:
- `/rob` — chance to steal coins from another user, with a cooldown and fail penalty
- A shop system (items table + `/shop`, `/buy`, `/inventory`)
- Pet/hunting/battle mechanics
- Server-wide multipliers or events
- A `/bank deposit` / `/bank withdraw` split so robbed coins can't touch banked money (the `bank` column already exists in the schema for this)

Each of these fits the same pattern: add a command file under the right folder in `src/commands/`, add any new columns/tables to `database.js`, then run `npm run deploy-commands` again.
