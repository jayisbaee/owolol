const config = require('../config');

// Giphy's official public "beta" key — documented at developers.giphy.com,
// requires no signup, and is meant exactly for cases like this. Rate-limited
// but plenty for a Discord bot. Works out of the box with zero setup.
const GIPHY_PUBLIC_KEY = 'dc6zaTOxFJmzC';

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Fails fast instead of hanging — the caller has a limited window to reply
// to the user, so a slow gif API shouldn't make them wait forever.
async function fetchWithTimeout(url, ms = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Queries Tenor's v2 search API and returns a random gif URL from the results,
// or null if no API key is set / the request fails / nothing is found.
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

// Queries Giphy's search endpoint (more reliable results than /random for a
// specific term) and returns a random gif URL from the top matches.
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

// category is currently unused but kept in the signature in case future
// callers want category-specific behavior without changing every call site.
// searchTerm: what to search for. Tries Tenor first (if a key is configured),
// then falls back to Giphy's public key. Returns null if both fail, in which
// case the caller should just skip attaching an image.
async function getGif(category, searchTerm) {
  const tenorResult = await fetchTenorGif(searchTerm);
  if (tenorResult) return tenorResult;

  const giphyResult = await fetchGiphyGif(searchTerm);
  if (giphyResult) return giphyResult;

  return null;
}

module.exports = { getGif };

