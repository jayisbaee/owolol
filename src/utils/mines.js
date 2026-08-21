const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../../database');
const { formatMoney, randInt } = require('../../utils/economyUtils');

// 5 columns x 4 rows = 20 tiles, leaving a 5th button row free for Cash Out
// (Discord caps messages at 5 action rows total).
const COLS = 5;
const ROWS = 4;
const TOTAL_TILES = COLS * ROWS;
const MAX_MULTIPLIER = 16;

const MINE_CHOICES = [1, 3, 5, 8];

// Multiplier climbs smoothly from 1x toward MAX_MULTIPLIER as more safe
// tiles get revealed, reaching exactly MAX_MULTIPLIER once every safe tile
// on the board has been found. More mines -> fewer safe tiles -> the
// multiplier climbs faster per click, which is the risk/reward trade-off.
function multiplierFor(revealed, mines) {
  const safeCount = TOTAL_TILES - mines;
  if (revealed <= 0) return 1;
  return Math.pow(MAX_MULTIPLIER, revealed / safeCount);
}

function pickMinePositions(mines) {
  const positions = new Set();
  while (positions.size < mines) {
    positions.add(randInt(0, TOTAL_TILES - 1));
  }
  return positions;
}

function buildGrid({ minePositions, revealed, gameOver, revealMines }) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const isMine = minePositions.has(idx);
      const isRevealed = revealed.has(idx);

      let style = ButtonStyle.Secondary;
      let emoji = '⬜';
      let disabled = gameOver;

      if (isRevealed) {
        style = ButtonStyle.Success;
        emoji = '💎';
        disabled = true;
      } else if (gameOver && revealMines && isMine) {
        style = ButtonStyle.Danger;
        emoji = '💣';
        disabled = true;
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mines_tile_${idx}`)
          .setEmoji(emoji)
          .setStyle(style)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }

  const cashOutRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mines_cashout')
      .setLabel('💰 Cash Out')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(gameOver || revealed.size === 0)
  );
  rows.push(cashOutRow);

  return rows;
}

function buildEmbed({ amount, mines, revealed, statusText, color, gameOver }) {
  const mult = multiplierFor(revealed.size, mines);
  const potential = Math.floor(amount * mult);

  const embed = new EmbedBuilder()
    .setColor(color || 0x5865f2)
    .setTitle('💣 Mines')
    .addFields(
      { name: 'Bet', value: formatMoney(amount), inline: true },
      { name: 'Mines', value: `${mines}`, inline: true },
      { name: 'Multiplier', value: `${mult.toFixed(2)}x`, inline: true }
    )
    .setFooter({ text: gameOver ? 'Game over' : `Cash out now for ${formatMoney(potential)}` });

  if (statusText) embed.setDescription(statusText);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mines')
    .setDescription('Reveal safe tiles to build a multiplier — cash out before you hit a mine')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('mines')
        .setDescription('How many mines on the board (more = higher risk, faster multiplier growth)')
        .setRequired(false)
        .addChoices(...MINE_CHOICES.map((n) => ({ name: `${n} mines`, value: n })))
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const mines = interaction.options.getInteger('mines') || 3;
    const userId = interaction.user.id;

    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return interaction.reply({
        content: `You don't have enough coins. Your balance: ${formatMoney(user.balance)}`,
        ephemeral: true,
      });
    }

    // Bet is taken up front, same pattern as blackjack — refunded via
    // cash-out payout, or lost entirely if a mine is hit.
    await db.addBalance(userId, -amount);

    const minePositions = pickMinePositions(mines);
    const revealed = new Set();
    let gameOver = false;

    const embed = buildEmbed({ amount, mines, revealed, gameOver });
    const components = buildGrid({ minePositions, revealed, gameOver, revealMines: false });
    const message = await interaction.reply({ embeds: [embed], components, fetchReply: true });

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 5 * 60_000,
    });

    collector.on('collect', async (btnInteraction) => {
      if (gameOver) return;

      if (btnInteraction.customId === 'mines_cashout') {
        gameOver = true;
        const mult = multiplierFor(revealed.size, mines);
        const payout = Math.floor(amount * mult);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = buildEmbed({
          amount,
          mines,
          revealed,
          gameOver: true,
          color: 0x57f287,
          statusText: `💰 Cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**!`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

        const finalComponents = buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        await btnInteraction.update({ embeds: [finalEmbed], components: finalComponents });
        collector.stop('cashout');
        return;
      }

      const match = btnInteraction.customId.match(/^mines_tile_(\d+)$/);
      if (!match) return;
      const idx = parseInt(match[1], 10);
      if (revealed.has(idx)) return;

      if (minePositions.has(idx)) {
        gameOver = true;
        const finalEmbed = buildEmbed({
          amount,
          mines,
          revealed,
          gameOver: true,
          color: 0xed4245,
          statusText: `💥 Boom! You hit a mine and lost **${formatMoney(amount)}**.`,
        });
        const finalComponents = buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        await btnInteraction.update({ embeds: [finalEmbed], components: finalComponents });
        collector.stop('mine');
        return;
      }

      revealed.add(idx);
      const safeCount = TOTAL_TILES - mines;

      if (revealed.size === safeCount) {
        // Every safe tile found — auto cash out at the max multiplier.
        gameOver = true;
        const payout = Math.floor(amount * MAX_MULTIPLIER);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = buildEmbed({
          amount,
          mines,
          revealed,
          gameOver: true,
          color: 0x57f287,
          statusText: `🏆 You cleared the board! Max payout: **${formatMoney(payout)}**!`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

        const finalComponents = buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        await btnInteraction.update({ embeds: [finalEmbed], components: finalComponents });
        collector.stop('cleared');
        return;
      }

      const updatedEmbed = buildEmbed({ amount, mines, revealed, gameOver: false });
      const updatedComponents = buildGrid({ minePositions, revealed, gameOver: false, revealMines: false });
      await btnInteraction.update({ embeds: [updatedEmbed], components: updatedComponents });
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time' && !gameOver) {
        // Auto cash-out on timeout so an abandoned game doesn't just eat the bet.
        gameOver = true;
        const mult = multiplierFor(revealed.size, mines);
        const payout = Math.floor(amount * mult);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = buildEmbed({
          amount,
          mines,
          revealed,
          gameOver: true,
          color: 0xf5c518,
          statusText: `⏳ Timed out — auto cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**.`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

        const finalComponents = buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        try {
          await message.edit({ embeds: [finalEmbed], components: finalComponents });
        } catch (_) {}
      }
    });
  },
};
