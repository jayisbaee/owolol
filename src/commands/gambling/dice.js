const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ICONS = require('../../games/icons');
const db = require('../../database');
const { formatMoney, randInt } = require('../../utils/economyUtils');
const { luckyDiceRoll } = require('../../games/luckEngine');
const { sendAsCasino } = require('../../utils/casinoWebhook');
const { getGif } = require('../../games/gifEngine');

// Bet on whether your roll (1-6) beats the bot's roll (1-6). Ties refund the bet.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Bet coins on a dice roll-off against the house')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const userId = interaction.user.id;

    await interaction.deferReply();

    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return interaction.editReply({
        content: `You don't have enough coins. Your balance: ${formatMoney(user.balance)}`,
      });
    }

    const { outcome, yourRoll, houseRoll } = luckyDiceRoll(user.luck, randInt);

    let delta, resultText, color;
    if (outcome === 'win') {
      delta = amount;
      resultText = `You won **${formatMoney(amount)}**!`;
      color = 0x57f287;
    } else if (outcome === 'loss') {
      delta = -amount;
      resultText = `You lost **${formatMoney(amount)}**.`;
      color = 0xed4245;
    } else {
      delta = 0;
      resultText = `It's a tie — your bet was refunded.`;
      color = 0xf5c518;
    }

    const updated = await db.addBalance(userId, delta);
    const gifUrl = await getGif(
      outcome === 'win' ? 'dice roll win celebration' : outcome === 'loss' ? 'dice roll lose sad' : 'dice tie draw'
    );

    const embed = new EmbedBuilder()
      .setColor(color)
      .setThumbnail(ICONS.dice)
      .setTitle('🎲 Dice Roll-off')
      .setDescription(`You rolled **${yourRoll}**, the house rolled **${houseRoll}**.\n${resultText}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    if (gifUrl) embed.setImage(gifUrl);

    const posted = await sendAsCasino(interaction.channel, { embeds: [embed] });
    if (posted) {
      await interaction.deleteReply().catch(() => {});
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
