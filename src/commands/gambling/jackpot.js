const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('50/50 chance to double your entire wallet... or lose it all!'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const row = await db.getUser(userId);
    const balance = row.balance;

    if (balance <= 0) {
      return interaction.reply({
        content: 'You have no money in your wallet to risk!',
        ephemeral: true,
      });
    }

    // 50/50 chance
    const won = Math.random() < 0.5;

    if (won) {
      // Double: just add the same amount again
      await db.addBalance(userId, balance);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎉 JACKPOT!')
        .setDescription(
          `You risked everything and **doubled** your wallet!\n\n` +
          `**Before:** ${formatMoney(balance)}\n` +
          `**After:** ${formatMoney(balance * 2)}`
        )
        .setFooter({ text: 'Lucky!' });

      return interaction.reply({ embeds: [embed] });
    } else {
      // Lose everything: subtract the full balance
      await db.addBalance(userId, -balance);

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('💀 You lost everything...')
        .setDescription(
          `You risked it all and lost.\n\n` +
          `**Before:** ${formatMoney(balance)}\n` +
          `**After:** ${formatMoney(0)}`
        )
        .setFooter({ text: 'Better luck next time' });

      return interaction.reply({ embeds: [embed] });
    }
  },
};
