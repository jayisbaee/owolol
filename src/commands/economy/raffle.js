const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raffle')
    .setDescription(`Spend 1 ticket for a 1-in-9 shot at the ${new Intl.NumberFormat('en-US').format(config.raffleJackpot)} coin jackpot`),

  async execute(interaction) {
    const userId = interaction.user.id;

    await interaction.deferReply();

    const user = await db.getUser(userId);
    if (user.tickets < 1) {
      return interaction.editReply({
        content: "You don't have any raffle tickets. Ask the bot owner for some!",
      });
    }

    await db.addTickets(userId, -1);

    const winChance = luckAdjustedChance(config.raffleWinChance, user.luck);
    const won = Math.random() < winChance;

    if (won) {
      const updated = await db.addBalance(userId, config.raffleJackpot);
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🎟️ JACKPOT!!!')
        .setDescription(
          `The raffle wheel spins... and lands on **YOU**!\n\n` +
          `You won the jackpot of **${formatMoney(config.raffleJackpot)}**!`
        )
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
      await interaction.editReply({ embeds: [embed] });
    } else {
      const remaining = await db.getUser(userId);
      const embed = new EmbedBuilder()
        .setColor(0x99aab5)
        .setTitle('🎟️ No Luck This Time')
        .setDescription(`The wheel spins... and lands on someone else. Better luck next ticket!`)
        .setFooter({ text: `Tickets remaining: ${remaining.tickets}` });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
