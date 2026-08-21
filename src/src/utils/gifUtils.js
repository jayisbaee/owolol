const config = require('../config');

// Used only if TENOR_API_KEY isn't set, or if a Tenor request fails —
// keeps the feature working out of the box with zero setup.
const FALLBACK_GIFS = {
  win: [
    'https://media.tenor.com/z1WkTGuVQDwAAAAC/money-cash.gif',
    'https://media.tenor.com/2roX2vf5CzUAAAAC/celebration-win.gif',
    'https://media.tenor.com/RaR2vk4qMhAAAAAC/success-kid-yes.gif',
    'https://media.tenor.com/aA_6vJ9lFUUAAAAC/winning-happy.gif',
  ],
  lose: [
    'https://media.tenor.com/8kk_ULM_5CoAAAAC/sad-disappointed.gif',
    'https://media.tenor.com/y6ay1SqSMzsAAAAC/lose-losing.gif',
    'https://media.tenor.com/2SS8QhKfg2AAAAAC/crying-sad.gif',
    'https://media.tenor.com/HmQPGeVXNZoAAAAC/oh-no-fail.gif',
  ],
  slots: [
    'https://media.tenor.com/eLg8h_6cVLYAAAAC/slot-machine-casino.gif',
    'https://media.tenor.com/2wUYh6MZoyMAAAAC/slots-casino.gif',
    'https://media.tenor.com/CVzn6r1LSycAAAAC/casino-slots.gif',
  ],
};

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Queries Tenor's v2 search API and returns a random gif URL from the results,
// or null if no API key is set / the request fails / nothing is found.
async function fetchTenorGif(searchTerm) {
  if (!config.tenorApiKey) return null;

  try {
    const url =
      `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchTerm)}` +
      `&key=${config.tenorApiKey}&client_key=owo_clone_bot&limit=25&media_filter=gif&contentfilter=high`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;

    const pick = randomFromArray(data.results);
    return pick.media_formats?.gif?.url || pick.media_formats?.tinygif?.url || null;
  } catch (_) {
    return null;
  }
}

// category: 'win' | 'lose' | 'slots' — used for the fallback pool.
// searchTerm: what to search Tenor for when a live API key is configured.
async function getGif(category, searchTerm) {
  const tenorResult = await fetchTenorGif(searchTerm);
  if (tenorResult) return tenorResult;
  return randomFromArray(FALLBACK_GIFS[category] || []);
}

module.exports = { getGif };
