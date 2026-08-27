const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ICONS = require('../../games/icons');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givetickets')
    .setDescription('[Admin] Give raffle tickets to yourself or another user')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How many tickets to give').setRequired(true).setMinValue(1)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to give tickets to (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');
    const target = interaction.options.getUser('user') || interaction.user;

    const updated = await db.addTickets(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.ticket)
      .setDescription(`🎟️ Gave **${amount}x Raffle Ticket${amount === 1 ? '' : 's'}** to **${target.username}**. They now have **${updated.tickets}**.`);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
