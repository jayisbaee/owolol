const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString, randInt } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to steal coins from another user — risky if you get caught')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to rob').setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const userId = interaction.user.id;

    if (target.id === userId) {
      return interaction.reply({ content: "You can't rob yourself.", ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: "You can't rob a bot.", ephemeral: true });
    }

    // Several DB round-trips happen below — defer immediately so Discord
    // doesn't time out the interaction while we wait on the database.
    await interaction.deferReply();

    const robber = await db.getUser(userId);
    const now = Date.now();
    const last = robber.last_rob ? new Date(robber.last_rob).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.robCooldownMs) {
      const remaining = config.robCooldownMs - elapsed;
      return interaction.editReply({
        content: `⏳ You're laying low. Try robbing again in **${msToTimeString(remaining)}**.`,
      });
    }

    const victim = await db.getUser(target.id);
    if (victim.balance < config.robMinTargetBalance) {
      return interaction.editReply({
        content: `**${target.username}** doesn't have enough coins to be worth robbing (needs at least ${formatMoney(config.robMinTargetBalance)}).`,
      });
    }

    await db.setLastRob(userId, new Date(now));

    const winChance = luckAdjustedChance(0.4, robber.luck);
    const success = Math.random() < winChance;

    if (success) {
      const stealPct = config.robMinStealPct + Math.random() * (config.robMaxStealPct - config.robMinStealPct);
      const stolen = Math.max(1, Math.floor(victim.balance * stealPct));

      await db.addBalance(target.id, -stolen);
      const updatedRobber = await db.addBalance(userId, stolen);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🕵️ Robbery Successful!')
        .setDescription(`You snuck up on **${target.username}** and got away with **${formatMoney(stolen)}**!`)
        .setFooter({ text: `New balance: ${formatMoney(updatedRobber.balance)}` });

      await interaction.editReply({ embeds: [embed] });
    } else {
      const penalty = Math.max(1, Math.floor(robber.balance * config.robFailPenaltyPct));
      const updatedRobber = await db.addBalance(userId, -penalty);

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🚨 Caught Red-Handed!')
        .setDescription(`You got caught trying to rob **${target.username}** and paid a fine of **${formatMoney(penalty)}**.`)
        .setFooter({ text: `New balance: ${formatMoney(updatedRobber.balance)}` });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
