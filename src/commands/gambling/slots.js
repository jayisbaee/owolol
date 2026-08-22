const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney, randInt } = require('../../utils/economyUtils');
const { applyLuckToReels } = require('../../games/luckEngine');

const SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎'];
// Payout multiplier when all 3 reels match, keyed by symbol.
const MULTIPLIERS = { '🍒': 2, '🍋': 3, '🍇': 4, '🔔': 6, '⭐': 10, '💎': 25 };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const userId = interaction.user.id;

    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return interaction.reply({
        content: `You don't have enough coins. Your balance: ${formatMoney(user.balance)}`,
        ephemeral: true,
      });
    }

    const reels = applyLuckToReels(
      [0, 0, 0].map(() => SYMBOLS[randInt(0, SYMBOLS.length - 1)]),
      user.luck,
      SYMBOLS,
      randInt
    );
    const allMatch = reels[0] === reels[1] && reels[1] === reels[2];
    const twoMatch = !allMatch && (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]);

    let delta, resultText, color;
    if (allMatch) {
      const mult = MULTIPLIERS[reels[0]];
      delta = amount * mult;
      resultText = `JACKPOT! All three match for a **${mult}x** payout — you won **${formatMoney(delta)}**!`;
      color = 0x57f287;
    } else if (twoMatch) {
      delta = Math.floor(amount * 0.5);
      resultText = `Two matched — small win! You got back **${formatMoney(delta)}**.`;
      color = 0xf5c518;
    } else {
      delta = -amount;
      resultText = `No match. You lost **${formatMoney(amount)}**.`;
      color = 0xed4245;
    }

    const updated = await db.addBalance(userId, delta);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🎰 Slots')
      .setDescription(`[ ${reels.join(' | ')} ]\n\n${resultText}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    await interaction.reply({ embeds: [embed] });
  },
};
