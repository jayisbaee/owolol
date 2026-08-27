const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ICONS = require('./games/icons');
const db = require('./database');
const config = require('./config');
const { formatMoney, formatCompactMoney, msToTimeString, isAdmin, randInt } = require('./utils/economyUtils');
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
const crossroadCommand = require('./commands/gambling/crossroad');
const {
  TOTAL_LANES: ROAD_TOTAL_LANES,
  MAX_MULTIPLIER: ROAD_MAX_MULTIPLIER,
  BASE_SURVIVAL_CHANCE: ROAD_SURVIVAL_CHANCE,
  multiplierFor: multiplierForRoad,
} = require('./games/crossroadEngine');
const { luckAdjustedChance, luckyDiceRoll, applyLuckToReels } = require('./games/luckEngine');
const { applyPetToChance, applyPetToPayout } = require('./games/petEngine');
const {
  RARITIES: CRATE_RARITIES,
  RARITY_KEYS: CRATE_RARITY_KEYS,
  pickWeightedRarity,
  luckWeightedReward,
} = require('./games/crateEngine');
const { ITEMS: SHOP_ITEMS, ITEM_KEYS: SHOP_ITEM_KEYS } = require('./games/shopEngine');
const { sendAsCasino } = require('./utils/casinoWebhook');
const { FLEE_LINES, pickWeightedMonster } = require('./games/huntEngine');
const { buildHelpDescription } = require('./games/helpText');

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

const QUESTS = [
  'rescued a cat stuck in a tree and the owner tipped you',
  'delivered a mysterious package across town',
  'solved a riddle for a traveling wizard',
  'helped a farmer round up escaped chickens',
  'found a lost wallet and returned it for a reward',
  'guided some lost tourists to their hotel',
  'fixed a leaky faucet for a grateful neighbor',
  'won a local trivia night',
  'helped move furniture for a new apartment',
  'found some spare change while cleaning the couch',
];

const BEGGARS = [
  'a kind stranger', 'a friendly cashier', 'a passing jogger', 'your neighbor',
  'a street performer', 'a coffee shop barista', 'a generous tourist', 'an old friend',
];

const NOTHING_LINES = [
  'Nobody had any spare change for you.',
  'You got a lot of awkward stares and nothing else.',
  'A dog barked at you. No money though.',
  'Someone said "get a job" and walked off.',
];

const CRIMES = [
  "picked a stranger's pocket",
  'hacked into a vending machine',
  'ran a small con on a busy street',
  'snuck into a fancy event and grabbed some cash',
  'pulled off a quick scheme downtown',
];

const CAUGHT_LINES = [
  'A security guard spotted you.',
  'You tripped an alarm.',
  'Someone recognized you and called it out.',
  'You got cornered by the police.',
];

const SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎'];
const MULTIPLIERS = { '🍒': 2, '🍋': 3, '🍇': 4, '🔔': 6, '⭐': 10, '💎': 25 };

