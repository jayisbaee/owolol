const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../../database');
const { formatMoney, randInt } = require('../../utils/economyUtils');

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠', '♥', '♦', '♣'];

function freshDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}`);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  const rank = card.slice(0, -1);
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function handValue(hand) {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = hand.filter((c) => c.startsWith('A')).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function renderHand(hand) {
  return hand.join(' ');
}

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

module.exports = {
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

    // Bet is taken up front and refunded/paid out based on the result.
    await db.addBalance(userId, -amount);

    const deck = freshDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    const playerBlackjack = handValue(player) === 21;
    const dealerBlackjack = handValue(dealer) === 21;

    if (playerBlackjack || dealerBlackjack) {
      return finish({ interaction, player, dealer, amount, userId, deck, isReply: true });
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
          await finish({ interaction: btnInteraction, player, dealer, amount, userId, deck, isUpdate: true });
          return;
        }
        await btnInteraction.update({
          embeds: [buildEmbed({ player, dealer, revealDealer: false })],
          components: [buildButtons()],
        });
      } else if (btnInteraction.customId === 'bj_stand') {
        collector.stop('stand');
        await finish({ interaction: btnInteraction, player, dealer, amount, userId, deck, isUpdate: true });
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

async function finish({ interaction, player, dealer, amount, userId, deck, isReply, isUpdate }) {
  const playerTotal = handValue(player);
  let dealerTotal = handValue(dealer);

  if (playerTotal <= 21) {
    // Dealer draws to 17+
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

  if (isUpdate) {
    await interaction.update({ embeds: [embed], components: [row] });
  } else if (isReply) {
    await interaction.reply({ embeds: [embed], components: [row] });
  }
}
