const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetalleconomy')
    .setDescription('[Admin] Reset EVERY tracked user\'s balance back to 0 — cannot be undone'),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const userCount = await db.getUserCount();

    const warnEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚠️ WARNING: Full Economy Reset')
      .setDescription(
        `This will set **every tracked user's balance to 0** — that's **${userCount}** user${userCount === 1 ? '' : 's'}.\n\n` +
        `This cannot be undone. Luck stats are not affected.\n\nAre you sure?`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reset_confirm').setLabel('Yes, reset everyone').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reset_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.reply({ embeds: [warnEmbed], components: [row], fetchReply: true, ephemeral: true });

    let btnInteraction;
    try {
      btnInteraction = await message.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 30_000,
      });
    } catch (_) {
      await interaction.editReply({ content: '⏳ Confirmation timed out — nothing was reset.', embeds: [], components: [] }).catch(() => {});
      return;
    }

    if (btnInteraction.customId === 'reset_cancel') {
      await btnInteraction.update({ content: '❌ Cancelled — no changes made.', embeds: [], components: [] });
      return;
    }

    await btnInteraction.deferUpdate();
    const affected = await db.resetAllBalances();

    await btnInteraction.editReply({
      content: `✅ Done. Reset **${affected}** user${affected === 1 ? '' : 's'}' balances to 0.`,
      embeds: [],
      components: [],
    });
  },
};
