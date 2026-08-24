const config = require('../config');

// Central item catalog — used by /shop (display) and /buy (purchase logic).
const ITEMS = {
  luck: {
    label: 'Luck Upgrade',
    emoji: '🍀',
    description: `Permanently increases your luck by ${config.luckUpgradeAmount} (capped at 100). Nudges win chance in gambling and crate rewards.`,
    cost: config.luckUpgradeCost,
  },
  drill: {
    label: 'Electric Drill',
    emoji: '🔩',
    description: 'A one-time-use tool. Required to attempt /vaultbreak on someone else\'s bank.',
    cost: config.drillCost,
  },
};

const ITEM_KEYS = Object.keys(ITEMS);

module.exports = { ITEMS, ITEM_KEYS };
