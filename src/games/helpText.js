// Single source of truth for the bot's command list, so /help and
// `<prefix>help` can never drift out of sync with each other.
function buildHelpDescription(prefix) {
  const p = prefix;
  return (
    `Both \`/slash\` commands and \`${p}prefix\` commands work — this list covers both.\n\n` +
    `**Economy**\n\`${p}balance [@user]\`, \`${p}daily\`, \`${p}work\`, \`${p}quest\`, \`${p}beg\`, \`${p}crime\`, \`${p}hunt\`, \`${p}give @user <amount>\`, \`${p}leaderboard\`\n` +
    `\`${p}rob @user\` (risky — chance to fail and pay a fine), \`${p}battle @user <amount>\` (PvP wager, winner takes all)\n\n` +
    `**Bank**\n\`${p}deposit <amount|all>\`, \`${p}withdraw <amount|all>\` — banked coins are safe from \`${p}rob\` (but not \`${p}vaultbreak\`)\n\n` +
    `**Shop**\n\`${p}shop\` (view items), \`${p}buy <item> [amount]\` — buy Luck Upgrades or Electric Drills\n` +
    `\`${p}vaultbreak @user\` — spend a drill for a chance to steal from someone's bank (riskier and rarer than \`${p}rob\`)\n\n` +
    `**Crates**\n\`${p}crates [@user]\` (view inventory), \`${p}opencrate <rarity>\`\n` +
    `Rarities: Common, Uncommon, Rare, Epic, Legendary. Earned from \`${p}daily\` (guaranteed Common), \`${p}quest\` (chance of any rarity), and \`${p}hunt\` (chance based on the monster).\n\n` +
    `**Raffle**\n\`${p}tickets [@user]\` (view ticket count), \`${p}raffle\` — spend 1 ticket for a 1-in-9 shot at a massive jackpot\n\n` +
    `**Pets**\n\`${p}pets [@user]\` (view), \`${p}equippet <name>\` — active pet boosts win chance and payout on coinflip, jackpot, and crossroad\n\n` +
    `**Gambling**\n\`${p}coinflip <amount|all> <heads|tails>\` (\`${p}cf\`), \`${p}dice <amount|all>\`, ` +
    `\`${p}slots <amount|all>\` (\`${p}s\`), \`${p}blackjack <amount|all>\` (\`${p}bj\`), ` +
    `\`${p}mines <amount|all> [mines]\`, \`${p}crossroad <amount>\` (cross traffic lanes for a rising multiplier), \`${p}jackpot\` (risk your whole balance for 2x or nothing)\n\n` +
    `**Admin**\n\`${p}addmoney <amount> [@user]\`, \`${p}removemoney <amount> [@user]\`, \`${p}setmoney <amount> [@user]\`\n` +
    `\`${p}setluck <-100..100> [@user]\`, \`${p}addluck <amount> [@user]\`, \`${p}removeluck <amount> [@user]\`, \`${p}luck [@user]\`\n` +
    `\`${p}givecrate <rarity> <amount> [@user]\`, \`${p}givetickets <amount> [@user]\`\n` +
    `\`${p}createpet <name> <winboost> [payoutmultiplier] [@user]\`, \`${p}givepet <name> [@user]\` — fully custom pets, up to guaranteed wins and absurd payout multipliers\n` +
    `\`${p}resetalleconomy\` (wipes every balance to 0, requires confirmation)\n\n` +
    `Tip: type \`all\` instead of an amount on any gambling or bank command to use your whole balance (with a confirmation step on gambling commands).`
  );
}

module.exports = { buildHelpDescription };
