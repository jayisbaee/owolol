const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ICONS = require('../../games/icons');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');
const { applyPetToChance, applyPetToPayout } = require('../../games/petEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('Risk your ENTIRE balance for a 50/50 shot to double it — or lose it all'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const user = await db.getUser(userId);

    if (user.balance <= 0) {
      return interaction.reply({
        content: `You don't have any coins to risk. Your balance: ${formatMoney(user.balance)}`,
        ephemeral: true,
      });
    }

    const warnEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setThumbnail(ICONS.jackpot)
      .setTitle('⚠️ WARNING: All-In Bet')
      .setDescription(
        `You're about to risk your **ENTIRE balance** of **${formatMoney(user.balance)}**.\n\n` +
        `If you lose, it is **gone**. This cannot be undone.\n\nAre you sure?`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('jackpot_confirm').setLabel('Yes, risk it all').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('jackpot_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.reply({ embeds: [warnEmbed], components: [row], fetchReply: true });

    let btnInteraction;
    try {
      btnInteraction = await message.awaitMessageComponent({
        filter: (i) => i.user.id === userId,
        time: 30_000,
      });
    } catch (_) {
      await interaction.editReply({ content: '⏳ Confirmation timed out — bet cancelled.', embeds: [], components: [] }).catch(() => {});
      return;
    }

    if (btnInteraction.customId === 'jackpot_cancel') {
      await btnInteraction.update({ content: '❌ Cancelled — no coins were risked.', embeds: [], components: [] });
      return;
    }

    const fresh = await db.getUser(userId);
    const stake = fresh.balance;
    if (stake <= 0) {
      await btnInteraction.update({ content: 'You have no balance left to risk.', embeds: [], components: [] });
      return;
    }

    // Acknowledge the click immediately, before the database write, so a
    // slow DB round-trip can't cause Discord to time out the interaction.
    await btnInteraction.deferUpdate();

    const pet = await db.getActivePet(userId);
    const baseChance = luckAdjustedChance(0.5, fresh.luck);
    const winChance = applyPetToChance(baseChance, pet);
    const won = Math.random() < winChance;

    const winnings = applyPetToPayout(stake, pet);
    const delta = won ? winnings : -stake;
    const updated = await db.addBalance(userId, delta);

    const resultEmbed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setThumbnail(ICONS.jackpot)
      .setTitle('🎰 JACKPOT')
      .setDescription(
        won
          ? `🎉 **YOU WON!** You gained **${formatMoney(winnings)}** on top of your stake!`
          : `💀 **YOU LOST EVERYTHING.** Your **${formatMoney(stake)}** balance is gone.`
      )
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    await btnInteraction.editReply({ embeds: [resultEmbed], components: [] });
  },
};
