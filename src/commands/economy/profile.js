const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');
const { RARITY_KEYS, RARITIES } = require('../../games/crateEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("View a full snapshot of your (or someone else's) economy profile")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose profile to view').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const row = await db.getUser(target.id);

    const totalCrates = RARITY_KEYS.reduce((sum, key) => sum + (row[`crates_${key}`] || 0), 0);
    const crateSummary = RARITY_KEYS
      .filter((key) => row[`crates_${key}`] > 0)
      .map((key) => `${RARITIES[key].emoji}${row[`crates_${key}`]}`)
      .join(' ') || 'None';

    const pets = await db.getPetsByOwner(target.id);
    const activePet = pets.find((p) => p.id === row.active_pet_id);
    const petLine = activePet
      ? `${activePet.name} (${activePet.win_boost >= 0 ? '+' : ''}${activePet.win_boost}% win, ${activePet.payout_multiplier}x payout)`
      : pets.length > 0
      ? `None equipped (${pets.length} owned)`
      : 'None';

    const farmLine = row.farm_started_at
      ? `🌱 Farming **${row.farm_game}** — check \`/autofarm\` to claim`
      : 'Not farming';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `${target.username}'s Profile`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: '💰 Wallet', value: formatMoney(row.balance), inline: true },
        { name: '🏦 Bank', value: formatMoney(row.bank), inline: true },
        { name: '🔥 Daily Streak', value: `${row.daily_streak} day${row.daily_streak === 1 ? '' : 's'}`, inline: true },
        { name: '🐾 Active Pet', value: petLine, inline: false },
        { name: `📦 Crates (${totalCrates} total)`, value: crateSummary, inline: false },
        { name: '🎟️ Tickets', value: `${row.tickets}`, inline: true },
        { name: '🔩 Drills', value: `${row.drills}`, inline: true },
        { name: '🌾 Autofarm', value: farmLine, inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};
