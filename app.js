const api = window.SparkApi;
const markdown = window.SparkMarkdown;

const thread = document.getElementById('thread');
const composer = document.getElementById('composer');
const sendButton = document.getElementById('send');
const conversationList = document.getElementById('conversations');
const chatTitle = document.getElementById('chat-title');
const quotaLabel = document.getElementById('quota');
const accountName = document.getElementById('account-name');
const accountMeta = document.getElementById('account-meta');
const accountBadge = document.getElementById('account-badge');
const sidebar = document.getElementById('sidebar');
const scrim = document.getElementById('scrim');
const sendIcon = document.getElementById('send-icon');
const fileInput = document.getElementById('file-input');
const attachRow = document.getElementById('attachments');
const dropzone = document.getElementById('dropzone');
const dropHint = document.getElementById('dropzone-hint');
const stopDialog = document.getElementById('stop-dialog');

const STARTERS = [
  'Explain the difference between a mutex and a semaphore',
  'Review this SQL query for performance problems',
  'Draft a migration plan from REST to GraphQL',
  'What can you help me with?'
];

const prefs = {
  get autoRun() { return localStorage.getItem('spark.autoRun') !== 'false'; },
  get sendOnEnter() { return localStorage.getItem('spark.sendOnEnter') !== 'false'; }
};

const LIMITS = { maxFiles: 10, maxImageBytes: 5 * 1024 * 1024, maxTextFileBytes: 128 * 1024 };

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];

const state = {
  user: null,
  attachments: [],
  conversationId: null,
  conversations: [],
  streaming: false,
  controller: null
};

function icon(id, size) {
  return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
}

function initialsOf(user) {
  const source = (user.displayName || user.email || '?').trim();
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

function runnableSource(block) {
  const code = block.querySelector('code')?.textContent ?? '';
  const lang = (block.dataset.lang || '').toLowerCase();
  if (['html', 'htm', 'svg', 'xhtml'].includes(lang)) return code;
  if (lang && lang !== 'code') return null;
  return window.SparkPreview.looksLikeHtml(code) ? code : null;
}

function enhanceCode(bubble) {
  for (const block of bubble.querySelectorAll('pre')) {
    if (block.querySelector('.code-actions')) continue;

    const actions = document.createElement('div');
    actions.className = 'code-actions';

    const source = runnableSource(block);
    if (source) {
      const run = document.createElement('button');
      run.className = 'code-action run';
      run.type = 'button';
      run.innerHTML = `${icon('i-play', 9)} Run`;
      run.addEventListener('click', () => window.SparkPreview.open(source));
      actions.appendChild(run);
    }

    const copy = document.createElement('button');
    copy.className = 'code-action';
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(block.querySelector('code')?.textContent ?? '').catch(() => {});
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1400);
    });
    actions.appendChild(copy);

    block.appendChild(actions);
  }
}

function autoRunLatest(bubble) {
  if (!prefs.autoRun) return;

  const blocks = [...bubble.querySelectorAll('pre')];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const source = runnableSource(blocks[i]);
    if (source) {
      window.SparkPreview.open(source);
      return;
    }
  }
}

function addTurn(role, content, { streaming = false } = {}) {
  document.getElementById('empty-state')?.remove();
  thread.classList.remove('is-empty');

  const turn = document.createElement('div');
  turn.className = `turn ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (role === 'user') avatar.textContent = state.user ? initialsOf(state.user) : 'YOU';
  else avatar.innerHTML = icon('i-spark', 15);

  const column = document.createElement('div');
  column.style.minWidth = '0';

  const byline = document.createElement('div');
  byline.className = 'byline';
  byline.textContent = role === 'user' ? 'You' : 'Spark';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'user') bubble.textContent = content;
  else bubble.innerHTML = markdown.render(content);
  if (streaming) bubble.classList.add('cursor');

  column.append(byline, bubble);
  turn.append(avatar, column);
  thread.appendChild(turn);
  scrollToBottom();
  return bubble;
}

function addErrorTurn(message) {
  document.getElementById('empty-state')?.remove();
  thread.classList.remove('is-empty');

  const turn = document.createElement('div');
  turn.className = 'turn assistant turn-error';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = '!';

  const column = document.createElement('div');
  column.style.minWidth = '0';

  const byline = document.createElement('div');
  byline.className = 'byline';
  byline.textContent = 'Error';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = message;

  column.append(byline, bubble);
  turn.append(avatar, column);
  thread.appendChild(turn);
  scrollToBottom();
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function renderAttachments() {
  attachRow.replaceChildren();
  attachRow.hidden = state.attachments.length === 0;

  state.attachments.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'chip';

    const label = document.createElement('span');
    label.className = 'chip-name';
    label.textContent = file.name;
    label.title = `${file.name} · ${humanSize(file.bytes)}`;

    const size = document.createElement('span');
    size.className = 'chip-size';
    size.textContent = humanSize(file.bytes);

    const remove = document.createElement('button');
    remove.className = 'chip-remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Remove ${file.name}`;
    remove.addEventListener('click', () => {
      state.attachments.splice(index, 1);
      renderAttachments();
      syncSendState();
    });

    if (file.kind === 'image') {
      const thumb = document.createElement('img');
      thumb.className = 'chip-thumb';
      thumb.src = file.data;
      thumb.alt = '';
      chip.appendChild(thumb);
    }

    chip.append(label, size, remove);
    attachRow.appendChild(chip);
  });
}

