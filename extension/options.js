/** Options page: stores the API base URL and the pairing token. */
const { DEFAULT_API_BASE, getSettings, saveSettings, apiFetch } = self.CodeOvertake;

const el = (id) => document.getElementById(id);

function message(text, kind) {
  const node = el('message');
  node.textContent = text;
  node.className = `message ${kind}`;
}

async function load() {
  const settings = await getSettings();
  el('apiBase').value = settings.apiBase || DEFAULT_API_BASE;
  el('token').value = settings.token || '';
}

el('save').addEventListener('click', async () => {
  await saveSettings({
    apiBase: el('apiBase').value.trim() || DEFAULT_API_BASE,
    token: el('token').value.trim(),
  });
  message('Saved.', 'success');
});

el('test').addEventListener('click', async () => {
  // Persist first so apiFetch reads the values currently in the form
  await saveSettings({
    apiBase: el('apiBase').value.trim() || DEFAULT_API_BASE,
    token: el('token').value.trim(),
  });
  message('Testing…', 'success');
  try {
    const res = await apiFetch('/auth/me');
    message(`Connected as ${res.user.name} (/u/${res.user.handle}).`, 'success');
  } catch (error) {
    message(
      error.status === 401
        ? 'That token was rejected. Copy a fresh one from Edit profile → Extension.'
        : `Could not reach the API: ${error.message}`,
      'error',
    );
  }
});

load();
