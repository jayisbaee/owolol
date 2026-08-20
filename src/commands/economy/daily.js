const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const row = await db.getUser(userId);

    const now = Date.now();
    const last = row.last_daily ? new Date(row.last_daily).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.dailyCooldownMs) {
      const remaining = config.dailyCooldownMs - elapsed;
      return interaction.reply({
        content: `⏳ You already claimed your daily. Come back in **${msToTimeString(remaining)}**.`,
        ephemeral: true,
      });
    }

    await db.addBalance(userId, config.dailyAmount);
    await db.setLastDaily(userId, new Date(now));

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`✅ You claimed your daily and received **${formatMoney(config.dailyAmount)}**!`);

    await interaction.reply({ embeds: [embed] });
  },
};
