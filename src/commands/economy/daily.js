const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString } = require('../../utils/economyUtils');
const { RARITIES } = require('../../games/crateEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins and a free crate'),

  async execute(interaction) {
    const userId = interaction.user.id;

    // Several DB calls happen below (balance, crate, cooldown timestamp) —
    // defer immediately so Discord doesn't time out waiting on them.
    await interaction.deferReply();

    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_daily ? new Date(row.last_daily).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.dailyCooldownMs) {
      const remaining = config.dailyCooldownMs - elapsed;
      return interaction.editReply({
        content: `⏳ You already claimed your daily. Come back in **${msToTimeString(remaining)}**.`,
      });
    }

    await db.addBalance(userId, config.dailyAmount);
    await db.addCrates(userId, 'common', 1);
    await db.setLastDaily(userId, new Date(now));

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(
        `✅ You claimed your daily and received **${formatMoney(config.dailyAmount)}**!\n` +
        `${RARITIES.common.emoji} You also got a **Common Crate**! Use \`/opencrate\` to open it.`
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
