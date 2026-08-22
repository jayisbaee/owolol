const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeluck')
    .setDescription("[Admin] Remove from a user's luck stat (cursing them toward worse odds)")
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much luck to remove').setRequired(true).setMinValue(1)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose luck to adjust (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const amount = interaction.options.getInteger('amount');
    const updated = await db.addLuck(target.id, -amount);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`🍀 Removed **${amount}** luck from **${target.username}**. New luck: **${updated.luck}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
