const ICONS = require('./icons');

const CASINO_NAME = '🎰 Casino';
const CASINO_AVATAR = ICONS.jackpot;

// Caches one webhook per channel for the lifetime of the process, so we
// don't fetch/create a new one on every single game. Cleared automatically
// if a send ever fails (e.g. the webhook was deleted from Discord's side).
const webhookCache = new Map();

// Finds (or creates) a webhook this bot owns in the given channel, named
// "🎰 Casino". Requires the Manage Webhooks permission — if that's missing,
// this throws and the caller should fall back to a normal reply.
async function getCasinoWebhook(channel) {
  if (webhookCache.has(channel.id)) {
    return webhookCache.get(channel.id);
  }

  const existing = await channel.fetchWebhooks();
  let webhook = existing.find(
    (wh) => wh.name === CASINO_NAME && wh.owner?.id === channel.client.user.id
  );

  if (!webhook) {
    webhook = await channel.createWebhook({
      name: CASINO_NAME,
      avatar: CASINO_AVATAR,
      reason: 'Casino persona for gambling command results',
    });
  }

  webhookCache.set(channel.id, webhook);
  return webhook;
}

// Sends a message as the Casino persona instead of the bot's own identity.
// Returns true on success, false on any failure (missing permission, webhook
// deleted, channel type that doesn't support webhooks, etc.) — callers must
// check this and fall back to a normal reply so the command never just
// silently fails to respond.
async function sendAsCasino(channel, payload) {
  try {
    const webhook = await getCasinoWebhook(channel);
    await webhook.send({ ...payload, username: CASINO_NAME, avatarURL: CASINO_AVATAR });
    return true;
  } catch (err) {
    webhookCache.delete(channel.id);
    console.error('[casinoWebhook] Falling back to normal reply:', err.message);
    return false;
  }
}

module.exports = { sendAsCasino, CASINO_NAME, CASINO_AVATAR };
