const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { isAdmin } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givepet')
    .setDescription('[Admin] Give someone a copy of an existing pet (matched by name)')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Name of the existing pet to copy').setRequired(true)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to give it to (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
    }

    const name = interaction.options.getString('name');
    const target = interaction.options.getUser('user') || interaction.user;

    const source = await db.findPetByName(name);
    if (!source) {
      return interaction.reply({ content: `No pet named **${name}** exists yet. Create one first with \`/createpet\`.`, ephemeral: true });
    }

    const pet = await db.createPet(target.id, source.name, source.win_boost, source.payout_multiplier);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setDescription(`🐾 Gave **${target.username}** a copy of **${pet.name}** (win boost ${source.win_boost >= 0 ? '+' : ''}${source.win_boost}%, ${source.payout_multiplier}x payout).`);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
