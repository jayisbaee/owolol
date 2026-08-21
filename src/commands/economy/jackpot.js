const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ============================================
// REPLACE THESE TWO FUNCTIONS WITH YOUR OWN
// economy system (MongoDB, quick.db, JSON, etc.)
// ============================================

async function getBalance(userId) {
  // Example: return await db.get(`balance_${userId}`) || 0;
  // Example with a Map: return client.balances.get(userId) || 0;
  throw new Error('Replace getBalance() with your own balance system!');
}

async function setBalance(userId, amount) {
  // Example: await db.set(`balance_${userId}`, amount);
  // Example with a Map: client.balances.set(userId, amount);
  throw new Error('Replace setBalance() with your own balance system!');
}

// ============================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('50/50 chance to double your entire balance... or lose it all!'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const balance = await getBalance(userId);

    if (balance <= 0) {
      return interaction.reply({
        content: 'You have no money to risk!',
        ephemeral: true,
      });
    }

    // 50/50 chance
    const won = Math.random() < 0.5;

    if (won) {
      const newBalance = balance * 2;
      await setBalance(userId, newBalance);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎉 JACKPOT!')
        .setDescription(`You doubled your balance!\n\n**Before:** ${balance}\n**After:** ${newBalance}`)
        .setFooter({ text: 'Lucky!' });

      return interaction.reply({ embeds: [embed] });
    } else {
      await setBalance(userId, 0);

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('💀 You lost everything...')
        .setDescription(`You risked it all and lost.\n\n**Before:** ${balance}\n**After:** 0`)
        .setFooter({ text: 'Better luck next time' });

      return interaction.reply({ embeds: [embed] });
    }
  },
};
