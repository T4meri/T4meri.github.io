(function () {
  const MAX_LOG_LINES = 200;

  const INSTRUMENT = `<script>(function(){
  var seen = 0;
  function post(kind, text){
    if (seen++ > 300) return;
    try { parent.postMessage({ __sparkPreview: true, kind: kind, text: String(text).slice(0, 2000) }, '*'); } catch (e) {}
  }
  function fmt(value){
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || (value.name + ': ' + value.message);
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }
  window.addEventListener('error', function(event){
    if (event.target && event.target !== window && event.target.tagName) {
      post('error', 'Failed to load ' + event.target.tagName.toLowerCase() + ': ' + (event.target.src || event.target.href || 'unknown'));
      return;
    }
    var where = (event.filename ? event.filename.replace(/^about:srcdoc$/, 'inline') : 'inline') + ':' + event.lineno + ':' + event.colno;
    post('error', event.message + '  (' + where + ')');
  }, true);
  window.addEventListener('unhandledrejection', function(event){
    var reason = event.reason;
    post('error', 'Unhandled promise rejection: ' + (reason && reason.message ? reason.message : fmt(reason)));
  });
  ['log','info','warn','error','debug'].forEach(function(level){
    var original = console[level];
    console[level] = function(){
      var args = Array.prototype.slice.call(arguments);
      post(level === 'debug' ? 'log' : level, args.map(fmt).join(' '));
      if (original) original.apply(console, args);
    };
  });
})();<\/script>`;

  function looksLikeHtml(source) {
    const text = source.trim();
    if (!text) return false;
    if (/^<!doctype html/i.test(text)) return true;
    if (/<html[\s>]/i.test(text)) return true;
    if (/<(body|head|canvas|svg|div|section|main|form|table)[\s>]/i.test(text) && /<\/[a-z]+>/i.test(text)) return true;
    return false;
  }

  function buildDocument(source) {
    const html = source.trim();

    if (/<html[\s>]/i.test(html)) {
      if (/<head[\s>]/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, (match) => `${match}\n${INSTRUMENT}`);
      }
      return html.replace(/<html([^>]*)>/i, (match) => `${match}\n<head>${INSTRUMENT}</head>`);
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${INSTRUMENT}
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 12px; }
</style>
</head>
<body>
${html}
</body>
</html>`;
  }

  const panel = document.getElementById('preview');
  const frame = document.getElementById('preview-frame');
  const codeView = document.getElementById('preview-code');
  const consoleView = document.getElementById('preview-console');
  const badge = document.getElementById('console-badge');
  const errorBar = document.getElementById('preview-errors');
  const errorText = document.getElementById('preview-errors-text');
  const fixButton = document.getElementById('preview-fix');
  const dismissButton = document.getElementById('preview-dismiss');
  const layout = document.querySelector('.layout');

  const state = { source: '', errors: [], logs: [], view: 'render', dismissed: false };
  let fixHandler = null;

  function setView(view) {
    state.view = view;
    frame.hidden = view !== 'render';
    codeView.hidden = view !== 'code';
    consoleView.hidden = view !== 'console';

    for (const tab of panel.querySelectorAll('.preview-tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.view === view));
    }
  }

  function renderConsole() {
    consoleView.replaceChildren();

    if (state.logs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'console-empty';
      empty.textContent = 'Nothing logged yet.';
      consoleView.appendChild(empty);
      return;
    }

    for (const entry of state.logs) {
      const line = document.createElement('div');
      line.className = `console-line console-${entry.kind}`;
      line.textContent = entry.text;
      consoleView.appendChild(line);
    }
    consoleView.scrollTop = consoleView.scrollHeight;
  }

  function refreshErrorBar() {
    const count = state.errors.length;
    badge.hidden = count === 0;
    badge.textContent = String(count);

    if (count === 0 || state.dismissed) {
      errorBar.hidden = true;
      return;
    }

    errorText.textContent = count === 1 ? '1 error while running this' : `${count} errors while running this`;
    errorBar.hidden = false;
  }

  function record(kind, text) {
    state.logs.push({ kind, text });
    if (state.logs.length > MAX_LOG_LINES) state.logs.shift();
    if (kind === 'error' && !state.errors.includes(text)) state.errors.push(text);

    if (state.view === 'console') renderConsole();
    refreshErrorBar();
  }

  function run() {
    state.errors = [];
    state.logs = [];
    state.dismissed = false;
    refreshErrorBar();
    renderConsole();
    frame.srcdoc = buildDocument(state.source);
  }

  function open(source) {
    state.source = source;
    codeView.textContent = source;
    panel.hidden = false;
    layout.classList.add('with-preview');
    setView('render');
    run();
  }

  function close() {
    panel.hidden = true;
    layout.classList.remove('with-preview');
    frame.srcdoc = '';
    state.source = '';
    state.errors = [];
    state.logs = [];
  }

  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.__sparkPreview !== true) return;
    record(data.kind === 'error' ? 'error' : data.kind, data.text);
  });

  for (const tab of panel.querySelectorAll('.preview-tab')) {
    tab.addEventListener('click', () => {
      setView(tab.dataset.view);
      if (tab.dataset.view === 'console') renderConsole();
    });
  }

  document.getElementById('preview-reload').addEventListener('click', run);
  document.getElementById('preview-close').addEventListener('click', close);

  document.getElementById('preview-expand').addEventListener('click', () => {
    panel.classList.toggle('expanded');
  });

  dismissButton.addEventListener('click', () => {
    state.dismissed = true;
    refreshErrorBar();
  });

  fixButton.addEventListener('click', () => {
    if (!fixHandler || state.errors.length === 0) return;

    const list = state.errors.map((message, index) => `${index + 1}. ${message}`).join('\n');
    fixHandler(
      `The HTML you just gave me throws these errors when it runs in the browser:\n\n${list}\n\n` +
        'Fix them and reply with the complete corrected HTML in a single fenced html code block.'
    );

    state.dismissed = true;
    refreshErrorBar();
  });

  window.SparkPreview = {
    open,
    close,
    looksLikeHtml,
    isOpen: () => !panel.hidden,
    onFixRequest(handler) {
      fixHandler = handler;
    }
  };
})();
