const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');
const { applyPetToChance, applyPetToPayout } = require('../../games/petEngine');
const { TOTAL_LANES, MAX_MULTIPLIER, BASE_SURVIVAL_CHANCE, multiplierFor } = require('../../games/crossroadEngine');
const ICONS = require('../../games/icons');

function buildRoad(lanesCrossed, gameOver, hitLane) {
  const segments = [];
  for (let i = 1; i <= TOTAL_LANES; i++) {
    if (gameOver && i === hitLane) segments.push('💥');
    else if (i <= lanesCrossed) segments.push('🐔');
    else segments.push('🛣️');
  }
  return segments.join(' ');
}

function buildEmbed({ amount, lanesCrossed, gameOver, statusText, color, hitLane }) {
  const mult = multiplierFor(lanesCrossed);
  const potential = Math.floor(amount * mult);

  const embed = new EmbedBuilder()
    .setColor(color || 0x5865f2)
    .setThumbnail(ICONS.crossroad)
    .setTitle('🐔 Road Crossing')
    .setDescription(buildRoad(lanesCrossed, gameOver, hitLane))
    .addFields(
      { name: 'Bet', value: formatMoney(amount), inline: true },
      { name: 'Lane', value: `${lanesCrossed}/${TOTAL_LANES}`, inline: true },
      { name: 'Multiplier', value: `${mult.toFixed(2)}x`, inline: true }
    )
    .setFooter({ text: gameOver ? 'Game over' : `Cash out now for ${formatMoney(potential)}` });

  if (statusText) embed.setDescription(`${buildRoad(lanesCrossed, gameOver, hitLane)}\n\n${statusText}`);
  return embed;
}

function buildButtons(disabled = false, cashOutDisabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('road_cross').setLabel('🐔 Cross').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('road_cashout').setLabel('💰 Cash Out').setStyle(ButtonStyle.Success).setDisabled(disabled || cashOutDisabled)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crossroad')
    .setDescription('Cross lanes of traffic to build a multiplier — cash out before you get hit')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const userId = interaction.user.id;

    if (amount < 1) {
      return interaction.reply({ content: 'Bet must be at least 1 coin.', ephemeral: true });
    }

    // Several DB calls happen below — defer immediately so Discord doesn't
    // time out waiting on them.
    await interaction.deferReply();

    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return interaction.editReply({
        content: `You don't have enough coins. Your balance: ${formatMoney(user.balance)}`,
      });
    }

    await db.addBalance(userId, -amount);
    const pet = await db.getActivePet(userId);

    let lanesCrossed = 0;
    let gameOver = false;

    const embed = buildEmbed({ amount, lanesCrossed, gameOver });
    const components = [buildButtons(false, true)];
    const message = await interaction.editReply({ embeds: [embed], components });

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 5 * 60_000,
    });

    collector.on('collect', async (btnInteraction) => {
      if (gameOver) return;

      if (btnInteraction.customId === 'road_cashout') {
        gameOver = true;
        await btnInteraction.deferUpdate();

        const mult = multiplierFor(lanesCrossed);
        const payout = applyPetToPayout(Math.floor(amount * mult), pet);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = buildEmbed({
          amount, lanesCrossed, gameOver: true, color: 0x57f287,
          statusText: `💰 Cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**!`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

        await btnInteraction.editReply({ embeds: [finalEmbed], components: [buildButtons(true)] });
        collector.stop('cashout');
        return;
      }

      if (btnInteraction.customId === 'road_cross') {
        const baseChance = luckAdjustedChance(BASE_SURVIVAL_CHANCE, user.luck);
        const survivalChance = applyPetToChance(baseChance, pet);
        const survived = Math.random() < survivalChance;

        if (!survived) {
          gameOver = true;
          const hitLane = lanesCrossed + 1;
          const finalEmbed = buildEmbed({
            amount, lanesCrossed, gameOver: true, hitLane, color: 0xed4245,
            statusText: `💥 You got hit crossing lane ${hitLane}! You lost **${formatMoney(amount)}**.`,
          });
          await btnInteraction.update({ embeds: [finalEmbed], components: [buildButtons(true)] });
          collector.stop('hit');
          return;
        }

        lanesCrossed++;

        if (lanesCrossed === TOTAL_LANES) {
          gameOver = true;
          await btnInteraction.deferUpdate();

          const payout = applyPetToPayout(Math.floor(amount * MAX_MULTIPLIER), pet);
          const updated = await db.addBalance(userId, payout);

          const finalEmbed = buildEmbed({
            amount, lanesCrossed, gameOver: true, color: 0x57f287,
            statusText: `🏆 You made it all the way across! Max payout: **${formatMoney(payout)}**!`,
          }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

          await btnInteraction.editReply({ embeds: [finalEmbed], components: [buildButtons(true)] });
          collector.stop('cleared');
          return;
        }

        const updatedEmbed = buildEmbed({ amount, lanesCrossed, gameOver: false });
        await btnInteraction.update({ embeds: [updatedEmbed], components: [buildButtons(false, false)] });
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time' && !gameOver) {
        gameOver = true;
        const mult = multiplierFor(lanesCrossed);
        const payout = applyPetToPayout(Math.floor(amount * mult), pet);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = buildEmbed({
          amount, lanesCrossed, gameOver: true, color: 0xf5c518,
          statusText: `⏳ Timed out — auto cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**.`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

        try {
          await message.edit({ embeds: [finalEmbed], components: [buildButtons(true)] });
        } catch (_) {}
      }
    });
  },

  buildEmbed,
  buildButtons,
};
