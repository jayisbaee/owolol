const config = require('../config');

// Giphy's official public "beta" key — documented at developers.giphy.com,
// requires no signup, works out of the box. Used unless a real key is set
// via TENOR_API_KEY or GIPHY_API_KEY in .env, which avoids sharing the
// public key's rate limit with every other bot using it.
const GIPHY_PUBLIC_KEY = 'dc6zaTOxFJmzC';

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Fails fast instead of hanging. Every caller of getGif() runs after
// interaction.deferReply(), so there's up to 15 minutes to work with in
// theory — but a fixed, generous timeout keeps the experience snappy and
// guarantees this can never hang indefinitely.
async function fetchWithTimeout(url, ms = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTenorGif(searchTerm) {
  if (!config.tenorApiKey) return null;
  try {
    const url =
      `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchTerm)}` +
      `&key=${config.tenorApiKey}&client_key=owo_clone_bot&limit=25&media_filter=gif&contentfilter=high`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;
    const pick = randomFromArray(data.results);
    return pick.media_formats?.gif?.url || pick.media_formats?.tinygif?.url || null;
  } catch (_) {
    return null;
  }
}

async function fetchGiphyGif(searchTerm) {
  const key = config.giphyApiKey || GIPHY_PUBLIC_KEY;
  try {
    const url =
      `https://api.giphy.com/v1/gifs/search?api_key=${key}` +
      `&q=${encodeURIComponent(searchTerm)}&limit=25&rating=pg-13&lang=en`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    const pick = randomFromArray(data.data);
    return pick.images?.original?.url || pick.images?.downsized?.url || null;
  } catch (_) {
    return null;
  }
}

// Tries Tenor first (if a key is configured), falls back to Giphy's public
// key. Returns null if both fail — callers must check for null and simply
// skip attaching an image; a missing gif should never break a command.
async function getGif(searchTerm) {
  const tenorResult = await fetchTenorGif(searchTerm);
  if (tenorResult) return tenorResult;
  return fetchGiphyGif(searchTerm);
}

module.exports = { getGif };
