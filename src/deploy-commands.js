const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

function loadCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      commands.push(command.data.toJSON());
    }
  }
  return commands;
}

async function main() {
  if (!config.token || !config.clientId) {
    console.error('Missing DISCORD_TOKEN or CLIENT_ID in your environment.');
    process.exit(1);
  }

  const commands = loadCommands();
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    if (config.guildId) {
      console.log(`Registering ${commands.length} commands to guild ${config.guildId}...`);
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
      console.log('Guild commands registered instantly.');
    } else {
      console.log(`Registering ${commands.length} commands globally...`);
      await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
      console.log('Global commands registered (can take up to 1 hour to appear everywhere).');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

main();
