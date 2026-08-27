/**
 * Shared helpers for the popup, options page and service worker.
 *
 * Loaded as a classic script by the HTML pages and via importScripts() by the
 * service worker, so everything is attached to `self` rather than exported.
 */

const DEFAULT_API_BASE = 'http://localhost:5000/api';

/** Mirrors backend/utils/problemUrl.js so the popup can detect pages offline. */
const PROBLEM_MATCHERS = [
  { platform: 'leetcode', label: 'LeetCode', re: /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i },
  { platform: 'codeforces', label: 'Codeforces', re: /^https?:\/\/(?:www\.)?codeforces\.com\/(?:contest|gym)\/\d+\/problem\/[A-Za-z]\d?/i },
  { platform: 'codeforces', label: 'Codeforces', re: /^https?:\/\/(?:www\.)?codeforces\.com\/problemset\/problem\/\d+\/[A-Za-z]\d?/i },
  { platform: 'codechef', label: 'CodeChef', re: /^https?:\/\/(?:www\.)?codechef\.com\/(?:[A-Za-z0-9]+\/)?problems\/[A-Za-z0-9_-]+/i },
  { platform: 'geeksforgeeks', label: 'GeeksforGeeks', re: /^https?:\/\/(?:practice\.|www\.)?geeksforgeeks\.org\/problems\/[a-z0-9._-]+/i },
  { platform: 'atcoder', label: 'AtCoder', re: /^https?:\/\/(?:www\.)?atcoder\.jp\/contests\/[a-z0-9_-]+\/tasks\/[a-z0-9_-]+/i },
  { platform: 'hackerrank', label: 'HackerRank', re: /^https?:\/\/(?:www\.)?hackerrank\.com\/(?:challenges|contests\/[a-z0-9-]+\/challenges)\/[a-z0-9-]+/i },
  { platform: 'interviewbit', label: 'InterviewBit', re: /^https?:\/\/(?:www\.)?interviewbit\.com\/problems\/[a-z0-9-]+/i },
  { platform: 'codestudio', label: 'Code360', re: /^https?:\/\/(?:www\.)?naukri\.com\/code360\/problems\/[a-z0-9_-]+/i },
  { platform: 'codestudio', label: 'Code360', re: /^https?:\/\/(?:www\.)?codingninjas\.com\/(?:codestudio|studio)\/problems\/[a-z0-9_-]+/i },
  { platform: 'spoj', label: 'SPOJ', re: /^https?:\/\/(?:www\.)?spoj\.com\/problems\/[A-Za-z0-9_-]+/i },
];

/** Returns { platform, label } when the URL looks like a problem page. */
function detectProblem(url) {
  if (!url) return null;
  for (const matcher of PROBLEM_MATCHERS) {
    if (matcher.re.test(url)) return { platform: matcher.platform, label: matcher.label };
  }
  return null;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(['apiBase', 'token']);
  return {
    apiBase: (stored.apiBase || DEFAULT_API_BASE).replace(/\/+$/, ''),
    token: stored.token || '',
  };
}

async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}

/**
 * Calls the CodeOvertake API with the stored pairing token.
 * Throws an Error carrying `status` and any field-level `errors`.
 */
async function apiFetch(path, options = {}) {
  const { apiBase, token } = await getSettings();
  if (!token) {
    const err = new Error('Add your pairing token in the extension options first.');
    err.status = 401;
    throw err;
  }

  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  let body = null;
  try {
    body = await res.json();
  } catch (_e) { /* empty body */ }

  if (!res.ok) {
    const err = new Error(body?.error || body?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = body?.errors;
    throw err;
  }
  return body;
}

self.CodeOvertake = {
  DEFAULT_API_BASE, detectProblem, getSettings, saveSettings, apiFetch,
};
