const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString, randInt } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');
const { RARITIES, pickWeightedRarity } = require('../../games/crateEngine');
const { FLEE_LINES, pickWeightedMonster } = require('../../games/huntEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hunt')
    .setDescription('Head into the forest and battle a random creature — no target needed, chance of a crate'),

  async execute(interaction) {
    const userId = interaction.user.id;

    await interaction.deferReply();

    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_hunt ? new Date(row.last_hunt).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.huntCooldownMs) {
      const remaining = config.huntCooldownMs - elapsed;
      return interaction.editReply({
        content: `⏳ You're still resting up from the last hunt. Try again in **${msToTimeString(remaining)}**.`,
      });
    }

    await db.setLastHunt(userId, new Date(now));

    const monster = pickWeightedMonster();
    const winChance = luckAdjustedChance(monster.successChance, row.luck);
    const won = Math.random() < winChance;

    if (!won) {
      const line = FLEE_LINES[randInt(0, FLEE_LINES.length - 1)];
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`${monster.emoji} A wild ${monster.name} appeared!`)
        .setDescription(`${line}\n\nNo reward this time — try again once your cooldown resets.`);
      return interaction.editReply({ embeds: [embed] });
    }

    const reward = randInt(monster.minReward, monster.maxReward);
    const updated = await db.addBalance(userId, reward);

    let crateLine = '';
    if (Math.random() < monster.crateChance) {
      const rarityKey = pickWeightedRarity();
      const rarity = RARITIES[rarityKey];
      await db.addCrates(userId, rarityKey, 1);
      crateLine = `\n${rarity.emoji} It also dropped a **${rarity.label} Crate**!`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`${monster.emoji} You defeated a ${monster.name}!`)
      .setDescription(`You earned **${formatMoney(reward)}**!${crateLine}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
