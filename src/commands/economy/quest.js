const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString, randInt } = require('../../utils/economyUtils');
const { RARITIES, pickWeightedRarity } = require('../../games/crateEngine');

const QUESTS = [
  'rescued a cat stuck in a tree and the owner tipped you',
  'delivered a mysterious package across town',
  'solved a riddle for a traveling wizard',
  'helped a farmer round up escaped chickens',
  'found a lost wallet and returned it for a reward',
  'guided some lost tourists to their hotel',
  'fixed a leaky faucet for a grateful neighbor',
  'won a local trivia night',
  'helped move furniture for a new apartment',
  'found some spare change while cleaning the couch',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('Complete a quick quest for a fast payout (short cooldown, chance of a crate)'),

  async execute(interaction) {
    const userId = interaction.user.id;

    await interaction.deferReply();

    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_quest ? new Date(row.last_quest).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.questCooldownMs) {
      const remaining = config.questCooldownMs - elapsed;
      return interaction.editReply({
        content: `⏳ Your next quest isn't ready yet. Come back in **${msToTimeString(remaining)}**.`,
      });
    }

    const earned = randInt(config.questMin, config.questMax);
    const quest = QUESTS[randInt(0, QUESTS.length - 1)];

    await db.addBalance(userId, earned);
    await db.setLastQuest(userId, new Date(now));

    let crateLine = '';
    if (Math.random() < config.questCrateChance) {
      const rarityKey = pickWeightedRarity();
      const rarity = RARITIES[rarityKey];
      await db.addCrates(userId, rarityKey, 1);
      crateLine = `\n${rarity.emoji} You also found a **${rarity.label} Crate**!`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🗺️ Quest Complete!')
      .setDescription(`You ${quest} and earned **${formatMoney(earned)}**!${crateLine}`);

    await interaction.editReply({ embeds: [embed] });
  },
};
