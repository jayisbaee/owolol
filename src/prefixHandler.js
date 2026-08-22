const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./database');
const config = require('./config');
const { formatMoney, msToTimeString, isAdmin, randInt } = require('./utils/economyUtils');
const { freshDeck, handValue } = require('./games/blackjackEngine');
const {
  TOTAL_TILES: MINES_TOTAL_TILES,
  MAX_MULTIPLIER: MINES_MAX_MULTIPLIER,
  MINE_CHOICES,
  multiplierFor,
  pickMinePositions,
} = require('./games/minesEngine');
const blackjackCommand = require('./commands/gambling/blackjack');
const minesCommand = require('./commands/gambling/mines');
const { luckAdjustedChance, luckyDiceRoll, applyLuckToReels } = require('./games/luckEngine');

// Maps short aliases to their real command name — resolved in messageCreate.js.
const ALIASES = {
  cf: 'coinflip',
  bj: 'blackjack',
  s: 'slots',
};

// Parses a bet amount argument, supporting the special value "all" to bet
// the user's entire current balance. Returns { amount, isAll } or null if
// the input isn't valid at all (missing/non-numeric/non-"all").
function parseBetAmount(raw, currentBalance) {
  if (!raw) return null;
  if (raw.toLowerCase() === 'all') {
    return { amount: currentBalance, isAll: true };
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { amount: n, isAll: false };
}

// Shows a warning embed with Confirm/Cancel buttons before letting someone
// bet their entire balance. Returns true only if they explicitly confirm
// within the time limit — every other outcome (cancel, timeout, error)
// returns false so the caller can safely bail out.
async function confirmAllIn(message, amount) {
  const warnEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('⚠️ WARNING: All-In Bet')
    .setDescription(
      `You're about to risk your **ENTIRE balance** of **${formatMoney(amount)}**.\n\n` +
      `If you lose, it is **gone**. This cannot be undone.\n\nAre you sure?`
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('allin_confirm').setLabel('Yes, risk it all').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('allin_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  const warnMsg = await message.reply({ embeds: [warnEmbed], components: [row] });

  try {
    const btnInteraction = await warnMsg.awaitMessageComponent({
      filter: (i) => i.user.id === message.author.id,
      time: 30_000,
    });

    if (btnInteraction.customId === 'allin_confirm') {
      await btnInteraction.update({
        embeds: [warnEmbed.setDescription(`✅ Confirmed — risking **${formatMoney(amount)}**...`)],
        components: [],
      });
      return true;
    }

    await btnInteraction.update({ content: '❌ Cancelled — no coins were risked.', embeds: [], components: [] });
    return false;
  } catch (_) {
    await warnMsg.edit({ content: '⏳ Confirmation timed out — bet cancelled.', embeds: [], components: [] }).catch(() => {});
    return false;
  }
}

// Resolves a "target user" from a mention (<@id>) or a raw numeric ID in args[0].
// Falls back to the message author if nothing valid was given.
async function resolveTarget(message, args) {
  const raw = args[0];
  if (!raw) return message.author;

  const mentionMatch = raw.match(/^<@!?(\d+)>$/);
  const id = mentionMatch ? mentionMatch[1] : (/^\d+$/.test(raw) ? raw : null);
  if (!id) return null;

  try {
    return await message.client.users.fetch(id);
  } catch (_) {
    return null;
  }
}

function parseAmount(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const JOBS = [
  'delivered pizzas', 'walked dogs', 'mowed lawns', 'fixed a computer',
  'busked on the street', 'tutored a kid in math', 'washed cars',
  'sold lemonade', 'streamed for 3 hours', 'flipped burgers',
];

const SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎'];
const MULTIPLIERS = { '🍒': 2, '🍋': 3, '🍇': 4, '🔔': 6, '⭐': 10, '💎': 25 };

const handlers = {
  async balance(message, args) {
    const target = (await resolveTarget(message, args)) || message.author;
    const row = await db.getUser(target.id);
    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: 'Wallet', value: formatMoney(row.balance), inline: true },
        { name: 'Bank', value: formatMoney(row.bank), inline: true }
      );
    await message.reply({ embeds: [embed] });
  },

  async daily(message) {
    const userId = message.author.id;
    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_daily ? new Date(row.last_daily).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.dailyCooldownMs) {
      const remaining = config.dailyCooldownMs - elapsed;
      return message.reply(`⏳ You already claimed your daily. Come back in **${msToTimeString(remaining)}**.`);
    }

    await db.addBalance(userId, config.dailyAmount);
    await db.setLastDaily(userId, new Date(now));
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`✅ You claimed your daily and received **${formatMoney(config.dailyAmount)}**!`);
    await message.reply({ embeds: [embed] });
  },

  async work(message) {
    const userId = message.author.id;
    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_work ? new Date(row.last_work).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.workCooldownMs) {
      const remaining = config.workCooldownMs - elapsed;
      return message.reply(`⏳ You're tired. Rest for **${msToTimeString(remaining)}** before working again.`);
    }

    const earned = randInt(config.workMin, config.workMax);
    const job = JOBS[randInt(0, JOBS.length - 1)];
    await db.addBalance(userId, earned);
    await db.setLastWork(userId, new Date(now));
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`💼 You ${job} and earned **${formatMoney(earned)}**!`);
    await message.reply({ embeds: [embed] });
  },

  async give(message, args) {
    const target = await resolveTarget(message, args);
    const amount = parseAmount(args[1]);

    if (!target) return message.reply(`Usage: \`${config.prefix}give @user <amount>\``);
    if (!amount) return message.reply('Please give a valid positive amount.');
    if (target.id === message.author.id) return message.reply("You can't give coins to yourself.");
    if (target.bot) return message.reply("You can't give coins to a bot.");

    const sender = await db.getUser(message.author.id);
    if (sender.balance < amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(sender.balance)}`);
    }

    await db.addBalance(message.author.id, -amount);
    await db.addBalance(target.id, amount);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`🤝 **${message.author.username}** gave **${formatMoney(amount)}** to **${target.username}**!`);
    await message.reply({ embeds: [embed] });
  },

  async leaderboard(message) {
    const rows = await db.getLeaderboard(10);
    if (rows.length === 0) return message.reply('No one has any coins yet!');

    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(
      rows.map(async (row, i) => {
        let name = `<@${row.user_id}>`;
        try {
          const user = await message.client.users.fetch(row.user_id);
          name = user.username;
        } catch (_) {}
        const rank = medals[i] || `${i + 1}.`;
        return `${rank} **${name}** — ${formatMoney(row.balance)}`;
      })
    );

    const embed = new EmbedBuilder().setColor(0xf5c518).setTitle('💰 Richest Users').setDescription(lines.join('\n'));
    await message.reply({ embeds: [embed] });
  },

  async coinflip(message, args) {
    const side = (args[1] || '').toLowerCase();
    if (!args[0]) return message.reply(`Usage: \`${config.prefix}coinflip <amount|all> <heads|tails>\``);
    if (!['heads', 'tails'].includes(side)) return message.reply('Pick a side: `heads` or `tails`.');

    const userId = message.author.id;
    const user = await db.getUser(userId);
    const parsed = parseBetAmount(args[0], user.balance);
    if (!parsed) return message.reply('Please give a valid positive amount, or `all`.');

    if (parsed.isAll) {
      if (user.balance <= 0) return message.reply("You don't have any coins to bet.");
      const confirmed = await confirmAllIn(message, user.balance);
      if (!confirmed) return;
    } else if (user.balance < parsed.amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const fresh = await db.getUser(userId);
    const amount = parsed.isAll ? fresh.balance : parsed.amount;
    if (amount <= 0) return message.reply('You have no balance left to bet.');

    const result = Math.random() < luckAdjustedChance(0.5, fresh.luck) ? side : (side === 'heads' ? 'tails' : 'heads');
    const won = result === side;
    const updated = await db.addBalance(userId, won ? amount : -amount);

    const embed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setTitle(`🪙 The coin landed on ${result}!`)
      .setDescription(won ? `You won **${formatMoney(amount)}**!` : `You lost **${formatMoney(amount)}**.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async dice(message, args) {
    if (!args[0]) return message.reply(`Usage: \`${config.prefix}dice <amount|all>\``);

    const userId = message.author.id;
    const user = await db.getUser(userId);
    const parsed = parseBetAmount(args[0], user.balance);
    if (!parsed) return message.reply('Please give a valid positive amount, or `all`.');

    if (parsed.isAll) {
      if (user.balance <= 0) return message.reply("You don't have any coins to bet.");
      const confirmed = await confirmAllIn(message, user.balance);
      if (!confirmed) return;
    } else if (user.balance < parsed.amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const fresh = await db.getUser(userId);
    const amount = parsed.isAll ? fresh.balance : parsed.amount;
    if (amount <= 0) return message.reply('You have no balance left to bet.');

    const { outcome, yourRoll, houseRoll } = luckyDiceRoll(fresh.luck, randInt);
    let delta, resultText, color;
    if (outcome === 'win') {
      delta = amount; resultText = `You won **${formatMoney(amount)}**!`; color = 0x57f287;
    } else if (outcome === 'loss') {
      delta = -amount; resultText = `You lost **${formatMoney(amount)}**.`; color = 0xed4245;
    } else {
      delta = 0; resultText = `It's a tie — your bet was refunded.`; color = 0xf5c518;
    }
    const updated = await db.addBalance(userId, delta);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🎲 Dice Roll-off')
      .setDescription(`You rolled **${yourRoll}**, the house rolled **${houseRoll}**.\n${resultText}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async slots(message, args) {
    if (!args[0]) return message.reply(`Usage: \`${config.prefix}slots <amount|all>\` (or \`${config.prefix}s <amount>\`)`);

    const userId = message.author.id;
    const user = await db.getUser(userId);
    const parsed = parseBetAmount(args[0], user.balance);
    if (!parsed) return message.reply('Please give a valid positive amount, or `all`.');

    if (parsed.isAll) {
      if (user.balance <= 0) return message.reply("You don't have any coins to bet.");
      const confirmed = await confirmAllIn(message, user.balance);
      if (!confirmed) return;
    } else if (user.balance < parsed.amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const fresh = await db.getUser(userId);
    const amount = parsed.isAll ? fresh.balance : parsed.amount;
    if (amount <= 0) return message.reply('You have no balance left to bet.');

    const reels = applyLuckToReels(
      [0, 0, 0].map(() => SYMBOLS[randInt(0, SYMBOLS.length - 1)]),
      fresh.luck,
      SYMBOLS,
      randInt
    );
    const allMatch = reels[0] === reels[1] && reels[1] === reels[2];
    const twoMatch = !allMatch && (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]);

    let delta, resultText, color;
    if (allMatch) {
      const mult = MULTIPLIERS[reels[0]];
      delta = amount * mult;
      resultText = `JACKPOT! All three match for a **${mult}x** payout — you won **${formatMoney(delta)}**!`;
      color = 0x57f287;
    } else if (twoMatch) {
      delta = Math.floor(amount * 0.5);
      resultText = `Two matched — small win! You got back **${formatMoney(delta)}**.`;
      color = 0xf5c518;
    } else {
      delta = -amount;
      resultText = `No match. You lost **${formatMoney(amount)}**.`;
      color = 0xed4245;
    }
    const updated = await db.addBalance(userId, delta);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🎰 Slots')
      .setDescription(`[ ${reels.join(' | ')} ]\n\n${resultText}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async addmoney(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const amount = parseAmount(args.find((a) => parseAmount(a)));
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (!amount) return message.reply(`Usage: \`${config.prefix}addmoney <amount> [@user]\``);
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.addBalance(finalTarget.id, amount);
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`✅ Added **${formatMoney(amount)}** to **${finalTarget.username}**'s balance.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async removemoney(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const amount = parseAmount(args.find((a) => parseAmount(a)));
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (!amount) return message.reply(`Usage: \`${config.prefix}removemoney <amount> [@user]\``);
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.addBalance(finalTarget.id, -amount);
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription(`✅ Removed **${formatMoney(amount)}** from **${finalTarget.username}**'s balance.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async setmoney(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const amountRaw = args.find((a) => /^\d+$/.test(a));
    const amount = amountRaw !== undefined ? parseInt(amountRaw, 10) : null;
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (amount === null) return message.reply(`Usage: \`${config.prefix}setmoney <amount> [@user]\``);
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.setBalance(finalTarget.id, amount);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`✅ Set **${finalTarget.username}**'s balance to **${formatMoney(updated.balance)}**.`);
    await message.reply({ embeds: [embed] });
  },

  async setluck(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const amountRaw = args.find((a) => /^-?\d+$/.test(a));
    const amount = amountRaw !== undefined ? parseInt(amountRaw, 10) : null;
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (amount === null) return message.reply(`Usage: \`${config.prefix}setluck <amount -100..100> [@user]\``);
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.setLuck(finalTarget.id, amount);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`🍀 Set **${finalTarget.username}**'s luck to **${updated.luck}**.`);
    await message.reply({ embeds: [embed] });
  },

  async addluck(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const amountRaw = args.find((a) => /^-?\d+$/.test(a));
    const amount = amountRaw !== undefined ? parseInt(amountRaw, 10) : null;
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (amount === null) return message.reply(`Usage: \`${config.prefix}addluck <amount> [@user]\` (negative to remove)`);
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.addLuck(finalTarget.id, amount);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`🍀 Adjusted **${finalTarget.username}**'s luck by **${amount >= 0 ? '+' : ''}${amount}**. New luck: **${updated.luck}**.`);
    await message.reply({ embeds: [embed] });
  },

  async removeluck(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const amountRaw = args.find((a) => /^\d+$/.test(a));
    const amount = amountRaw !== undefined ? parseInt(amountRaw, 10) : null;
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (amount === null) return message.reply(`Usage: \`${config.prefix}removeluck <amount> [@user]\``);
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.addLuck(finalTarget.id, -amount);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`🍀 Removed **${amount}** luck from **${finalTarget.username}**. New luck: **${updated.luck}**.`);
    await message.reply({ embeds: [embed] });
  },

  async luck(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const target = (await resolveTarget(message, args)) || message.author;
    const row = await db.getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`🍀 **${target.username}**'s luck: **${row.luck}** (range: -100 to 100, 0 is neutral)`);
    await message.reply({ embeds: [embed] });
  },

  async resetalleconomy(message) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');

    const userCount = await db.getUserCount();
    const warnEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚠️ WARNING: Full Economy Reset')
      .setDescription(
        `This will set **every tracked user's balance to 0** — that's **${userCount}** user${userCount === 1 ? '' : 's'}.\n\n` +
        `This cannot be undone. Luck stats are not affected.\n\nAre you sure?`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reset_confirm').setLabel('Yes, reset everyone').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reset_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    const sent = await message.reply({ embeds: [warnEmbed], components: [row] });

    let btnInteraction;
    try {
      btnInteraction = await sent.awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 30_000,
      });
    } catch (_) {
      await sent.edit({ content: '⏳ Confirmation timed out — nothing was reset.', embeds: [], components: [] }).catch(() => {});
      return;
    }

    if (btnInteraction.customId === 'reset_cancel') {
      await btnInteraction.update({ content: '❌ Cancelled — no changes made.', embeds: [], components: [] });
      return;
    }

    await btnInteraction.deferUpdate();
    const affected = await db.resetAllBalances();
    await btnInteraction.editReply({
      content: `✅ Done. Reset **${affected}** user${affected === 1 ? '' : 's'}' balances to 0.`,
      embeds: [],
      components: [],
    });
  },

  async blackjack(message, args) {
    if (!args[0]) return message.reply(`Usage: \`${config.prefix}blackjack <amount|all>\` (or \`${config.prefix}bj <amount>\`)`);

    const userId = message.author.id;
    const user = await db.getUser(userId);
    const parsed = parseBetAmount(args[0], user.balance);
    if (!parsed) return message.reply('Please give a valid positive amount, or `all`.');

    if (parsed.isAll) {
      if (user.balance <= 0) return message.reply("You don't have any coins to bet.");
      const confirmed = await confirmAllIn(message, user.balance);
      if (!confirmed) return;
    } else if (user.balance < parsed.amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const fresh = await db.getUser(userId);
    const amount = parsed.isAll ? fresh.balance : parsed.amount;
    if (amount <= 0) return message.reply('You have no balance left to bet.');

    await db.addBalance(userId, -amount);

    const deck = freshDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    const playerBlackjack = handValue(player) === 21;
    const dealerBlackjack = handValue(dealer) === 21;

    if (playerBlackjack || dealerBlackjack) {
      return blackjackCommand.finish({
        respond: (payload) => message.reply(payload),
        player, dealer, amount, userId, deck,
      });
    }

    const embed = blackjackCommand.buildEmbed({ player, dealer, revealDealer: false });
    const row = blackjackCommand.buildButtons();
    const sent = await message.reply({ embeds: [embed], components: [row] });

    const collector = sent.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 60_000,
    });

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.customId === 'bj_hit') {
        player.push(deck.pop());
        if (handValue(player) > 21) {
          collector.stop('bust');
          await btnInteraction.deferUpdate();
          await blackjackCommand.finish({
            respond: (payload) => btnInteraction.editReply(payload),
            player, dealer, amount, userId, deck,
          });
          return;
        }
        await btnInteraction.update({
          embeds: [blackjackCommand.buildEmbed({ player, dealer, revealDealer: false })],
          components: [blackjackCommand.buildButtons()],
        });
      } else if (btnInteraction.customId === 'bj_stand') {
        collector.stop('stand');
        await btnInteraction.deferUpdate();
        await blackjackCommand.finish({
          respond: (payload) => btnInteraction.editReply(payload),
          player, dealer, amount, userId, deck,
        });
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time') {
        try {
          await sent.edit({ components: [blackjackCommand.buildButtons(true)] });
        } catch (_) {}
      }
    });
  },

  async mines(message, args) {
    if (!args[0]) return message.reply(`Usage: \`${config.prefix}mines <amount|all> [mines: 1|3|5|8]\``);

    const minesArg = args[1] ? parseInt(args[1], 10) : 3;
    const mines = MINE_CHOICES.includes(minesArg) ? minesArg : 3;

    const userId = message.author.id;
    const user = await db.getUser(userId);
    const parsed = parseBetAmount(args[0], user.balance);
    if (!parsed) return message.reply('Please give a valid positive amount, or `all`.');

    if (parsed.isAll) {
      if (user.balance <= 0) return message.reply("You don't have any coins to bet.");
      const confirmed = await confirmAllIn(message, user.balance);
      if (!confirmed) return;
    } else if (user.balance < parsed.amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const fresh = await db.getUser(userId);
    const amount = parsed.isAll ? fresh.balance : parsed.amount;
    if (amount <= 0) return message.reply('You have no balance left to bet.');

    await db.addBalance(userId, -amount);

    const minePositions = pickMinePositions(mines);
    const revealed = new Set();
    let gameOver = false;

    const embed = minesCommand.buildEmbed({ amount, mines, revealed, gameOver });
    const components = minesCommand.buildGrid({ minePositions, revealed, gameOver, revealMines: false });
    const sent = await message.reply({ embeds: [embed], components });

    const collector = sent.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 5 * 60_000,
    });

    collector.on('collect', async (btnInteraction) => {
      if (gameOver) return;

      if (btnInteraction.customId === 'mines_cashout') {
        gameOver = true;
        await btnInteraction.deferUpdate();
        const mult = multiplierFor(revealed.size, mines);
        const payout = Math.floor(amount * mult);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = minesCommand.buildEmbed({
          amount, mines, revealed, gameOver: true, color: 0x57f287,
          statusText: `💰 Cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**!`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
        const finalComponents = minesCommand.buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        await btnInteraction.editReply({ embeds: [finalEmbed], components: finalComponents });
        collector.stop('cashout');
        return;
      }

      const match = btnInteraction.customId.match(/^mines_tile_(\d+)$/);
      if (!match) return;
      const idx = parseInt(match[1], 10);
      if (revealed.has(idx)) return;

      if (minePositions.has(idx)) {
        gameOver = true;
        const finalEmbed = minesCommand.buildEmbed({
          amount, mines, revealed, gameOver: true, color: 0xed4245,
          statusText: `💥 Boom! You hit a mine and lost **${formatMoney(amount)}**.`,
        });
        const finalComponents = minesCommand.buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        await btnInteraction.update({ embeds: [finalEmbed], components: finalComponents });
        collector.stop('mine');
        return;
      }

      revealed.add(idx);
      const safeCount = MINES_TOTAL_TILES - mines;

      if (revealed.size === safeCount) {
        gameOver = true;
        await btnInteraction.deferUpdate();
        const payout = Math.floor(amount * MINES_MAX_MULTIPLIER);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = minesCommand.buildEmbed({
          amount, mines, revealed, gameOver: true, color: 0x57f287,
          statusText: `🏆 You cleared the board! Max payout: **${formatMoney(payout)}**!`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
        const finalComponents = minesCommand.buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        await btnInteraction.editReply({ embeds: [finalEmbed], components: finalComponents });
        collector.stop('cleared');
        return;
      }

      const updatedEmbed = minesCommand.buildEmbed({ amount, mines, revealed, gameOver: false });
      const updatedComponents = minesCommand.buildGrid({ minePositions, revealed, gameOver: false, revealMines: false });
      await btnInteraction.update({ embeds: [updatedEmbed], components: updatedComponents });
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time' && !gameOver) {
        gameOver = true;
        const mult = multiplierFor(revealed.size, mines);
        const payout = Math.floor(amount * mult);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = minesCommand.buildEmbed({
          amount, mines, revealed, gameOver: true, color: 0xf5c518,
          statusText: `⏳ Timed out — auto cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**.`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
        const finalComponents = minesCommand.buildGrid({ minePositions, revealed, gameOver: true, revealMines: true });
        try {
          await sent.edit({ embeds: [finalEmbed], components: finalComponents });
        } catch (_) {}
      }
    });
  },

  async jackpot(message) {
    const userId = message.author.id;
    const user = await db.getUser(userId);

    if (user.balance <= 0) {
      return message.reply(`You don't have any coins to risk. Your balance: ${formatMoney(user.balance)}`);
    }

    const confirmed = await confirmAllIn(message, user.balance);
    if (!confirmed) return;

    const fresh = await db.getUser(userId);
    const stake = fresh.balance;
    if (stake <= 0) return message.reply('You have no balance left to risk.');

    const won = Math.random() < luckAdjustedChance(0.5, fresh.luck);
    const delta = won ? stake : -stake;
    const updated = await db.addBalance(userId, delta);

    const embed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setTitle('🎰 JACKPOT')
      .setDescription(
        won
          ? `🎉 **YOU WON!** Your **${formatMoney(stake)}** balance was doubled!`
          : `💀 **YOU LOST EVERYTHING.** Your **${formatMoney(stake)}** balance is gone.`
      )
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async help(message) {
    const p = config.prefix;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📖 Commands')
      .setDescription(
        `Both \`/slash\` commands and \`${p}prefix\` commands work.\n\n` +
        `**Economy**\n\`${p}balance [@user]\`, \`${p}daily\`, \`${p}work\`, \`${p}give @user <amount>\`, \`${p}leaderboard\`\n\n` +
        `**Gambling**\n\`${p}coinflip <amount|all> <heads|tails>\` (\`${p}cf\`), \`${p}dice <amount|all>\`, ` +
        `\`${p}slots <amount|all>\` (\`${p}s\`), \`${p}blackjack <amount|all>\` (\`${p}bj\`), ` +
        `\`${p}mines <amount|all> [mines]\`, \`${p}jackpot\` (risk your whole balance for 2x or nothing)\n\n` +
        `**Admin**\n\`${p}addmoney <amount> [@user]\`, \`${p}removemoney <amount> [@user]\`, \`${p}setmoney <amount> [@user]\`\n` +
        `\`${p}setluck <-100..100> [@user]\`, \`${p}addluck <amount> [@user]\`, \`${p}removeluck <amount> [@user]\`, \`${p}luck [@user]\`\n` +
        `\`${p}resetalleconomy\` (wipes every balance to 0, requires confirmation)\n\n` +
        `Tip: type \`all\` instead of an amount on any gambling command to bet your whole balance (with a confirmation step).`
      );
    await message.reply({ embeds: [embed] });
  },
};

module.exports = { handlers, ALIASES };
