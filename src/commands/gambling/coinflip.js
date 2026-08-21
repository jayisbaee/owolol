const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');
const { getGif } = require('../../utils/gifUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Bet coins on a coin flip')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt.setName('side').setDescription('Heads or tails').setRequired(true).addChoices(
        { name: 'Heads', value: 'heads' },
        { name: 'Tails', value: 'tails' }
      )
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const side = interaction.options.getString('side');
    const userId = interaction.user.id;

    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return interaction.reply({
        content: `You don't have enough coins. Your balance: ${formatMoney(user.balance)}`,
        ephemeral: true,
      });
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === side;
    const delta = won ? amount : -amount;
    const updated = await db.addBalance(userId, delta);
    const gifUrl = await getGif(
      won ? 'win' : 'lose',
      won ? 'coin flip win celebration' : 'coin flip lose sad'
    );

    const embed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setTitle(`🪙 The coin landed on ${result}!`)
      .setDescription(
        won
          ? `You won **${formatMoney(amount)}**!`
          : `You lost **${formatMoney(amount)}**.`
      )
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    if (gifUrl) embed.setImage(gifUrl);

    await interaction.reply({ embeds: [embed] });
  },
};
