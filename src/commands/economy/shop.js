const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatMoney } = require('../../utils/economyUtils');
const { ITEMS, ITEM_KEYS } = require('../../games/shopEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View items you can buy with /buy'),

  async execute(interaction) {
    const lines = ITEM_KEYS.map((key) => {
      const item = ITEMS[key];
      return `${item.emoji} **${item.label}** — ${formatMoney(item.cost)}\n${item.description}\n*Buy with:* \`/buy item:${key}\``;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🛒 Shop')
      .setDescription(lines.join('\n\n'));

    await interaction.reply({ embeds: [embed] });
  },
};
