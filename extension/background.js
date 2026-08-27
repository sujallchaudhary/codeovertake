/**
 * Service worker.
 *
 * Its only job is the badge: a small dot on the toolbar icon so you can tell at
 * a glance that the current page is a problem the extension understands.
 */
importScripts('shared.js');

const { detectProblem } = self.CodeOvertake;

async function updateBadge(tabId, url) {
  const match = detectProblem(url);
  try {
    await chrome.action.setBadgeText({ tabId, text: match ? '+' : '' });
    if (match) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4ade80' });
      await chrome.action.setTitle({ tabId, title: `Save this ${match.label} problem to CodeOvertake` });
    } else {
      await chrome.action.setTitle({ tabId, title: 'CodeOvertake' });
    }
  } catch (_e) {
    // Tab closed mid-update; nothing to do
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateBadge(tabId, changeInfo.url || tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateBadge(tabId, tab.url);
  } catch (_e) { /* tab gone */ }
});
