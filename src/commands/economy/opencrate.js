const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');
const { RARITIES, RARITY_KEYS, luckWeightedReward } = require('../../games/crateEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('opencrate')
    .setDescription('Open one of your crates for a random payout')
    .addStringOption((opt) =>
      opt
        .setName('rarity')
        .setDescription('Which crate to open')
        .setRequired(true)
        .addChoices(...RARITY_KEYS.map((key) => ({ name: RARITIES[key].label, value: key })))
    ),

  async execute(interaction) {
    const rarityKey = interaction.options.getString('rarity');
    const rarity = RARITIES[rarityKey];
    const userId = interaction.user.id;

    // Reads the crate count, then writes twice (consume crate, add balance) —
    // defer immediately so a slow DB round-trip can't time out the interaction.
    await interaction.deferReply();

    const row = await db.getUser(userId);
    const currentCount = row[`crates_${rarityKey}`] || 0;

    if (currentCount < 1) {
      return interaction.editReply({
        content: `You don't have any **${rarity.label}** crates to open.`,
      });
    }

    await db.addCrates(userId, rarityKey, -1);
    const reward = luckWeightedReward(rarity.min, rarity.max, row.luck);
    const updated = await db.addBalance(userId, reward);

    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setTitle(`${rarity.emoji} ${rarity.label} Crate Opened!`)
      .setDescription(`You found **${formatMoney(reward)}** inside!`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
