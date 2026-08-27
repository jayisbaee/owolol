const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ICONS = require('../../games/icons');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Check your raffle ticket count')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose tickets to check').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const row = await db.getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.ticket)
      .setDescription(`🎟️ **${target.username}** has **${row.tickets}** raffle ticket${row.tickets === 1 ? '' : 's'}.`);

    await interaction.reply({ embeds: [embed] });
  },
};
