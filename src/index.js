const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const config = require('./config');
const db = require('./database');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// Load every command file from src/commands/<category>/*.js
const commandsPath = path.join(__dirname, 'commands');
for (const category of fs.readdirSync(commandsPath)) {
  const categoryPath = path.join(commandsPath, category);
  for (const file of fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(categoryPath, file));
    client.commands.set(command.data.name, command);
  }
}

// Load every event file from src/events/*.js
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

async function main() {
  if (!config.token) {
    console.error('DISCORD_TOKEN is not set. Check your environment variables.');
    process.exit(1);
  }
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set. Add a Postgres database and connect it.');
    process.exit(1);
  }

  await db.ensureSchema();
  await client.login(config.token);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
