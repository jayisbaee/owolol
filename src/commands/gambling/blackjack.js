const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../../database');
const { formatMoney } = require('../../utils/economyUtils');
const { freshDeck, handValue, renderHand } = require('../../games/blackjackEngine');

function buildEmbed({ player, dealer, revealDealer, statusText, color }) {
  const dealerCards = revealDealer ? renderHand(dealer) : `${dealer[0]} ??`;
  const dealerValue = revealDealer ? ` (${handValue(dealer)})` : '';
  return new EmbedBuilder()
    .setColor(color || 0x5865f2)
    .setTitle('🃏 Blackjack')
    .addFields(
      { name: 'Your hand', value: `${renderHand(player)}  (${handValue(player)})` },
      { name: "Dealer's hand", value: `${dealerCards}${dealerValue}` }
    )
    .setDescription(statusText || null);
}

function buildButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

// `respond` abstracts over interaction.reply / interaction.update / message.reply
// so this same finishing logic works for both slash and prefix versions.
async function finish({ respond, player, dealer, amount, userId, deck }) {
  const playerTotal = handValue(player);
  let dealerTotal = handValue(dealer);

  if (playerTotal <= 21) {
    while (dealerTotal < 17) {
      dealer.push(deck.pop());
      dealerTotal = handValue(dealer);
    }
  }

  let payout, statusText, color;
  const playerBJ = playerTotal === 21 && player.length === 2;
  const dealerBJ = dealerTotal === 21 && dealer.length === 2;

  if (playerTotal > 21) {
    payout = 0;
    statusText = `💥 Bust! You lost **${formatMoney(amount)}**.`;
    color = 0xed4245;
  } else if (playerBJ && dealerBJ) {
    payout = amount;
    statusText = `Both have blackjack — push. Your bet was refunded.`;
    color = 0xf5c518;
  } else if (playerBJ) {
    payout = Math.floor(amount * 2.5);
    statusText = `🂡 Blackjack! You won **${formatMoney(payout)}**!`;
    color = 0x57f287;
  } else if (dealerBJ) {
    payout = 0;
    statusText = `Dealer has blackjack. You lost **${formatMoney(amount)}**.`;
    color = 0xed4245;
  } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
    payout = amount * 2;
    statusText = `You won **${formatMoney(payout)}**!`;
    color = 0x57f287;
  } else if (playerTotal === dealerTotal) {
    payout = amount;
    statusText = `Push — your bet was refunded.`;
    color = 0xf5c518;
  } else {
    payout = 0;
    statusText = `You lost **${formatMoney(amount)}**.`;
    color = 0xed4245;
  }

  const updated = payout > 0 ? await db.addBalance(userId, payout) : await db.getUser(userId);

  const embed = buildEmbed({ player, dealer, revealDealer: true, statusText, color })
    .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
  const row = buildButtons(true);

  await respond({ embeds: [embed], components: [row] });
}

const blackjackCommand = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a hand of blackjack against the house')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much to bet').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const userId = interaction.user.id;

    const userRow = await db.getUser(userId);
    if (userRow.balance < amount) {
      return interaction.reply({
        content: `You don't have enough coins. Your balance: ${formatMoney(userRow.balance)}`,
        ephemeral: true,
      });
    }

    await db.addBalance(userId, -amount);

    const deck = freshDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    const playerBlackjack = handValue(player) === 21;
    const dealerBlackjack = handValue(dealer) === 21;

    if (playerBlackjack || dealerBlackjack) {
      return finish({
        respond: (payload) => interaction.reply(payload),
        player, dealer, amount, userId, deck,
      });
    }

    const embed = buildEmbed({ player, dealer, revealDealer: false });
    const row = buildButtons();
    const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 60_000,
    });

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.customId === 'bj_hit') {
        player.push(deck.pop());
        if (handValue(player) > 21) {
          collector.stop('bust');
          await btnInteraction.deferUpdate();
          await finish({ respond: (payload) => btnInteraction.editReply(payload), player, dealer, amount, userId, deck });
          return;
        }
        await btnInteraction.update({
          embeds: [buildEmbed({ player, dealer, revealDealer: false })],
          components: [buildButtons()],
        });
      } else if (btnInteraction.customId === 'bj_stand') {
        collector.stop('stand');
        await btnInteraction.deferUpdate();
        await finish({ respond: (payload) => btnInteraction.editReply(payload), player, dealer, amount, userId, deck });
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time') {
        try {
          await message.edit({ components: [buildButtons(true)] });
        } catch (_) {}
      }
    });
  },
};

module.exports = blackjackCommand;
module.exports.buildEmbed = buildEmbed;
module.exports.buildButtons = buildButtons;
module.exports.finish = finish;
