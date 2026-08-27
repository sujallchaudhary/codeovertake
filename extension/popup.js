/**
 * Popup logic.
 *
 * Flow: read the active tab URL -> confirm it is a problem page -> ask the API
 * to resolve it (which also fetches title/difficulty/topics) -> let the user
 * save it, optionally as solved, starred, tagged, noted and into a sheet.
 */
const { detectProblem, getSettings, apiFetch } = self.CodeOvertake;

const el = (id) => document.getElementById(id);

const DIFFICULTY_COLORS = {
  easy: '#4ade80', medium: '#f59e0b', hard: '#ff4444', unrated: '#888888',
};

let pageUrl = '';
let problem = null;
let starred = false;

function show(id) {
  el(id).classList.remove('hidden');
}

function message(text, kind) {
  const node = el('message');
  node.textContent = text;
  node.className = `message ${kind}`;
}

function clearMessage() {
  el('message').className = 'message hidden';
}

function setBusy(busy) {
  ['saveUnsolved', 'saveSolved', 'star'].forEach((id) => { el(id).disabled = busy; });
}

async function init() {
  el('openOptions').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  el('goToOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageUrl = tab?.url || '';

  const match = detectProblem(pageUrl);
  if (!match) {
    show('unsupported');
    return;
  }

  const { token, apiBase } = await getSettings();
  if (!token) {
    show('needsToken');
    return;
  }

  show('main');
  el('platformBadge').textContent = match.label;
  el('openApp').href = `${apiBase.replace(/\/api$/, '')}/workspace`;

  wireActions();
  await resolveProblem();
  loadSheets();
}

/** Asks the backend to resolve the URL, which fills in the metadata card. */
async function resolveProblem() {
  try {
    const res = await apiFetch('/problems/resolve', {
      method: 'POST',
      body: JSON.stringify({ url: pageUrl }),
    });
    problem = res.problem;

    el('problemTitle').textContent = problem.title;

    if (problem.difficulty && problem.difficulty !== 'unrated') {
      const badge = el('difficultyBadge');
      badge.textContent = problem.difficulty;
      badge.style.color = DIFFICULTY_COLORS[problem.difficulty];
      badge.style.background = `${DIFFICULTY_COLORS[problem.difficulty]}22`;
      badge.classList.remove('hidden');
    }

    el('topics').innerHTML = '';
    (problem.topics || []).slice(0, 6).forEach((topic) => {
      const span = document.createElement('span');
      span.textContent = topic;
      el('topics').appendChild(span);
    });
  } catch (error) {
    el('problemTitle').textContent = 'Could not read this problem';
    message(error.message, 'error');
  }
}

/** Populates the sheet dropdown with sheets the user owns or follows. */
async function loadSheets() {
  try {
    const [mine, followed] = await Promise.all([
      apiFetch('/sheets?scope=mine&limit=50'),
      apiFetch('/sheets?scope=followed&limit=50'),
    ]);

    const seen = new Set();
    const options = [...(mine.sheets || []), ...(followed.sheets || [])].filter((sheet) => {
      // Curated sheets are read-only, so they cannot receive new questions
      if (sheet.isCurated || seen.has(sheet.slug)) return false;
      seen.add(sheet.slug);
      return true;
    });

    const select = el('sheet');
    options.forEach((sheet) => {
      const option = document.createElement('option');
      option.value = sheet.slug;
      option.textContent = sheet.title;
      select.appendChild(option);
    });
  } catch (_error) {
    // A missing sheet list should not block saving to the workspace
  }
}

function parseTags() {
  return el('tags').value.split(',').map((t) => t.trim()).filter(Boolean);
}

async function save(status) {
  if (!problem) return;
  clearMessage();
  setBusy(true);

  try {
    // 1. Always land it in the workspace
    await apiFetch('/workspace', {
      method: 'POST',
      body: JSON.stringify({
        problemId: problem._id,
        status,
        starred,
        tags: parseTags(),
        source: 'extension',
      }),
    });

    // 2. Optionally add it to a sheet the user can edit
    const sheetSlug = el('sheet').value;
    if (sheetSlug) {
      await apiFetch(`/sheets/${encodeURIComponent(sheetSlug)}/questions`, {
        method: 'POST',
        body: JSON.stringify({ problemId: problem._id }),
      }).catch((error) => {
        // 409 just means it is already there, which is not a failure
        if (error.status !== 409) throw error;
      });
    }

    // 3. Optionally attach a note linked to this problem
    const noteText = el('note').value.trim();
    if (noteText) {
      await apiFetch('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: problem.title,
          content: noteText,
          linkedProblems: [problem._id],
        }),
      });
    }

    const parts = [status === 'solved' ? 'Saved as solved' : 'Saved to workspace'];
    if (sheetSlug) parts.push('added to sheet');
    if (noteText) parts.push('note attached');
    message(`${parts.join(' · ')}.`, 'success');
    el('note').value = '';
  } catch (error) {
    message(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function wireActions() {
  el('saveUnsolved').addEventListener('click', () => save('unsolved'));
  el('saveSolved').addEventListener('click', () => save('solved'));
  el('star').addEventListener('click', () => {
    starred = !starred;
    el('star').textContent = starred ? '★ Starred' : '☆ Star';
    el('star').classList.toggle('active', starred);
  });
}

init();
