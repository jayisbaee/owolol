const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setluck')
    .setDescription("[Admin] Set a user's luck stat, biasing their win chance in gambling games")
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Luck value from -100 (cursed) to 100 (blessed)').setRequired(true).setMinValue(-100).setMaxValue(100)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose luck to set (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const amount = interaction.options.getInteger('amount');
    const updated = await db.setLuck(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`🍀 Set **${target.username}**'s luck to **${updated.luck}**.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
