const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ICONS = require('../../games/icons');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pets')
    .setDescription("View a user's pets")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose pets to view').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const row = await db.getUser(target.id);
    const pets = await db.getPetsByOwner(target.id);

    if (pets.length === 0) {
      return interaction.reply({ content: `**${target.username}** doesn't have any pets yet.` });
    }

    const lines = pets.map((pet) => {
      const active = pet.id === row.active_pet_id ? ' ✅ *(active)*' : '';
      return `🐾 **${pet.name}**${active}\nWin boost: ${pet.win_boost >= 0 ? '+' : ''}${pet.win_boost}% • Payout: ${pet.payout_multiplier}x`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.pet)
      .setAuthor({ name: `${target.username}'s Pets`, iconURL: target.displayAvatarURL() })
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: 'Use /equippet <name> to activate one' });

    await interaction.reply({ embeds: [embed] });
  },
};
