const config = require('../config');

function formatMoney(amount) {
  return `${config.currencySymbol} ${Number(amount).toLocaleString('en-US')}`;
}

// Abbreviates large numbers (1.5B instead of 1,500,000,000) for spots where
// compactness matters more than exact precision, like leaderboards or big
// flashy win headlines. Small numbers fall back to the normal full format.
function formatCompactMoney(amount) {
  const num = Number(amount);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  let value, suffix;
  if (abs >= 1e12) { value = abs / 1e12; suffix = 'T'; }
  else if (abs >= 1e9) { value = abs / 1e9; suffix = 'B'; }
  else if (abs >= 1e6) { value = abs / 1e6; suffix = 'M'; }
  else if (abs >= 1e3) { value = abs / 1e3; suffix = 'K'; }
  else return formatMoney(amount);

  const decimals = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${config.currencySymbol} ${sign}${value.toFixed(decimals)}${suffix}`;
}

function msToTimeString(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function isAdmin(userId) {
  return config.adminIds.includes(userId);
}

// Simple integer random between min and max, inclusive.
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = { formatMoney, formatCompactMoney, msToTimeString, isAdmin, randInt };
