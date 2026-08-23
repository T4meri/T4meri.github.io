const api = window.SparkApi;

const notice = document.getElementById('notice');
const success = document.getElementById('success');
const displayName = document.getElementById('displayName');
const autoRun = document.getElementById('pref-autorun');
const sendOnEnter = document.getElementById('pref-enter');

function flash(element, message) {
  notice.hidden = true;
  success.hidden = true;
  if (!message) return;
  element.textContent = message;
  element.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function readFlag(key) {
  return localStorage.getItem(key) !== 'false';
}

function bindFlag(input, key) {
  input.checked = readFlag(key);
  input.addEventListener('change', () => {
    localStorage.setItem(key, String(input.checked));
    flash(success, 'Preference saved.');
  });
}

function armConfirm(button, label, action) {
  let armed = false;
  let timer = null;

  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.classList.add('confirming');
      button.textContent = 'Click again to confirm';
      timer = setTimeout(() => {
        armed = false;
        button.classList.remove('confirming');
        button.textContent = label;
      }, 5000);
      return;
    }

    clearTimeout(timer);
    armed = false;
    button.classList.remove('confirming');
    button.disabled = true;
    button.textContent = 'Working…';

    try {
      await action();
    } catch (error) {
      flash(notice, error.message);
      button.disabled = false;
      button.textContent = label;
    }
  });
}

document.getElementById('profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('profile-save');
  button.disabled = true;

  try {
    await api.request('/api/account', { method: 'PATCH', body: { displayName: displayName.value } });
    flash(success, 'Display name updated.');
  } catch (error) {
    flash(notice, error.message);
  }

  button.disabled = false;
});

document.getElementById('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('password-save');
  const current = document.getElementById('currentPassword');
  const next = document.getElementById('newPassword');

  button.disabled = true;

  try {
    await api.request('/api/account/password', {
      method: 'POST',
      body: { currentPassword: current.value, newPassword: next.value }
    });
    current.value = '';
    next.value = '';
    flash(success, 'Password changed. Other devices have been signed out.');
  } catch (error) {
    flash(notice, error.message);
  }

  button.disabled = false;
});

armConfirm(document.getElementById('clear-chats'), 'Delete chats', async () => {
  const result = await api.request('/api/account/conversations', { method: 'DELETE' });
  const button = document.getElementById('clear-chats');
  button.disabled = false;
  button.textContent = 'Delete chats';
  flash(success, `Deleted ${result.removed} conversation${result.removed === 1 ? '' : 's'}.`);
});

armConfirm(document.getElementById('delete-account'), 'Delete account', async () => {
  await api.request('/api/account', { method: 'DELETE' });
  location.href = 'index.html';
});

const keysBox = document.getElementById('keys');
const keyCount = document.getElementById('key-count');
const freshKey = document.getElementById('fresh-key');
const freshKeyValue = document.getElementById('fresh-key-value');

function whenText(timestamp) {
  if (!timestamp) return 'never used';
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days === 0) return 'used today';
  if (days === 1) return 'used yesterday';
  return `used ${days} days ago`;
}

async function loadKeys() {
  let payload;
  try {
    payload = await api.request('/api/keys');
  } catch (error) {
    keysBox.textContent = error.message;
    return;
  }

  keysBox.replaceChildren();

  if (payload.keys.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'keys-empty';
    empty.textContent = 'No keys yet. Create one to use Spark outside the browser.';
    keysBox.appendChild(empty);
  }

  for (const key of payload.keys) {
    const row = document.createElement('div');
    row.className = 'key-row';

    const meta = document.createElement('div');
    meta.className = 'key-meta';

    const name = document.createElement('div');
    name.className = 'key-name';
    name.textContent = key.name;

    const sub = document.createElement('div');
    sub.className = 'key-sub';
    sub.textContent = `${key.hint} · ${whenText(key.lastUsedAt)}`;

    meta.append(name, sub);

    const remove = document.createElement('button');
    remove.className = 'danger-btn';
    remove.type = 'button';
    remove.textContent = 'Delete';
    armConfirm(remove, 'Delete', async () => {
      await api.request(`/api/keys/${key.id}`, { method: 'DELETE' });
      flash(success, `Deleted "${key.name}".`);
      await loadKeys();
    });

    row.append(meta, remove);
    keysBox.appendChild(row);
  }

  keyCount.textContent = `${payload.keys.length} of ${payload.max} keys used.`;
  document.getElementById('key-create').disabled = payload.keys.length >= payload.max;
}

document.getElementById('key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('key-create');
  const nameInput = document.getElementById('key-name');

  button.disabled = true;
  try {
    const result = await api.request('/api/keys', { method: 'POST', body: { name: nameInput.value } });
    nameInput.value = '';
    freshKeyValue.textContent = result.key;
    freshKey.hidden = false;
    flash(success, 'Key created. Copy it now, it will not be shown again.');
    await loadKeys();
  } catch (error) {
    flash(notice, error.message);
    button.disabled = false;
  }
});

document.getElementById('copy-key').addEventListener('click', async () => {
  const button = document.getElementById('copy-key');
  await navigator.clipboard.writeText(freshKeyValue.textContent).catch(() => {});
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy'; }, 1500);
});

bindFlag(autoRun, 'spark.autoRun');
bindFlag(sendOnEnter, 'spark.sendOnEnter');

(async function boot() {
  let session;
  try {
    session = await api.me();
  } catch {
    location.href = 'login.html?next=settings.html';
    return;
  }

  if (!session.user) {
    location.href = 'login.html?next=settings.html';
    return;
  }

  const settings = await api.settings().catch(() => ({}));
  const user = session.user;

  displayName.value = user.displayName || '';
  document.getElementById('fact-email').textContent = user.email;

  const status = document.getElementById('fact-status');
  status.textContent = user.emailVerified ? 'Email verified' : 'Email not verified';
  status.className = user.emailVerified ? 'verified' : 'unverified';

  document.getElementById('fact-since').textContent = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  await loadKeys();

  const limit = settings.maxMessagesPerDay;
  const remaining = session.remaining;
  document.getElementById('fact-usage').textContent =
    limit && remaining !== null ? `${limit - remaining} of ${limit}` : '—';
})();
