const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription("Check your (or someone else's) balance")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose balance to check').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const row = await db.getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: 'Wallet', value: formatMoney(row.balance), inline: true },
        { name: 'Bank', value: formatMoney(row.bank), inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};
