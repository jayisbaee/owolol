const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const ICONS = require('../../games/icons');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aliases')
    .setDescription("View this server's custom command aliases"),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
    }

    const aliases = await db.getGuildAliases(interaction.guild.id);

    if (aliases.length === 0) {
      return interaction.reply(`This server has no custom aliases yet. Set one with \`/setalias\`.`);
    }

    const lines = aliases.map((a) => `\`${config.prefix}${a.alias}\` → \`${config.prefix}${a.command_name}\``);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setThumbnail(ICONS.help)
      .setTitle(`📖 ${interaction.guild.name}'s Custom Aliases`)
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
  },
};
