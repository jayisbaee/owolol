const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney, isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removemoney')
    .setDescription("[Admin] Remove coins from your balance or someone else's")
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How many coins to remove').setRequired(true).setMinValue(1)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to remove coins from (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const amount = interaction.options.getInteger('amount');

    const updated = await db.addBalance(target.id, -amount);

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription(`✅ Removed **${formatMoney(amount)}** from **${target.username}**'s balance.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    await interaction.reply({ embeds: [embed] });
  },
};
