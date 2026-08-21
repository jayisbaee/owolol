const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString, randInt } = require('../../utils/economyUtils');

const JOBS = [
  'delivered pizzas', 'walked dogs', 'mowed lawns', 'fixed a computer',
  'busked on the street', 'tutored a kid in math', 'washed cars',
  'sold lemonade', 'streamed for 3 hours', 'flipped burgers',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work a job to earn some coins'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const row = await db.getUser(userId);

    const now = Date.now();
    const last = row.last_work ? new Date(row.last_work).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.workCooldownMs) {
      const remaining = config.workCooldownMs - elapsed;
      return interaction.reply({
        content: `⏳ You're tired. Rest for **${msToTimeString(remaining)}** before working again.`,
        ephemeral: true,
      });
    }

    const earned = randInt(config.workMin, config.workMax);
    const job = JOBS[randInt(0, JOBS.length - 1)];

    await db.addBalance(userId, earned);
    await db.setLastWork(userId, new Date(now));

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`💼 You ${job} and earned **${formatMoney(earned)}**!`);

    await interaction.reply({ embeds: [embed] });
  },
};
