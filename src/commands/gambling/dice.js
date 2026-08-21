const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney, randInt } = require('../../utils/economyUtils');
const { getGif } = require('../../utils/gifUtils');

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

    const yourRoll = randInt(1, 6);
    const houseRoll = randInt(1, 6);

    let delta, resultText, color;
    if (yourRoll > houseRoll) {
      delta = amount;
      resultText = `You won **${formatMoney(amount)}**!`;
      color = 0x57f287;
    } else if (yourRoll < houseRoll) {
      delta = -amount;
      resultText = `You lost **${formatMoney(amount)}**.`;
      color = 0xed4245;
    } else {
      delta = 0;
      resultText = `It's a tie — your bet was refunded.`;
      color = 0xf5c518;
    }

    const updated = await db.addBalance(userId, delta);
    const gifUrl = delta > 0
      ? await getGif('win', 'dice roll win celebration')
      : delta < 0
      ? await getGif('lose', 'dice roll lose sad')
      : null;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🎲 Dice Roll-off')
      .setDescription(`You rolled **${yourRoll}**, the house rolled **${houseRoll}**.\n${resultText}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    if (gifUrl) embed.setImage(gifUrl);

    await interaction.editReply({ embeds: [embed] });
  },
};
