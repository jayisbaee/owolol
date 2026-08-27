const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removealias')
    .setDescription('[Server Admin] Remove a custom alias from this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('alias').setDescription('The alias to remove').setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
    }
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '🚫 You need the Manage Server permission to use this.', ephemeral: true });
    }

    const alias = interaction.options.getString('alias').toLowerCase().trim();
    const removed = await db.removeGuildAlias(interaction.guild.id, alias);

    if (!removed) {
      return interaction.reply({ content: `No alias named **${alias}** exists in this server.`, ephemeral: true });
    }
    await interaction.reply({ content: `✅ Removed the alias **${alias}**.` });
  },
};
