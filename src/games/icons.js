// Stable icon URLs for embed thumbnails. Pinned to a fixed Twemoji release
// on jsDelivr — a permanent, versioned CDN — so these never change or break,
// unlike live gif APIs. If a URL is ever wrong, Discord just shows no image;
// the rest of the embed still works fine either way.
const BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

const ICONS = {
  balance: `${BASE}/1fa99.png`, // coin
  daily: `${BASE}/1f4c5.png`, // calendar
  work: `${BASE}/1f4bc.png`, // briefcase
  quest: `${BASE}/1f5fa-fe0f.png`, // map
  beg: `${BASE}/1f64f.png`, // pray
  crime: `${BASE}/1f3ad.png`, // masks
  hunt: `${BASE}/1f43a.png`, // wolf
  crossroad: `${BASE}/1f414.png`, // chicken
  give: `${BASE}/1f91d.png`, // handshake
  leaderboard: `${BASE}/1f451.png`, // crown
  rob: `${BASE}/1f575-fe0f.png`, // detective
  battle: `${BASE}/2694-fe0f.png`, // crossed swords
  bank: `${BASE}/1f3e6.png`, // bank
  shop: `${BASE}/1f6d2.png`, // cart
  luck: `${BASE}/1f340.png`, // clover
  drill: `${BASE}/1f529.png`, // nut and bolt
  vaultbreak: `${BASE}/1f510.png`, // locked with key
  crate: `${BASE}/1f4e6.png`, // package
  coinflip: `${BASE}/1fa99.png`, // coin
  dice: `${BASE}/1f3b2.png`, // dice
  slots: `${BASE}/1f3b0.png`, // slot machine
  blackjack: `${BASE}/1f0cf.png`, // joker card
  mines: `${BASE}/1f4a3.png`, // bomb
  jackpot: `${BASE}/1f3b0.png`, // slot machine
  help: `${BASE}/1f4d6.png`, // open book
  admin: `${BASE}/1f6e1-fe0f.png`, // shield
};

module.exports = ICONS;
