const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');
const { luckAdjustedChance } = require('../../games/luckEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Challenge another user to a wagered battle — winner takes the whole pot')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who to challenge').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to wager').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const opponent = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const challengerId = interaction.user.id;

    if (opponent.id === challengerId) {
      return interaction.reply({ content: "You can't battle yourself.", flags: MessageFlags.Ephemeral });
    }
    if (opponent.bot) {
      return interaction.reply({ content: "You can't battle a bot.", flags: MessageFlags.Ephemeral });
    }

    // Two DB round-trips happen below (challenger + defender lookups) —
    // defer immediately so Discord doesn't time out waiting for them.
    await interaction.deferReply();

    const challenger = await db.getUser(challengerId);
    if (challenger.balance < amount) {
      return interaction.editReply({
        content: `You don't have enough coins. Your balance: ${formatMoney(challenger.balance)}`,
      });
    }
    const defender = await db.getUser(opponent.id);
    if (defender.balance < amount) {
      return interaction.editReply({
        content: `**${opponent.username}** doesn't have enough coins to match that wager.`,
      });
    }

    const challengeEmbed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle('⚔️ Battle Challenge!')
      .setDescription(
        `**${interaction.user.username}** has challenged **${opponent.username}** to a battle for **${formatMoney(amount)}**!\n\n` +
        `${opponent}, do you accept?`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_accept').setLabel('⚔️ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('battle_decline').setLabel('Decline').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({ embeds: [challengeEmbed], components: [row] });

    let btnInteraction;
    try {
      btnInteraction = await message.awaitMessageComponent({
        filter: (i) => i.user.id === opponent.id,
        time: 60_000,
      });
    } catch (_) {
      await interaction.editReply({ content: `⏳ **${opponent.username}** didn't respond in time. Battle cancelled.`, embeds: [], components: [] }).catch(() => {});
      return;
    }

    if (btnInteraction.customId === 'battle_decline') {
      await btnInteraction.update({ content: `❌ **${opponent.username}** declined the battle.`, embeds: [], components: [] });
      return;
    }

    // Acknowledge immediately, before any DB writes, so a slow database
    // round-trip can't time out the interaction.
    await btnInteraction.deferUpdate();

    const freshChallenger = await db.getUser(challengerId);
    const freshDefender = await db.getUser(opponent.id);
    if (freshChallenger.balance < amount || freshDefender.balance < amount) {
      await btnInteraction.editReply({ content: '❌ One of you no longer has enough coins for this wager. Battle cancelled.', embeds: [], components: [] });
      return;
    }

    // Both wagers come out of escrow, winner gets the full pot back.
    await db.addBalance(challengerId, -amount);
    await db.addBalance(opponent.id, -amount);

    const luckDiff = freshChallenger.luck - freshDefender.luck;
    const challengerWinChance = luckAdjustedChance(0.5, luckDiff);
    const challengerWins = Math.random() < challengerWinChance;

    const winnerId = challengerWins ? challengerId : opponent.id;
    const winnerName = challengerWins ? interaction.user.username : opponent.username;
    const loserName = challengerWins ? opponent.username : interaction.user.username;
    const pot = amount * 2;

    const updatedWinner = await db.addBalance(winnerId, pot);

    const resultEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('⚔️ Battle Result')
      .setDescription(`**${winnerName}** defeated **${loserName}** and won the pot of **${formatMoney(pot)}**!`)
      .setFooter({ text: `${winnerName}'s new balance: ${formatMoney(updatedWinner.balance)}` });

    await btnInteraction.editReply({ embeds: [resultEmbed], components: [] });
  },
};
