const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ICONS = require('../../games/icons');
const db = require('../../database');
const { formatMoney, randInt } = require('../../utils/economyUtils');
const { applyLuckToReels } = require('../../games/luckEngine');
const { sendAsCasino } = require('../../utils/casinoWebhook');
const { getGif } = require('../../games/gifEngine');

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

    await interaction.deferReply();

    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return interaction.editReply({
        content: `You don't have enough coins. Your balance: ${formatMoney(user.balance)}`,
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
    const gifUrl = await getGif(allMatch ? 'slot machine jackpot win' : 'slot machine spinning');

    const embed = new EmbedBuilder()
      .setColor(color)
      .setThumbnail(ICONS.slots)
      .setTitle('🎰 Slots')
      .setDescription(`[ ${reels.join(' | ')} ]\n\n${resultText}`)
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