function readAsText(file) {
  return file.text();
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function pixelCount(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth * image.naturalHeight);
    image.onerror = () => resolve(0);
    image.src = dataUrl;
  });
}

async function acceptFiles(list) {
  const incoming = [...list];
  if (incoming.length === 0) return;

  const room = LIMITS.maxFiles - state.attachments.length;
  if (room <= 0) {
    addErrorTurn(`You can attach at most ${LIMITS.maxFiles} files to one message.`);
    return;
  }

  const problems = [];

  for (const file of incoming.slice(0, room)) {
    const isImage = IMAGE_TYPES.includes(file.type);

    if (isImage) {
      if (file.size > LIMITS.maxImageBytes) {
        problems.push(`${file.name} is over the ${humanSize(LIMITS.maxImageBytes)} image limit`);
        continue;
      }

      const data = await readAsDataUrl(file);
      if ((await pixelCount(data)) < 512) {
        problems.push(`${file.name} is too small to read, images need at least 512 pixels`);
        continue;
      }

      state.attachments.push({ kind: 'image', name: file.name, type: file.type, data, bytes: file.size });
      continue;
    }

    if (file.size > LIMITS.maxTextFileBytes) {
      problems.push(`${file.name} is over the ${humanSize(LIMITS.maxTextFileBytes)} text limit`);
      continue;
    }

    const text = await readAsText(file);
    if (text.includes(String.fromCharCode(0))) {
      problems.push(`${file.name} looks binary, only images and text files work`);
      continue;
    }

    state.attachments.push({ kind: 'text', name: file.name, type: file.type || 'text/plain', data: text, bytes: file.size });
  }

  if (incoming.length > room) {
    problems.push(`only the first ${room} of ${incoming.length} files were added, the limit is ${LIMITS.maxFiles}`);
  }

  renderAttachments();
  syncSendState();
  if (problems.length) addErrorTurn(`Some files were skipped: ${problems.join('; ')}.`);
}

function setThinking(bubble, label) {
  bubble.classList.remove('cursor');
  bubble.innerHTML = '';

  const note = document.createElement('span');
  note.className = 'thinking';
  note.textContent = label;
  bubble.appendChild(note);
  scrollToBottom();
}

function scrollToBottom() {
  thread.scrollTop = thread.scrollHeight;
}

function renderEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.id = 'empty-state';
  empty.innerHTML = `
    <div class="empty-mark">${icon('i-spark', 24)}</div>
    <h1>What can I help you <em>build</em>?</h1>
    <p>Code, research, reasoning, long documents. Ask in plain language and get a direct answer.</p>
    <div class="starters">
      ${STARTERS.map((text) => `<button class="starter" type="button">${text}</button>`).join('')}
    </div>`;

  thread.classList.add('is-empty');
  thread.appendChild(empty);
  wireStarters();
}

function groupOf(timestamp) {
  const day = 86400000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);

  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfToday - day) return 'Yesterday';
  if (timestamp >= startOfToday - day * 7) return 'Previous 7 days';
  return 'Older';
}

