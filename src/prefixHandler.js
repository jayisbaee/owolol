const { EmbedBuilder } = require('discord.js');
const db = require('./database');
const config = require('./config');
const { formatMoney, msToTimeString, isAdmin, randInt } = require('./utils/economyUtils');
const { getGif } = require('./utils/gifUtils');

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
    const amount = parseAmount(args[0]);
    const side = (args[1] || '').toLowerCase();

    if (!amount) return message.reply(`Usage: \`${config.prefix}coinflip <amount> <heads|tails>\``);
    if (!['heads', 'tails'].includes(side)) return message.reply('Pick a side: `heads` or `tails`.');

    const userId = message.author.id;
    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === side;
    const updated = await db.addBalance(userId, won ? amount : -amount);
    const gifUrl = await getGif(
      won ? 'win' : 'lose',
      won ? 'coin flip win celebration' : 'coin flip lose sad'
    );

    const embed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setTitle(`🪙 The coin landed on ${result}!`)
      .setDescription(won ? `You won **${formatMoney(amount)}**!` : `You lost **${formatMoney(amount)}**.`)
      .setFooter({ text: `New balance: ${formatMoney(updated.balance)}` });
    if (gifUrl) embed.setImage(gifUrl);
    await message.reply({ embeds: [embed] });
  },

  async dice(message, args) {
    const amount = parseAmount(args[0]);
    if (!amount) return message.reply(`Usage: \`${config.prefix}dice <amount>\``);

    const userId = message.author.id;
    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const yourRoll = randInt(1, 6);
    const houseRoll = randInt(1, 6);
    let delta, resultText, color;
    if (yourRoll > houseRoll) {
      delta = amount; resultText = `You won **${formatMoney(amount)}**!`; color = 0x57f287;
    } else if (yourRoll < houseRoll) {
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
    const amount = parseAmount(args[0]);
    if (!amount) return message.reply(`Usage: \`${config.prefix}slots <amount>\``);

    const userId = message.author.id;
    const user = await db.getUser(userId);
    if (user.balance < amount) {
      return message.reply(`You don't have enough coins. Your balance: ${formatMoney(user.balance)}`);
    }

    const reels = [0, 0, 0].map(() => SYMBOLS[randInt(0, SYMBOLS.length - 1)]);
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

  async help(message) {
    const p = config.prefix;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📖 Commands')
      .setDescription(
        `Both \`/slash\` commands and \`${p}prefix\` commands work.\n\n` +
        `**Economy**\n\`${p}balance [@user]\`, \`${p}daily\`, \`${p}work\`, \`${p}give @user <amount>\`, \`${p}leaderboard\`\n\n` +
        `**Gambling**\n\`${p}coinflip <amount> <heads|tails>\`, \`${p}dice <amount>\`, \`${p}slots <amount>\`\n\n` +
        `**Admin**\n\`${p}addmoney <amount> [@user]\`, \`${p}removemoney <amount> [@user]\`, \`${p}setmoney <amount> [@user]\``
      );
    await message.reply({ embeds: [embed] });
  },
};

module.exports = { handlers };
