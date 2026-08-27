const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ICONS = require('../../games/icons');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('equippet')
    .setDescription('Equip one of your pets (or "none" to unequip)')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Pet name, or "none" to unequip').setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const userId = interaction.user.id;

    if (name.toLowerCase() === 'none') {
      await db.setActivePet(userId, null);
      return interaction.reply({ content: '🐾 Unequipped your pet.' });
    }

    const pet = await db.findOwnedPetByName(userId, name);
    if (!pet) {
      return interaction.reply({ content: `You don't own a pet named **${name}**. Check \`/pets\` for your list.`, ephemeral: true });
    }

    await db.setActivePet(userId, pet.id);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.pet)
      .setDescription(`🐾 Equipped **${pet.name}**! (Win boost: ${pet.win_boost >= 0 ? '+' : ''}${pet.win_boost}%, Payout: ${pet.payout_multiplier}x)`);

    await interaction.reply({ embeds: [embed] });
  },
};
