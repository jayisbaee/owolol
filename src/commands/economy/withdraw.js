const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Move coins from your bank back into your wallet')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to withdraw').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const userId = interaction.user.id;

    await interaction.deferReply();

    const user = await db.getUser(userId);
    if (user.bank < amount) {
      return interaction.editReply({
        content: `You don't have that much in your bank. Bank balance: ${formatMoney(user.bank)}`,
      });
    }

    await db.addBank(userId, -amount);
    const updated = await db.addBalance(userId, amount);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`🏦 Withdrew **${formatMoney(amount)}** from your bank.`)
      .addFields(
        { name: 'Wallet', value: formatMoney(updated.balance), inline: true },
        { name: 'Bank', value: formatMoney(updated.bank), inline: true }
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
