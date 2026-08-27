const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createpet')
    .setDescription('[Admin] Create a fully custom pet with your own win-chance boost and payout multiplier')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Name for this pet').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('winboost')
        .setDescription('Percentage points added to win chance (-100 to 100). +100 = guaranteed win.')
        .setRequired(true)
        .setMinValue(-100)
        .setMaxValue(100)
    )
    .addNumberOption((opt) =>
      opt
        .setName('payoutmultiplier')
        .setDescription('Multiplies winnings (1 = normal, 100 = 100x the bet). Default 1.')
        .setRequired(false)
        .setMinValue(0.1)
        .setMaxValue(100000)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who owns this pet (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const name = interaction.options.getString('name');
    const winBoost = interaction.options.getInteger('winboost');
    const payoutMultiplier = interaction.options.getNumber('payoutmultiplier') ?? 1;
    const target = interaction.options.getUser('user') || interaction.user;

    const pet = await db.createPet(target.id, name, winBoost, payoutMultiplier);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🐾 Pet Created')
      .setDescription(
        `Created **${pet.name}** for **${target.username}**.\n\n` +
        `Win boost: **${winBoost >= 0 ? '+' : ''}${winBoost}%**\n` +
        `Payout multiplier: **${payoutMultiplier}x**\n\n` +
        `They'll need to run \`/equippet ${pet.name}\` to activate it. Currently applies to: coinflip, jackpot, crossroad.`
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
