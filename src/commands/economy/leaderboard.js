const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See the richest users'),

  async execute(interaction) {
    const rows = await db.getLeaderboard(10);

    if (rows.length === 0) {
      return interaction.reply('No one has any coins yet!');
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(
      rows.map(async (row, i) => {
        let name = `<@${row.user_id}>`;
        try {
          const user = await interaction.client.users.fetch(row.user_id);
          name = user.username;
        } catch (_) {}
        const rank = medals[i] || `${i + 1}.`;
        return `${rank} **${name}** — ${formatMoney(row.balance)}`;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle('💰 Richest Users')
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
  },
};
