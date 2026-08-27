const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const ICONS = require('../../games/icons');
const { handlers } = require('../../prefixHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setalias')
    .setDescription('[Server Admin] Create a custom short alias for a command, e.g. "cr" for "crates"')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('alias').setDescription('The short alias, e.g. cr').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('command').setDescription('The real command it points to, e.g. crates').setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
    }
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '🚫 You need the Manage Server permission to use this.', ephemeral: true });
    }

    const alias = interaction.options.getString('alias').toLowerCase().trim();
    const commandName = interaction.options.getString('command').toLowerCase().trim();

    if (!/^[a-z0-9]{1,20}$/.test(alias)) {
      return interaction.reply({ content: 'Aliases must be 1-20 letters/numbers, no spaces or symbols.', ephemeral: true });
    }
    if (!handlers[commandName]) {
      return interaction.reply({ content: `**${commandName}** isn't a real command. Check \`${config.prefix}help\` for valid command names.`, ephemeral: true });
    }
    if (handlers[alias]) {
      return interaction.reply({ content: `**${alias}** is already a built-in command name and can't be used as an alias.`, ephemeral: true });
    }

    await db.setGuildAlias(interaction.guild.id, alias, commandName);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setThumbnail(ICONS.help)
      .setDescription(`✅ Set up \`${config.prefix}${alias}\` as an alias for \`${config.prefix}${commandName}\` in this server.`);
    await interaction.reply({ embeds: [embed] });
  },
};
