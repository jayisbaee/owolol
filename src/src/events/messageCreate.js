const config = require('../config');
const { handlers } = require('../prefixHandler');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith(config.prefix.toLowerCase())) return;

    const withoutPrefix = message.content.slice(config.prefix.length).trim();
    const args = withoutPrefix.split(/\s+/).filter(Boolean);
    const commandName = (args.shift() || '').toLowerCase();

    const handler = handlers[commandName];
    if (!handler) return;

    try {
      await handler(message, args);
    } catch (err) {
      console.error(`Error executing prefix command "${commandName}":`, err);
      await message.reply('⚠️ Something went wrong running that command.').catch(() => {});
    }
  },
};
