const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString, randInt } = require('../../utils/economyUtils');

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
    .setDescription('Complete a quick quest for a fast payout (short cooldown)'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const row = await db.getUser(userId);

    const now = Date.now();
    const last = row.last_quest ? new Date(row.last_quest).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.questCooldownMs) {
      const remaining = config.questCooldownMs - elapsed;
      return interaction.reply({
        content: `⏳ Your next quest isn't ready yet. Come back in **${msToTimeString(remaining)}**.`,
        ephemeral: true,
      });
    }

    const earned = randInt(config.questMin, config.questMax);
    const quest = QUESTS[randInt(0, QUESTS.length - 1)];

    await db.addBalance(userId, earned);
    await db.setLastQuest(userId, new Date(now));

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🗺️ Quest Complete!')
      .setDescription(`You ${quest} and earned **${formatMoney(earned)}**!`);

    await interaction.reply({ embeds: [embed] });
  },
};
