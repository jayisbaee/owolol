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
async function fetchWithTimeout(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTenorGif(searchTerm) {
  if (!config.tenorApiKey) return null; // silently skipped — no key configured, this is expected/normal
  try {
    const url =
      `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchTerm)}` +
      `&key=${config.tenorApiKey}&client_key=owo_clone_bot&limit=25&media_filter=gif&contentfilter=high`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.error(`[gifEngine] Tenor request failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      console.error(`[gifEngine] Tenor returned no results for "${searchTerm}"`);
      return null;
    }
    const pick = randomFromArray(data.results);
    const gifUrl = pick.media_formats?.gif?.url || pick.media_formats?.tinygif?.url || null;
    if (!gifUrl) console.error('[gifEngine] Tenor result had no usable image URL:', JSON.stringify(pick.media_formats));
    return gifUrl;
  } catch (err) {
    console.error('[gifEngine] Tenor request threw:', err.message);
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
    if (!res.ok) {
      console.error(`[gifEngine] Giphy request failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      console.error(`[gifEngine] Giphy returned no results for "${searchTerm}"`);
      return null;
    }
    const pick = randomFromArray(data.data);
    const gifUrl = pick.images?.original?.url || pick.images?.downsized?.url || null;
    if (!gifUrl) console.error('[gifEngine] Giphy result had no usable image URL:', JSON.stringify(pick.images));
    return gifUrl;
  } catch (err) {
    console.error('[gifEngine] Giphy request threw:', err.message);
    return null;
  }
}

// Tries Tenor first (if a key is configured), falls back to Giphy's public
// key. Returns null if both fail — callers must check for null and simply
// skip attaching an image; a missing gif should never break a command.
async function getGif(searchTerm) {
  const tenorResult = await fetchTenorGif(searchTerm);
  if (tenorResult) return tenorResult;
  const giphyResult = await fetchGiphyGif(searchTerm);
  if (!giphyResult) {
    console.error(`[gifEngine] Both Tenor and Giphy failed for "${searchTerm}" — no image attached this time.`);
  }
  return giphyResult;
}

module.exports = { getGif };
