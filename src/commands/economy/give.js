const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give some of your coins to another user')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to give coins to').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How many coins to give').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: "You can't give coins to yourself.", ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: "You can't give coins to a bot.", ephemeral: true });
    }

    const sender = await db.getUser(interaction.user.id);
    if (sender.balance < amount) {
      return interaction.reply({
        content: `You don't have enough coins. Your balance: ${formatMoney(sender.balance)}`,
        ephemeral: true,
      });
    }

    await db.addBalance(interaction.user.id, -amount);
    await db.addBalance(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`🤝 **${interaction.user.username}** gave **${formatMoney(amount)}** to **${target.username}**!`);

    await interaction.reply({ embeds: [embed] });
  },
};
