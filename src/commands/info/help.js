const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { buildHelpDescription } = require('../../games/helpText');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List every command the bot supports, slash and prefix'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📖 Commands')
      .setDescription(buildHelpDescription(config.prefix));

    await interaction.reply({ embeds: [embed] });
  },
};
