const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, isAdmin } = require('../../utils/economyUtils');
const { FARM_GAMES, FARM_GAME_KEYS, FARM_DURATIONS, computeFarmEarnings } = require('../../games/farmEngine');
const ICONS = require('../../games/icons');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autofarm')
    .setDescription('Start an idle farming session, or run again later to claim it')
    .addStringOption((opt) =>
      opt
        .setName('game')
        .setDescription('Which activity to farm')
        .setRequired(false)
        .addChoices(...FARM_GAME_KEYS.map((key) => ({ name: FARM_GAMES[key].label, value: key })))
    )
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('How long to farm for')
        .setRequired(false)
        .addChoices(...FARM_DURATIONS.map((d) => ({ name: d.name, value: String(d.value) })))
    )
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('[Admin only] Instantly grant this amount, skipping the timer entirely').setRequired(false).setMinValue(1)
    )
    .addUserOption((opt) =>
      opt.setName('user').setDescription('[Admin only] Who to grant the instant amount to (defaults to you)').setRequired(false)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const amount = interaction.options.getInteger('amount');

    // Admin instant-bypass: skips farming entirely, just credits the amount.
    if (amount !== null) {
      if (!isAdmin(userId)) {
        return interaction.reply({ content: '🚫 Only the bot owner can use the `amount` option.', ephemeral: true });
      }
      const target = interaction.options.getUser('user') || interaction.user;
      const updated = await db.addBalance(target.id, amount);
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setThumbnail(ICONS.briefcase)
        .setDescription(`⚡ Instantly granted **${formatMoney(amount)}** to **${target.username}**, bypassing autofarm entirely.`)
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply();

    const row = await db.getUser(userId);

    // An active session exists — claim it instead of starting a new one.
    if (row.farm_started_at) {
      const elapsedMs = Date.now() - new Date(row.farm_started_at).getTime();
      const elapsedMinutes = elapsedMs / 60000;
      const earnings = computeFarmEarnings(row.farm_game, elapsedMinutes, row.farm_duration_minutes);
      const game = FARM_GAMES[row.farm_game];

      await db.clearFarm(userId);
      const updated = await db.addBalance(userId, earnings);

      const fullyMatured = elapsedMinutes >= row.farm_duration_minutes;
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setThumbnail(ICONS.briefcase)
        .setTitle(`${game.emoji} Farm Claimed!`)
        .setDescription(
          fullyMatured
            ? `Your **${game.label}** farm finished and earned **${formatMoney(earnings)}**!`
            : `You checked in early on your **${game.label}** farm and earned **${formatMoney(earnings)}** for the time it ran.`
        )
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

      return interaction.editReply({ embeds: [embed] });
    }

    // No active session — start a new one.
    const gameKey = interaction.options.getString('game');
    const durationStr = interaction.options.getString('duration');

    if (!gameKey || !durationStr) {
      return interaction.editReply({
        content: `Pick a \`game\` and \`duration\` to start farming. Options: ${FARM_GAME_KEYS.map((k) => FARM_GAMES[k].label).join(', ')}.`,
      });
    }

    const durationMinutes = parseInt(durationStr, 10);
    await db.startFarm(userId, gameKey, durationMinutes);

    const game = FARM_GAMES[gameKey];
    const maxEarnings = computeFarmEarnings(gameKey, durationMinutes, durationMinutes);
    const durationLabel = FARM_DURATIONS.find((d) => d.value === durationMinutes)?.name || `${durationMinutes} minutes`;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setThumbnail(ICONS.briefcase)
      .setTitle(`${game.emoji} Farming ${game.label}...`)
      .setDescription(
        `You're now farming **${game.label}** for **${durationLabel}**.\n` +
        `Come back and run \`/autofarm\` again after that to claim up to **${formatMoney(maxEarnings)}**.`
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
