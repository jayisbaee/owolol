const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney, isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setmoney')
    .setDescription("[Admin] Set your balance or someone else's to an exact amount")
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('Balance to set').setRequired(true).setMinValue(0)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose balance to set (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const amount = interaction.options.getInteger('amount');

    const updated = await db.setBalance(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`✅ Set **${target.username}**'s balance to **${formatMoney(updated.balance)}**.`);

    await interaction.reply({ embeds: [embed] });
  },
};
