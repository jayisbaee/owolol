const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney, msToTimeString } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vaultbreak')
    .setDescription("Use an electric drill to attempt breaking into someone's bank vault")
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose vault to target').setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const userId = interaction.user.id;

    if (target.id === userId) {
      return interaction.reply({ content: "You can't break into your own vault.", ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: "You can't rob a bot.", ephemeral: true });
    }

    await interaction.deferReply();

    const attacker = await db.getUser(userId);

    if (attacker.drills < 1) {
      return interaction.editReply({
        content: `You need an **Electric Drill** to attempt this. Buy one with \`/buy item:drill\` (costs ${formatMoney(config.drillCost)}).`,
      });
    }

    const now = Date.now();
    const last = attacker.last_vaultbreak ? new Date(attacker.last_vaultbreak).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.vaultbreakCooldownMs) {
      const remaining = config.vaultbreakCooldownMs - elapsed;
      return interaction.editReply({
        content: `⏳ Your drill needs to cool down. Try again in **${msToTimeString(remaining)}**.`,
      });
    }

    const victim = await db.getUser(target.id);
    if (victim.bank < config.vaultbreakMinTargetBank) {
      return interaction.editReply({
        content: `**${target.username}**'s vault doesn't have enough in it to be worth cracking (needs at least ${formatMoney(config.vaultbreakMinTargetBank)}).`,
      });
    }

    // The drill is consumed on every attempt, win or lose.
    await db.addDrills(userId, -1);
    await db.setLastVaultbreak(userId, new Date(now));

    const successChance = luckAdjustedChance(config.vaultbreakSuccessChance, attacker.luck);
    const success = Math.random() < successChance;

    if (success) {
      const stealPct = config.vaultbreakMinStealPct + Math.random() * (config.vaultbreakMaxStealPct - config.vaultbreakMinStealPct);
      const stolen = Math.max(1, Math.floor(victim.bank * stealPct));

      await db.addBank(target.id, -stolen);
      const updatedAttacker = await db.addBalance(userId, stolen);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔩 Vault Cracked!')
        .setDescription(`Your drill broke through **${target.username}**'s vault and you got away with **${formatMoney(stolen)}**!`)
        .setFooter({ text: `New wallet balance: ${formatMoney(updatedAttacker.balance)}` });
      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🚨 Vault Break Failed!')
        .setDescription(`The drill broke and the vault held. **${target.username}**'s bank is untouched. You'll need another drill to try again.`);
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