function renderConversations() {
  conversationList.replaceChildren();

  if (state.conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'rail-empty';
    empty.textContent = 'No conversations yet. Start one and it will show up here.';
    conversationList.appendChild(empty);
    return;
  }

  let currentGroup = null;

  for (const conversation of state.conversations) {
    const group = groupOf(conversation.updatedAt);
    if (group !== currentGroup) {
      currentGroup = group;
      const label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = group;
      conversationList.appendChild(label);
    }

    const row = document.createElement('div');
    row.className = `conversation${conversation.id === state.conversationId ? ' active' : ''}`;

    const title = document.createElement('div');
    title.className = 'conversation-title';
    title.textContent = conversation.title || 'New chat';
    title.addEventListener('click', () => openConversation(conversation.id));

    const remove = document.createElement('button');
    remove.className = 'conversation-delete';
    remove.type = 'button';
    remove.innerHTML = icon('i-trash', 14);
    remove.title = 'Delete conversation';
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      await api.deleteConversation(conversation.id).catch(() => {});
      if (state.conversationId === conversation.id) startNewChat();
      await refreshConversations();
    });

    row.append(title, remove);
    conversationList.appendChild(row);
  }
}

function setQuota(remaining) {
  quotaLabel.textContent = remaining === null || remaining === undefined ? '' : `${remaining} left today`;
}

async function refreshConversations() {
  const result = await api.conversations().catch((error) => {
    console.error('could not load conversations:', error.message);
    return { conversations: [] };
  });
  state.conversations = result.conversations;
  renderConversations();
}

async function openConversation(id) {
  if (state.streaming) return;

  const result = await api.conversation(id).catch(() => null);
  if (!result) return;

  state.conversationId = id;
  chatTitle.textContent = result.conversation.title || 'Spark 1.4';
  thread.classList.remove('is-empty');
  thread.replaceChildren();

  for (const message of result.messages) {
    const bubble = addTurn(message.role === 'user' ? 'user' : 'assistant', message.content);
    if (message.role !== 'user') {
      enhanceCode(bubble);
      window.SparkChart.hydrate(bubble);
    }
  }

  renderConversations();
  closeSidebar();
  scrollToBottom();
}

function startNewChat() {
  state.conversationId = null;
  chatTitle.textContent = 'Spark 1.4';
  thread.replaceChildren();
  renderEmptyState();
  renderConversations();
  closeSidebar();
  composer.focus();
}

async function send(explicitText) {
  const message = String(explicitText ?? composer.value).trim();
  const attachments = explicitText === undefined ? state.attachments : [];
  if ((!message && attachments.length === 0) || state.streaming) return;

  state.streaming = true;
  state.controller = new AbortController();
  if (explicitText === undefined) {
    composer.value = '';
    state.attachments = [];
    renderAttachments();
  }
  resizeComposer();
  syncSendState();

  addTurn('user', message || attachments.map((file) => file.name).join(', '));
  const bubble = addTurn('assistant', '');
  setThinking(bubble, 'Thinking');

  let answer = '';
  let pinned = true;

  try {
    await api.streamChat({
      message,
      attachments,
      conversationId: state.conversationId,
      signal: state.controller.signal,
      onStart(data) {
        state.conversationId = data.conversationId;
        if (data.title) chatTitle.textContent = data.title;
      },
      onStatus(status) {
        if (!answer) setThinking(bubble, status.kind === 'search' ? 'Searching the web' : 'Thinking');
      },
      onDelta(text) {
        answer += text;
        bubble.innerHTML = markdown.render(answer);
        bubble.classList.add('cursor');
        pinned = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
        if (pinned) scrollToBottom();
      },
      onDone(data) {
        setQuota(data.remaining);
      },
      onError(error) {
        throw error;
      }
    });

    if (answer.trim()) {
      enhanceCode(bubble);
      window.SparkChart.hydrate(bubble);
      autoRunLatest(bubble);
    } else {
      bubble.closest('.turn').remove();
      addErrorTurn('Spark returned an empty response. Try rephrasing that.');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      if (!answer.trim()) bubble.closest('.turn')?.remove();
      return;
    }
    if (!answer.trim()) bubble.closest('.turn')?.remove();
    if (error.status === 401) {
      location.href = 'login.html?next=app.html';
      return;
    }
    if (error.status === 403) {
      location.href = 'login.html?next=app.html';
      return;
    }
    addErrorTurn(error.message);
  } finally {
    bubble.classList.remove('cursor');
    state.streaming = false;
    state.controller = null;
    if (stopDialog.open) stopDialog.close();
    syncSendState();
    composer.focus();
    await refreshConversations();
  }
}

