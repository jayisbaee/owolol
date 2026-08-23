const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString, randInt } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');

const CRIMES = [
  'picked a stranger\'s pocket',
  'hacked into a vending machine',
  'ran a small con on a busy street',
  'snuck into a fancy event and grabbed some cash',
  'pulled off a quick scheme downtown',
];

const CAUGHT_LINES = [
  'A security guard spotted you.',
  'You tripped an alarm.',
  'Someone recognized you and called it out.',
  'You got cornered by the police.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crime')
    .setDescription('Attempt a solo crime for a big payout — risky, no target needed'),

  async execute(interaction) {
    const userId = interaction.user.id;

    await interaction.deferReply();

    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_crime ? new Date(row.last_crime).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.crimeCooldownMs) {
      const remaining = config.crimeCooldownMs - elapsed;
      return interaction.editReply({
        content: `⏳ Lay low a bit longer. You can try again in **${msToTimeString(remaining)}**.`,
      });
    }

    await db.setLastCrime(userId, new Date(now));

    const successChance = luckAdjustedChance(config.crimeSuccessChance, row.luck);
    const success = Math.random() < successChance;

    if (success) {
      const earned = randInt(config.crimeMin, config.crimeMax);
      const crime = CRIMES[randInt(0, CRIMES.length - 1)];
      const updated = await db.addBalance(userId, earned);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎭 Crime Successful!')
        .setDescription(`You ${crime} and got away with **${formatMoney(earned)}**!`)
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
      await interaction.editReply({ embeds: [embed] });
    } else {
      const penalty = Math.max(1, Math.floor(row.balance * config.crimeFailPenaltyPct));
      const updated = await db.addBalance(userId, -penalty);
      const line = CAUGHT_LINES[randInt(0, CAUGHT_LINES.length - 1)];

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🚨 Busted!')
        .setDescription(`${line} You paid a fine of **${formatMoney(penalty)}**.`)
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
