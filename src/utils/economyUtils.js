const config = require('../config');

function formatMoney(amount) {
  return `${config.currencySymbol} ${Number(amount).toLocaleString('en-US')}`;
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

module.exports = { formatMoney, msToTimeString, isAdmin, randInt };
