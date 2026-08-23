const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { RARITIES, RARITY_KEYS } = require('../../games/crateEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crates')
    .setDescription('View your crate inventory')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose crates to view').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const row = await db.getUser(target.id);

    const lines = RARITY_KEYS.map((key) => {
      const rarity = RARITIES[key];
      const count = row[`crates_${key}`] || 0;
      return `${rarity.emoji} **${rarity.label}**: ${count}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `${target.username}'s Crates`, iconURL: target.displayAvatarURL() })
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Use /opencrate <rarity> to open one' });

    await interaction.reply({ embeds: [embed] });
  },
};