function requestStop() {
  if (!state.streaming) return;
  stopDialog.showModal();
}

function confirmStop() {
  stopDialog.close();
  state.controller?.abort();
}

function resizeComposer() {
  composer.style.height = 'auto';
  composer.style.height = `${Math.max(28, Math.min(composer.scrollHeight, 200))}px`;
}

function syncSendState() {
  const stopping = state.streaming;

  sendButton.disabled = !stopping && composer.value.trim().length === 0 && state.attachments.length === 0;
  sendButton.classList.toggle('stopping', stopping);
  sendButton.setAttribute('aria-label', stopping ? 'Stop generating' : 'Send message');
  sendIcon.firstElementChild.setAttribute('href', stopping ? '#i-stop' : '#i-send');
}

function wireStarters() {
  for (const button of document.querySelectorAll('.starter')) {
    button.addEventListener('click', () => {
      composer.value = button.textContent;
      resizeComposer();
      syncSendState();
      send();
    });
  }
}

function openSidebar() {
  sidebar.classList.add('open');
  scrim.classList.add('open');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  scrim.classList.remove('open');
}

composer.addEventListener('input', () => {
  resizeComposer();
  syncSendState();
});

composer.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;

  if (prefs.sendOnEnter ? !event.shiftKey : event.ctrlKey || event.metaKey) {
    event.preventDefault();
    send();
  }
});

window.SparkPreview.onFixRequest((message) => {
  if (state.streaming) return;
  send(message);
});

function on(id, event, handler) {
  const element = document.getElementById(id);
  if (element) element.addEventListener(event, handler);
  else console.warn(`missing element: #${id}`);
}

sendButton.addEventListener('click', () => (state.streaming ? requestStop() : send()));
on('stop-confirm', 'click', confirmStop);
on('stop-cancel', 'click', () => stopDialog.close());
on('new-chat', 'click', startNewChat);
on('open-sidebar', 'click', openSidebar);
on('close-sidebar', 'click', closeSidebar);
scrim.addEventListener('click', closeSidebar);

on('attach', 'click', () => fileInput.click());

let dragDepth = 0;

function carriesFiles(event) {
  return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

function showDropzone() {
  dropHint.textContent = `Images and text files, up to ${LIMITS.maxFiles} per message`;
  dropzone.hidden = false;
}

function hideDropzone() {
  dragDepth = 0;
  dropzone.hidden = true;
}

window.addEventListener('dragenter', (event) => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  showDropzone();
});

window.addEventListener('dragover', (event) => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (event) => {
  if (!carriesFiles(event)) return;
  dragDepth -= 1;
  if (dragDepth <= 0) hideDropzone();
});

window.addEventListener('drop', async (event) => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  hideDropzone();
  await acceptFiles(event.dataTransfer.files);
});

fileInput.addEventListener('change', async () => {
  await acceptFiles(fileInput.files);
  fileInput.value = '';
});

composer.addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) {
    event.preventDefault();
    acceptFiles(files);
  }
});

on('logout', 'click', async () => {
  await api.logout().catch(() => {});
  location.href = 'index.html';
});

(async function boot() {
  let session;
  try {
    session = await api.me();
  } catch {
    location.href = 'login.html?next=app.html';
    return;
  }

  if (!session.user || session.verificationRequired) {
    location.href = 'login.html?next=app.html';
    return;
  }

  state.user = session.user;
  accountName.textContent = session.user.displayName || session.user.email;
  accountMeta.textContent = session.user.email;
  accountBadge.textContent = initialsOf(session.user);
  setQuota(session.remaining);

  const settings = await api.settings().catch(() => null);
  if (settings) {
    LIMITS.maxFiles = settings.maxFilesPerMessage ?? LIMITS.maxFiles;
    LIMITS.maxImageBytes = settings.maxImageBytes ?? LIMITS.maxImageBytes;
    LIMITS.maxTextFileBytes = settings.maxTextFileBytes ?? LIMITS.maxTextFileBytes;
  }

  renderEmptyState();
  resizeComposer();
  syncSendState();
  await refreshConversations();
  composer.focus();
})();
