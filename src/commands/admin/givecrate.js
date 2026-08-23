const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');
const { RARITIES, RARITY_KEYS } = require('../../games/crateEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givecrate')
    .setDescription('[Admin] Give crates to yourself or another user')
    .addStringOption((opt) =>
      opt
        .setName('rarity')
        .setDescription('Which rarity to give')
        .setRequired(true)
        .addChoices(...RARITY_KEYS.map((key) => ({ name: RARITIES[key].label, value: key })))
    )
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How many crates to give').setRequired(true).setMinValue(1)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to give crates to (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const rarityKey = interaction.options.getString('rarity');
    const rarity = RARITIES[rarityKey];
    const amount = interaction.options.getInteger('amount');
    const target = interaction.options.getUser('user') || interaction.user;

    const updated = await db.addCrates(target.id, rarityKey, amount);
    const newCount = updated[`crates_${rarityKey}`];

    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setDescription(`${rarity.emoji} Gave **${amount}x ${rarity.label} Crate** to **${target.username}**. They now have **${newCount}**.`);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
