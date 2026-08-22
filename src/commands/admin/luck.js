const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('luck')
    .setDescription("[Admin] Check a user's current luck stat")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose luck to check (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const row = await db.getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`🍀 **${target.username}**'s luck: **${row.luck}** (range: -100 to 100, 0 is neutral)`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
