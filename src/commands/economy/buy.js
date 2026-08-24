const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { formatMoney } = require('../../utils/economyUtils');
const { ITEMS, ITEM_KEYS } = require('../../games/shopEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop')
    .addStringOption((opt) =>
      opt
        .setName('item')
        .setDescription('Which item to buy')
        .setRequired(true)
        .addChoices(...ITEM_KEYS.map((key) => ({ name: ITEMS[key].label, value: key })))
    )
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How many to buy (default 1)').setRequired(false).setMinValue(1)
    ),

  async execute(interaction) {
    const itemKey = interaction.options.getString('item');
    const item = ITEMS[itemKey];
    const amount = interaction.options.getInteger('amount') || 1;
    const totalCost = item.cost * amount;
    const userId = interaction.user.id;

    await interaction.deferReply();

    const user = await db.getUser(userId);
    if (user.balance < totalCost) {
      return interaction.editReply({
        content: `You don't have enough coins. **${amount}x ${item.label}** costs ${formatMoney(totalCost)}, but your wallet has ${formatMoney(user.balance)}.`,
      });
    }

    await db.addBalance(userId, -totalCost);

    let confirmationLine;
    if (itemKey === 'luck') {
      const luckGain = config.luckUpgradeAmount * amount;
      const updated = await db.addLuck(userId, luckGain);
      confirmationLine = `🍀 Bought **${amount}x Luck Upgrade** for ${formatMoney(totalCost)}. Your luck is now **${updated.luck}**.`;
    } else if (itemKey === 'drill') {
      const updated = await db.addDrills(userId, amount);
      confirmationLine = `🔩 Bought **${amount}x Electric Drill** for ${formatMoney(totalCost)}. You now have **${updated.drills}**.`;
    } else {
      confirmationLine = `Bought **${amount}x ${item.label}** for ${formatMoney(totalCost)}.`;
    }

    const embed = new EmbedBuilder().setColor(0x57f287).setDescription(confirmationLine);
    await interaction.editReply({ embeds: [embed] });
  },
};
