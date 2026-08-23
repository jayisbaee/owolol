const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString, randInt } = require('../../utils/economyUtils');

const BEGGARS = [
  'a kind stranger', 'a friendly cashier', 'a passing jogger', 'your neighbor',
  'a street performer', 'a coffee shop barista', 'a generous tourist', 'an old friend',
];

const NOTHING_LINES = [
  'Nobody had any spare change for you.',
  'You got a lot of awkward stares and nothing else.',
  'A dog barked at you. No money though.',
  'Someone said "get a job" and walked off.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beg')
    .setDescription('Beg for some spare change — quick, tiny payout, very short cooldown'),

  async execute(interaction) {
    const userId = interaction.user.id;

    // Defer right away — cheap command, but keeps behavior consistent and
    // safe if the DB ever has a slow moment.
    await interaction.deferReply();

    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_beg ? new Date(row.last_beg).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.begCooldownMs) {
      const remaining = config.begCooldownMs - elapsed;
      return interaction.editReply({
        content: `⏳ Give it a moment. You can beg again in **${msToTimeString(remaining)}**.`,
      });
    }

    await db.setLastBeg(userId, new Date(now));

    if (Math.random() < config.begNothingChance) {
      const line = NOTHING_LINES[randInt(0, NOTHING_LINES.length - 1)];
      const embed = new EmbedBuilder()
        .setColor(0x99aab5)
        .setTitle('🙏 Begging')
        .setDescription(line);
      return interaction.editReply({ embeds: [embed] });
    }

    const earned = randInt(config.begMin, config.begMax);
    const giver = BEGGARS[randInt(0, BEGGARS.length - 1)];
    const updated = await db.addBalance(userId, earned);

    const embed = new EmbedBuilder()
      .setColor(0x99aab5)
      .setTitle('🙏 Begging')
      .setDescription(`${giver} felt bad for you and gave you **${formatMoney(earned)}**.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