const handlers = {
  async balance(message, args) {
    const target = (await resolveTarget(message, args)) || message.author;
    const row = await db.getUser(target.id);
    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setThumbnail(ICONS.balance)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: 'Wallet', value: formatMoney(row.balance), inline: true },
        { name: 'Bank', value: formatMoney(row.bank), inline: true }
      );
    await message.reply({ embeds: [embed] });
  },

  async deposit(message, args) {
    const userId = message.author.id;
    const user = await db.getUser(userId);
    const raw = (args[0] || '').toLowerCase();
    const amount = raw === 'all' ? user.balance : parseAmount(args[0]);

    if (!amount) return message.reply(`Usage: \`${config.prefix}deposit <amount|all>\``);
    if (user.balance < amount) {
      return message.reply(`You don't have that much in your wallet. Wallet balance: ${formatMoney(user.balance)}`);
    }
    if (amount <= 0) return message.reply('You have nothing to deposit.');

    await db.addBalance(userId, -amount);
    const updated = await db.addBank(userId, amount);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setThumbnail(ICONS.bank)
      .setDescription(`🏦 Deposited **${formatMoney(amount)}** into your bank.`)
      .addFields(
        { name: 'Wallet', value: formatMoney(updated.balance), inline: true },
        { name: 'Bank', value: formatMoney(updated.bank), inline: true }
      );
    await message.reply({ embeds: [embed] });
  },

  async withdraw(message, args) {
    const userId = message.author.id;
    const user = await db.getUser(userId);
    const raw = (args[0] || '').toLowerCase();
    const amount = raw === 'all' ? user.bank : parseAmount(args[0]);

    if (!amount) return message.reply(`Usage: \`${config.prefix}withdraw <amount|all>\``);
    if (user.bank < amount) {
      return message.reply(`You don't have that much in your bank. Bank balance: ${formatMoney(user.bank)}`);
    }
    if (amount <= 0) return message.reply('You have nothing to withdraw.');

    await db.addBank(userId, -amount);
    const updated = await db.addBalance(userId, amount);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setThumbnail(ICONS.bank)
      .setDescription(`🏦 Withdrew **${formatMoney(amount)}** from your bank.`)
      .addFields(
        { name: 'Wallet', value: formatMoney(updated.balance), inline: true },
        { name: 'Bank', value: formatMoney(updated.bank), inline: true }
      );
    await message.reply({ embeds: [embed] });
  },

  async shop(message) {
    const lines = SHOP_ITEM_KEYS.map((key) => {
      const item = SHOP_ITEMS[key];
      return `${item.emoji} **${item.label}** — ${formatMoney(item.cost)}\n${item.description}\n*Buy with:* \`${config.prefix}buy ${key}\``;
    });
    const embed = new EmbedBuilder().setColor(0x5865f2).setThumbnail(ICONS.shop).setTitle('🛒 Shop').setDescription(lines.join('\n\n'));
    await message.reply({ embeds: [embed] });
  },

  async buy(message, args) {
    const itemKey = (args[0] || '').toLowerCase();
    const item = SHOP_ITEMS[itemKey];
    const amount = args[1] ? parseInt(args[1], 10) : 1;

    if (!item || !amount || amount < 1) {
      return message.reply(`Usage: \`${config.prefix}buy <${SHOP_ITEM_KEYS.join('|')}> [amount]\``);
    }

    const totalCost = item.cost * amount;
    const userId = message.author.id;
    const user = await db.getUser(userId);

    if (user.balance < totalCost) {
      return message.reply(`You don't have enough coins. **${amount}x ${item.label}** costs ${formatMoney(totalCost)}, but your wallet has ${formatMoney(user.balance)}.`);
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

    const embed = new EmbedBuilder().setColor(0x57f287).setThumbnail(ICONS.shop).setDescription(confirmationLine);
    await message.reply({ embeds: [embed] });
  },

  async vaultbreak(message, args) {
    const target = await resolveTarget(message, args);
    if (!target) return message.reply(`Usage: \`${config.prefix}vaultbreak @user\``);

    const userId = message.author.id;
    if (target.id === userId) return message.reply("You can't break into your own vault.");
    if (target.bot) return message.reply("You can't rob a bot.");

    const attacker = await db.getUser(userId);
    if (attacker.drills < 1) {
      return message.reply(`You need an **Electric Drill** to attempt this. Buy one with \`${config.prefix}buy drill\` (costs ${formatMoney(config.drillCost)}).`);
    }

    const now = Date.now();
    const last = attacker.last_vaultbreak ? new Date(attacker.last_vaultbreak).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.vaultbreakCooldownMs) {
      const remaining = config.vaultbreakCooldownMs - elapsed;
      return message.reply(`⏳ Your drill needs to cool down. Try again in **${msToTimeString(remaining)}**.`);
    }

    const victim = await db.getUser(target.id);
    if (victim.bank < config.vaultbreakMinTargetBank) {
      return message.reply(`**${target.username}**'s vault doesn't have enough in it to be worth cracking (needs at least ${formatMoney(config.vaultbreakMinTargetBank)}).`);
    }

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
        .setThumbnail(ICONS.vaultbreak)
        .setTitle('🔩 Vault Cracked!')
        .setDescription(`Your drill broke through **${target.username}**'s vault and you got away with **${formatMoney(stolen)}**!`)
        .setFooter({ text: `New wallet balance: ${formatMoney(updatedAttacker.balance)}` });
      await message.reply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setThumbnail(ICONS.vaultbreak)
        .setTitle('🚨 Vault Break Failed!')
        .setDescription(`The drill broke and the vault held. **${target.username}**'s bank is untouched. You'll need another drill to try again.`);
      await message.reply({ embeds: [embed] });
    }
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
    await db.addCrates(userId, 'common', 1);
    await db.setLastDaily(userId, new Date(now));
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setThumbnail(ICONS.daily)
      .setDescription(
        `✅ You claimed your daily and received **${formatMoney(config.dailyAmount)}**!\n` +
        `${CRATE_RARITIES.common.emoji} You also got a **Common Crate**! Use \`${config.prefix}opencrate common\` to open it.`
      );
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
      .setThumbnail(ICONS.work)
      .setDescription(`💼 You ${job} and earned **${formatMoney(earned)}**!`);
    await message.reply({ embeds: [embed] });
  },

  async quest(message) {
    const userId = message.author.id;
    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_quest ? new Date(row.last_quest).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.questCooldownMs) {
      const remaining = config.questCooldownMs - elapsed;
      return message.reply(`⏳ Your next quest isn't ready yet. Come back in **${msToTimeString(remaining)}**.`);
    }

    const earned = randInt(config.questMin, config.questMax);
    const quest = QUESTS[randInt(0, QUESTS.length - 1)];
    await db.addBalance(userId, earned);
    await db.setLastQuest(userId, new Date(now));

    let crateLine = '';
    if (Math.random() < config.questCrateChance) {
      const rarityKey = pickWeightedRarity();
      const rarity = CRATE_RARITIES[rarityKey];
      await db.addCrates(userId, rarityKey, 1);
      crateLine = `\n${rarity.emoji} You also found a **${rarity.label} Crate**!`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setThumbnail(ICONS.quest)
      .setTitle('🗺️ Quest Complete!')
      .setDescription(`You ${quest} and earned **${formatMoney(earned)}**!${crateLine}`);
    await message.reply({ embeds: [embed] });
  },

  async beg(message) {
    const userId = message.author.id;
    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_beg ? new Date(row.last_beg).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.begCooldownMs) {
      const remaining = config.begCooldownMs - elapsed;
      return message.reply(`⏳ Give it a moment. You can beg again in **${msToTimeString(remaining)}**.`);
    }

    await db.setLastBeg(userId, new Date(now));

    if (Math.random() < config.begNothingChance) {
      const line = NOTHING_LINES[randInt(0, NOTHING_LINES.length - 1)];
      const embed = new EmbedBuilder().setColor(0x99aab5).setThumbnail(ICONS.beg).setTitle('🙏 Begging').setDescription(line);
      return message.reply({ embeds: [embed] });
    }

    const earned = randInt(config.begMin, config.begMax);
    const giver = BEGGARS[randInt(0, BEGGARS.length - 1)];
    const updated = await db.addBalance(userId, earned);
    const embed = new EmbedBuilder()
      .setColor(0x99aab5)
      .setThumbnail(ICONS.beg)
      .setTitle('🙏 Begging')
      .setDescription(`${giver} felt bad for you and gave you **${formatMoney(earned)}**.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async crime(message) {
    const userId = message.author.id;
    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_crime ? new Date(row.last_crime).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.crimeCooldownMs) {
      const remaining = config.crimeCooldownMs - elapsed;
      return message.reply(`⏳ Lay low a bit longer. You can try again in **${msToTimeString(remaining)}**.`);
    }

    await db.setLastCrime(userId, new Date(now));

    const successChance = luckAdjustedChance(config.crimeSuccessChance, row.luck);
    const success = Math.random() < successChance;

    if (success) {
      const earned = randInt(config.crimeMin, config.crimeMax);
      const crime = CRIMES[randInt(0, CRIMES.length - 1)];
      const updated = await db.addBalance(userId, earned);
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setThumbnail(ICONS.crime)
        .setTitle('🎭 Crime Successful!')
        .setDescription(`You ${crime} and got away with **${formatMoney(earned)}**!`)
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
      await message.reply({ embeds: [embed] });
    } else {
      const penalty = Math.max(1, Math.floor(row.balance * config.crimeFailPenaltyPct));
      const updated = await db.addBalance(userId, -penalty);
      const line = CAUGHT_LINES[randInt(0, CAUGHT_LINES.length - 1)];
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setThumbnail(ICONS.crime)
        .setTitle('🚨 Busted!')
        .setDescription(`${line} You paid a fine of **${formatMoney(penalty)}**.`)
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
      await message.reply({ embeds: [embed] });
    }
  },

  async hunt(message) {
    const userId = message.author.id;
    const row = await db.getUser(userId);
    const now = Date.now();
    const last = row.last_hunt ? new Date(row.last_hunt).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.huntCooldownMs) {
      const remaining = config.huntCooldownMs - elapsed;
      return message.reply(`⏳ You're still resting up from the last hunt. Try again in **${msToTimeString(remaining)}**.`);
    }

    await db.setLastHunt(userId, new Date(now));

    const monster = pickWeightedMonster();
    const winChance = luckAdjustedChance(monster.successChance, row.luck);
    const won = Math.random() < winChance;

    if (!won) {
      const line = FLEE_LINES[randInt(0, FLEE_LINES.length - 1)];
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setThumbnail(ICONS.hunt)
        .setTitle(`${monster.emoji} A wild ${monster.name} appeared!`)
        .setDescription(`${line}\n\nNo reward this time — try again once your cooldown resets.`);
      return message.reply({ embeds: [embed] });
    }

    const reward = randInt(monster.minReward, monster.maxReward);
    const updated = await db.addBalance(userId, reward);

    let crateLine = '';
    if (Math.random() < monster.crateChance) {
      const rarityKey = pickWeightedRarity();
      const rarity = CRATE_RARITIES[rarityKey];
      await db.addCrates(userId, rarityKey, 1);
      crateLine = `\n${rarity.emoji} It also dropped a **${rarity.label} Crate**!`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setThumbnail(ICONS.hunt)
      .setTitle(`${monster.emoji} You defeated a ${monster.name}!`)
      .setDescription(`You earned **${formatMoney(reward)}**!${crateLine}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async crates(message, args) {
    const target = (await resolveTarget(message, args)) || message.author;
    const row = await db.getUser(target.id);

    const lines = CRATE_RARITY_KEYS.map((key) => {
      const rarity = CRATE_RARITIES[key];
      const count = row[`crates_${key}`] || 0;
      return `${rarity.emoji} **${rarity.label}**: ${count}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setThumbnail(ICONS.crate)
      .setAuthor({ name: `${target.username}'s Crates`, iconURL: target.displayAvatarURL() })
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Use ${config.prefix}opencrate <rarity> to open one` });
    await message.reply({ embeds: [embed] });
  },

  async raffle(message) {
    const userId = message.author.id;
    const user = await db.getUser(userId);

    if (user.tickets < 1) {
      return message.reply("You don't have any raffle tickets. Ask the bot owner for some!");
    }

    await db.addTickets(userId, -1);

    const winChance = luckAdjustedChance(config.raffleWinChance, user.luck);
    const won = Math.random() < winChance;

    if (won) {
      const updated = await db.addBalance(userId, config.raffleJackpot);
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setThumbnail(ICONS.ticket)
        .setTitle('🎟️ JACKPOT!!!')
        .setDescription(
          `The raffle wheel spins... and lands on **YOU**!\n\n` +
          `You won the jackpot of **${formatCompactMoney(config.raffleJackpot)}**!`
        )
        .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
      await message.reply({ embeds: [embed] });
    } else {
      const remaining = await db.getUser(userId);
      const embed = new EmbedBuilder()
        .setColor(0x99aab5)
        .setThumbnail(ICONS.ticket)
        .setTitle('🎟️ No Luck This Time')
        .setDescription(`The wheel spins... and lands on someone else. Better luck next ticket!`)
        .setFooter({ text: `Tickets remaining: ${remaining.tickets}` });
      await message.reply({ embeds: [embed] });
    }
  },

  async tickets(message, args) {
    const target = (await resolveTarget(message, args)) || message.author;
    const row = await db.getUser(target.id);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.ticket)
      .setDescription(`🎟️ **${target.username}** has **${row.tickets}** raffle ticket${row.tickets === 1 ? '' : 's'}.`);
    await message.reply({ embeds: [embed] });
  },

  async givetickets(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');

    const amountRaw = args.find((a) => /^\d+$/.test(a));
    const amount = amountRaw !== undefined ? parseInt(amountRaw, 10) : null;
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (!amount) return message.reply(`Usage: \`${config.prefix}givetickets <amount> [@user]\``);
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.addTickets(finalTarget.id, amount);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.ticket)
      .setDescription(`🎟️ Gave **${amount}x Raffle Ticket${amount === 1 ? '' : 's'}** to **${finalTarget.username}**. They now have **${updated.tickets}**.`);
    await message.reply({ embeds: [embed] });
  },

  async createpet(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');

    const name = args.find((a) => !/^-?\d+$/.test(a) && !/^<@!?(\d+)>$/.test(a) && !/^\d{15,}$/.test(a));
    const numbers = args.filter((a) => /^-?\d+(\.\d+)?$/.test(a));
    const winBoost = numbers[0] !== undefined ? Math.round(parseFloat(numbers[0])) : null;
    const rawMultiplier = numbers[1] !== undefined ? parseFloat(numbers[1]) : 1;
    const payoutMultiplier = Math.max(0.1, Math.min(100000, isNaN(rawMultiplier) ? 1 : rawMultiplier));
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const target = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (!name || winBoost === null) {
      return message.reply(`Usage: \`${config.prefix}createpet <name> <winboost -100..100> [payoutmultiplier] [@user]\``);
    }
    if (!target) return message.reply('Could not find that user.');

    const clampedBoost = Math.max(-100, Math.min(100, winBoost));
    const pet = await db.createPet(target.id, name, clampedBoost, payoutMultiplier);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.pet)
      .setTitle('🐾 Pet Created')
      .setDescription(
        `Created **${pet.name}** for **${target.username}**.\n\n` +
        `Win boost: **${clampedBoost >= 0 ? '+' : ''}${clampedBoost}%**\n` +
        `Payout multiplier: **${payoutMultiplier}x**\n\n` +
        `They'll need to run \`${config.prefix}equippet ${pet.name}\` to activate it. Currently applies to: coinflip, jackpot, crossroad.`
      );
    await message.reply({ embeds: [embed] });
  },

  async givepet(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');

    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const target = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;
    const name = args.filter((a) => a !== mentionArg).join(' ').trim();

    if (!name) return message.reply(`Usage: \`${config.prefix}givepet <name> [@user]\``);
    if (!target) return message.reply('Could not find that user.');

    const source = await db.findPetByName(name);
    if (!source) {
      return message.reply(`No pet named **${name}** exists yet. Create one first with \`${config.prefix}createpet\`.`);
    }

    const pet = await db.createPet(target.id, source.name, source.win_boost, source.payout_multiplier);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.pet)
      .setDescription(`🐾 Gave **${target.username}** a copy of **${pet.name}** (win boost ${source.win_boost >= 0 ? '+' : ''}${source.win_boost}%, ${source.payout_multiplier}x payout).`);
    await message.reply({ embeds: [embed] });
  },

  async pets(message, args) {
    const target = (await resolveTarget(message, args)) || message.author;
    const row = await db.getUser(target.id);
    const petList = await db.getPetsByOwner(target.id);

    if (petList.length === 0) {
      return message.reply(`**${target.username}** doesn't have any pets yet.`);
    }

    const lines = petList.map((pet) => {
      const active = pet.id === row.active_pet_id ? ' ✅ *(active)*' : '';
      return `🐾 **${pet.name}**${active}\nWin boost: ${pet.win_boost >= 0 ? '+' : ''}${pet.win_boost}% • Payout: ${pet.payout_multiplier}x`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.pet)
      .setAuthor({ name: `${target.username}'s Pets`, iconURL: target.displayAvatarURL() })
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `Use ${config.prefix}equippet <name> to activate one` });
    await message.reply({ embeds: [embed] });
  },

  async equippet(message, args) {
    const name = args.join(' ').trim();
    if (!name) return message.reply(`Usage: \`${config.prefix}equippet <name>\` (or \`${config.prefix}equippet none\` to unequip)`);

    const userId = message.author.id;

    if (name.toLowerCase() === 'none') {
      await db.setActivePet(userId, null);
      return message.reply('🐾 Unequipped your pet.');
    }

    const pet = await db.findOwnedPetByName(userId, name);
    if (!pet) {
      return message.reply(`You don't own a pet named **${name}**. Check \`${config.prefix}pets\` for your list.`);
    }

    await db.setActivePet(userId, pet.id);
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setThumbnail(ICONS.pet)
      .setDescription(`🐾 Equipped **${pet.name}**! (Win boost: ${pet.win_boost >= 0 ? '+' : ''}${pet.win_boost}%, Payout: ${pet.payout_multiplier}x)`);
    await message.reply({ embeds: [embed] });
  },

  async opencrate(message, args) {
    const rarityKey = (args[0] || '').toLowerCase();
    const rarity = CRATE_RARITIES[rarityKey];
    if (!rarity) {
      return message.reply(`Usage: \`${config.prefix}opencrate <${CRATE_RARITY_KEYS.join('|')}>\``);
    }

    const userId = message.author.id;
    const row = await db.getUser(userId);
    const currentCount = row[`crates_${rarityKey}`] || 0;

    if (currentCount < 1) {
      return message.reply(`You don't have any **${rarity.label}** crates to open.`);
    }

    await db.addCrates(userId, rarityKey, -1);
    const reward = luckWeightedReward(rarity.min, rarity.max, row.luck);
    const updated = await db.addBalance(userId, reward);

    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setThumbnail(ICONS.crate)
      .setTitle(`${rarity.emoji} ${rarity.label} Crate Opened!`)
      .setDescription(`You found **${formatMoney(reward)}** inside!`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async givecrate(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');

    const rarityKey = (args.find((a) => CRATE_RARITY_KEYS.includes(a.toLowerCase())) || '').toLowerCase();
    const rarity = CRATE_RARITIES[rarityKey];
    const amountRaw = args.find((a) => /^\d+$/.test(a));
    const amount = amountRaw !== undefined ? parseInt(amountRaw, 10) : null;
    const mentionArg = args.find((a) => /^<@!?(\d+)>$/.test(a) || /^\d{15,}$/.test(a));
    const finalTarget = mentionArg ? await resolveTarget(message, [mentionArg]) : message.author;

    if (!rarity || !amount) {
      return message.reply(`Usage: \`${config.prefix}givecrate <${CRATE_RARITY_KEYS.join('|')}> <amount> [@user]\``);
    }
    if (!finalTarget) return message.reply('Could not find that user.');

    const updated = await db.addCrates(finalTarget.id, rarityKey, amount);
    const newCount = updated[`crates_${rarityKey}`];
    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setThumbnail(ICONS.crate)
      .setDescription(`${rarity.emoji} Gave **${amount}x ${rarity.label} Crate** to **${finalTarget.username}**. They now have **${newCount}**.`);
    await message.reply({ embeds: [embed] });
  },

  async rob(message, args) {
    const target = await resolveTarget(message, args);
    if (!target) return message.reply(`Usage: \`${config.prefix}rob @user\``);

    const userId = message.author.id;
    if (target.id === userId) return message.reply("You can't rob yourself.");
    if (target.bot) return message.reply("You can't rob a bot.");

    const robber = await db.getUser(userId);
    const now = Date.now();
    const last = robber.last_rob ? new Date(robber.last_rob).getTime() : 0;
    const elapsed = now - last;

    if (elapsed < config.robCooldownMs) {
      const remaining = config.robCooldownMs - elapsed;
      return message.reply(`⏳ You're laying low. Try robbing again in **${msToTimeString(remaining)}**.`);
    }

    const victim = await db.getUser(target.id);
    if (victim.balance < config.robMinTargetBalance) {
      return message.reply(`**${target.username}** doesn't have enough coins to be worth robbing (needs at least ${formatMoney(config.robMinTargetBalance)}).`);
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
        .setThumbnail(ICONS.rob)
        .setTitle('🕵️ Robbery Successful!')
        .setDescription(`You snuck up on **${target.username}** and got away with **${formatMoney(stolen)}**!`)
        .setFooter({ text: `New balance: ${formatMoney(updatedRobber.balance)}` });
      await message.reply({ embeds: [embed] });
    } else {
      const penalty = Math.max(1, Math.floor(robber.balance * config.robFailPenaltyPct));
      const updatedRobber = await db.addBalance(userId, -penalty);

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setThumbnail(ICONS.rob)
        .setTitle('🚨 Caught Red-Handed!')
        .setDescription(`You got caught trying to rob **${target.username}** and paid a fine of **${formatMoney(penalty)}**.`)
        .setFooter({ text: `New balance: ${formatMoney(updatedRobber.balance)}` });
      await message.reply({ embeds: [embed] });
    }
  },

  async battle(message, args) {
    const target = await resolveTarget(message, args);
    const amount = parseAmount(args[1]);

    if (!target || !amount) return message.reply(`Usage: \`${config.prefix}battle @user <amount>\``);

    const challengerId = message.author.id;
    if (target.id === challengerId) return message.reply("You can't battle yourself.");
    if (target.bot) return message.reply("You can't battle a bot.");

    const challenger = await db.getUser(challengerId);
    if (challenger.balance < amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(challenger.balance)}`);
    }
    const defender = await db.getUser(target.id);
    if (defender.balance < amount) {
      return message.reply(`**${target.username}** doesn't have enough coins to match that wager.`);
    }

    const challengeEmbed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setThumbnail(ICONS.battle)
      .setTitle('⚔️ Battle Challenge!')
      .setDescription(
        `**${message.author.username}** has challenged **${target.username}** to a battle for **${formatMoney(amount)}**!\n\n` +
        `${target}, do you accept?`
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('battle_accept').setLabel('⚔️ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('battle_decline').setLabel('Decline').setStyle(ButtonStyle.Secondary)
    );

    const sent = await message.reply({ embeds: [challengeEmbed], components: [row] });

    let btnInteraction;
    try {
      btnInteraction = await sent.awaitMessageComponent({
        filter: (i) => i.user.id === target.id,
        time: 60_000,
      });
    } catch (_) {
      await sent.edit({ content: `⏳ **${target.username}** didn't respond in time. Battle cancelled.`, embeds: [], components: [] }).catch(() => {});
      return;
    }

    if (btnInteraction.customId === 'battle_decline') {
      await btnInteraction.update({ content: `❌ **${target.username}** declined the battle.`, embeds: [], components: [] });
      return;
    }

    await btnInteraction.deferUpdate();

    const freshChallenger = await db.getUser(challengerId);
    const freshDefender = await db.getUser(target.id);
    if (freshChallenger.balance < amount || freshDefender.balance < amount) {
      await btnInteraction.editReply({ content: '❌ One of you no longer has enough coins for this wager. Battle cancelled.', embeds: [], components: [] });
      return;
    }

    await db.addBalance(challengerId, -amount);
    await db.addBalance(target.id, -amount);

    const luckDiff = freshChallenger.luck - freshDefender.luck;
    const challengerWinChance = luckAdjustedChance(0.5, luckDiff);
    const challengerWins = Math.random() < challengerWinChance;

    const winnerId = challengerWins ? challengerId : target.id;
    const winnerName = challengerWins ? message.author.username : target.username;
    const loserName = challengerWins ? target.username : message.author.username;
    const pot = amount * 2;

    const updatedWinner = await db.addBalance(winnerId, pot);

    const resultEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setThumbnail(ICONS.battle)
      .setTitle('⚔️ Battle Result')
      .setDescription(`**${winnerName}** defeated **${loserName}** and won the pot of **${formatMoney(pot)}**!`)
      .setFooter({ text: `${winnerName}'s new balance: ${formatMoney(updatedWinner.balance)}` });

    await btnInteraction.editReply({ embeds: [resultEmbed], components: [] });
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
      .setThumbnail(ICONS.give)
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
        return `${rank} **${name}** — ${formatCompactMoney(row.balance)}`;
      })
    );

    const embed = new EmbedBuilder().setColor(0xf5c518).setThumbnail(ICONS.leaderboard).setTitle('💰 Richest Users').setDescription(lines.join('\n'));
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

    const pet = await db.getActivePet(userId);
    const baseChance = luckAdjustedChance(0.5, fresh.luck);
    const winChance = applyPetToChance(baseChance, pet);
    const won = Math.random() < winChance;
    const otherSide = side === 'heads' ? 'tails' : 'heads';
    const result = won ? side : otherSide;

    const winnings = applyPetToPayout(amount, pet);
    const updated = await db.addBalance(userId, won ? winnings : -amount);

    const embed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setThumbnail(ICONS.coinflip)
      .setTitle(`🪙 The coin landed on ${result}!`)
      .setDescription(won ? `You won **${formatMoney(winnings)}**!` : `You lost **${formatMoney(amount)}**.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    const posted = await sendAsCasino(message.channel, { embeds: [embed] });
    if (!posted) await message.reply({ embeds: [embed] });
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
      .setThumbnail(ICONS.dice)
      .setTitle('🎲 Dice Roll-off')
      .setDescription(`You rolled **${yourRoll}**, the house rolled **${houseRoll}**.\n${resultText}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    const posted = await sendAsCasino(message.channel, { embeds: [embed] });
    if (!posted) await message.reply({ embeds: [embed] });
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
      .setThumbnail(ICONS.slots)
      .setTitle('🎰 Slots')
      .setDescription(`[ ${reels.join(' | ')} ]\n\n${resultText}`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

    const posted = await sendAsCasino(message.channel, { embeds: [embed] });
    if (!posted) await message.reply({ embeds: [embed] });
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
      .setThumbnail(ICONS.balance)
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
      .setThumbnail(ICONS.balance)
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
      .setThumbnail(ICONS.balance)
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
      .setThumbnail(ICONS.luck)
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
      .setThumbnail(ICONS.luck)
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
      .setThumbnail(ICONS.luck)
      .setDescription(`🍀 Removed **${amount}** luck from **${finalTarget.username}**. New luck: **${updated.luck}**.`);
    await message.reply({ embeds: [embed] });
  },

  async luck(message, args) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');
    const target = (await resolveTarget(message, args)) || message.author;
    const row = await db.getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setThumbnail(ICONS.luck)
      .setDescription(`🍀 **${target.username}**'s luck: **${row.luck}** (range: -100 to 100, 0 is neutral)`);
    await message.reply({ embeds: [embed] });
  },

  async resetalleconomy(message) {
    if (!isAdmin(message.author.id)) return message.reply('🚫 You are not authorized to use this command.');

    const userCount = await db.getUserCount();
    const warnEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setThumbnail(ICONS.admin)
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

  async crossroad(message, args) {
    const amount = parseAmount(args[0]);
    if (!amount) return message.reply(`Usage: \`${config.prefix}crossroad <amount>\``);

    const userId = message.author.id;
    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    await db.addBalance(userId, -amount);
    const pet = await db.getActivePet(userId);

    let lanesCrossed = 0;
    let gameOver = false;

    const embed = crossroadCommand.buildEmbed({ amount, lanesCrossed, gameOver });
    const components = [crossroadCommand.buildButtons(false, true)];
    const sent = await message.reply({ embeds: [embed], components });

    const collector = sent.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 5 * 60_000,
    });

    collector.on('collect', async (btnInteraction) => {
      if (gameOver) return;

      if (btnInteraction.customId === 'road_cashout') {
        gameOver = true;
        await btnInteraction.deferUpdate();

        const mult = multiplierForRoad(lanesCrossed);
        const payout = applyPetToPayout(Math.floor(amount * mult), pet);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = crossroadCommand.buildEmbed({
          amount, lanesCrossed, gameOver: true, color: 0x57f287,
          statusText: `💰 Cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**!`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

        await btnInteraction.editReply({ embeds: [finalEmbed], components: [crossroadCommand.buildButtons(true)] });
        collector.stop('cashout');
        return;
      }

      if (btnInteraction.customId === 'road_cross') {
        const baseChance = luckAdjustedChance(ROAD_SURVIVAL_CHANCE, user.luck);
        const survivalChance = applyPetToChance(baseChance, pet);
        const survived = Math.random() < survivalChance;

        if (!survived) {
          gameOver = true;
          const hitLane = lanesCrossed + 1;
          const finalEmbed = crossroadCommand.buildEmbed({
            amount, lanesCrossed, gameOver: true, hitLane, color: 0xed4245,
            statusText: `💥 You got hit crossing lane ${hitLane}! You lost **${formatMoney(amount)}**.`,
          });
          await btnInteraction.update({ embeds: [finalEmbed], components: [crossroadCommand.buildButtons(true)] });
          collector.stop('hit');
          return;
        }

        lanesCrossed++;

        if (lanesCrossed === ROAD_TOTAL_LANES) {
          gameOver = true;
          await btnInteraction.deferUpdate();

          const payout = applyPetToPayout(Math.floor(amount * ROAD_MAX_MULTIPLIER), pet);
          const updated = await db.addBalance(userId, payout);

          const finalEmbed = crossroadCommand.buildEmbed({
            amount, lanesCrossed, gameOver: true, color: 0x57f287,
            statusText: `🏆 You made it all the way across! Max payout: **${formatMoney(payout)}**!`,
          }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

          await btnInteraction.editReply({ embeds: [finalEmbed], components: [crossroadCommand.buildButtons(true)] });
          collector.stop('cleared');
          return;
        }

        const updatedEmbed = crossroadCommand.buildEmbed({ amount, lanesCrossed, gameOver: false });
        await btnInteraction.update({ embeds: [updatedEmbed], components: [crossroadCommand.buildButtons(false, false)] });
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time' && !gameOver) {
        gameOver = true;
        const mult = multiplierForRoad(lanesCrossed);
        const payout = applyPetToPayout(Math.floor(amount * mult), pet);
        const updated = await db.addBalance(userId, payout);

        const finalEmbed = crossroadCommand.buildEmbed({
          amount, lanesCrossed, gameOver: true, color: 0xf5c518,
          statusText: `⏳ Timed out — auto cashed out at **${mult.toFixed(2)}x** for **${formatMoney(payout)}**.`,
        }).setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });

        try {
          await sent.edit({ embeds: [finalEmbed], components: [crossroadCommand.buildButtons(true)] });
        } catch (_) {}
      }
    });
  },

  async jackpot(message) {
    const user = await db.getUser(userId);

    if (user.balance <= 0) {
      return message.reply(`You don't have any coins to risk. Your balance: ${formatMoney(user.balance)}`);
    }

    const confirmed = await confirmAllIn(message, user.balance);
    if (!confirmed) return;

    const fresh = await db.getUser(userId);
    const stake = fresh.balance;
    if (stake <= 0) return message.reply('You have no balance left to risk.');

    const pet = await db.getActivePet(userId);
    const baseChance = luckAdjustedChance(0.5, fresh.luck);
    const winChance = applyPetToChance(baseChance, pet);
    const won = Math.random() < winChance;

    const winnings = applyPetToPayout(stake, pet);
    const delta = won ? winnings : -stake;
    const updated = await db.addBalance(userId, delta);

    const embed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setThumbnail(ICONS.jackpot)
      .setTitle('🎰 JACKPOT')
      .setDescription(
        won
          ? `🎉 **YOU WON!** You gained **${formatCompactMoney(winnings)}** on top of your stake!`
          : `💀 **YOU LOST EVERYTHING.** Your **${formatMoney(stake)}** balance is gone.`
      )
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    await message.reply({ embeds: [embed] });
  },

  async help(message) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setThumbnail(ICONS.help)
      .setTitle('📖 Commands')
      .setDescription(buildHelpDescription(config.prefix));
    await message.reply({ embeds: [embed] });
  },
};

module.exports = { handlers, ALIASES };
