const form = document.getElementById('auth-form');
const notice = document.getElementById('notice');
const submit = document.getElementById('submit');
const nameField = document.getElementById('name-field');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const password = document.getElementById('password');
const heading = document.getElementById('auth-heading');
const sub = document.getElementById('auth-sub');
const passwordHint = document.getElementById('password-hint');
const turnstileSlot = document.getElementById('turnstile-slot');

const credentialsView = document.getElementById('credentials-view');
const verifyView = document.getElementById('verify-view');
const verifyForm = document.getElementById('verify-form');
const verifyNotice = document.getElementById('verify-notice');
const verifySubmit = document.getElementById('verify-submit');
const verifyEmail = document.getElementById('verify-email');
const codeInput = document.getElementById('code');
const resendButton = document.getElementById('resend');

const params = new URLSearchParams(location.search);

let mode = params.get('mode') === 'register' ? 'register' : 'login';
let widgetId = null;

function show(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

const ALLOWED_NEXT = new Set(['app.html', 'settings.html', 'index.html']);

function nextDestination() {
  const next = params.get('next');
  return ALLOWED_NEXT.has(next) ? next : 'app.html';
}

function setMode(next) {
  mode = next;
  const registering = mode === 'register';

  tabLogin.setAttribute('aria-selected', String(!registering));
  tabRegister.setAttribute('aria-selected', String(registering));
  nameField.hidden = !registering;
  passwordHint.hidden = !registering;
  submit.textContent = registering ? 'Create account' : 'Sign in';
  password.setAttribute('autocomplete', registering ? 'new-password' : 'current-password');
  heading.textContent = registering ? 'Create your account' : 'Welcome back';
  sub.textContent = registering
    ? 'Free while in preview. No card, nothing to cancel.'
    : 'Sign in to keep talking to Spark.';
  show(notice, '');
}

function showVerifyStep(email, message) {
  credentialsView.hidden = true;
  verifyView.hidden = false;
  heading.textContent = 'Check your email';
  sub.textContent = 'One more step before you can start chatting.';
  verifyEmail.textContent = email || 'your inbox';
  show(verifyNotice, message || '');
  codeInput.focus();
}

function loadTurnstile(siteKey) {
  return new Promise((resolve) => {
    window.onTurnstileReady = () => {
      widgetId = window.turnstile.render(turnstileSlot, { sitekey: siteKey, theme: 'dark', size: 'flexible' });
      resolve();
    };

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileReady';
    script.async = true;
    script.defer = true;
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

function challengeToken() {
  if (widgetId === null) return undefined;
  return window.turnstile?.getResponse(widgetId) || '';
}

function resetChallenge() {
  if (widgetId !== null) window.turnstile?.reset(widgetId);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  show(notice, '');

  const email = document.getElementById('email').value.trim();
  const secret = password.value;
  const displayName = document.getElementById('displayName').value.trim();

  if (!email || !secret) {
    show(notice, 'Enter your email and password.');
    return;
  }

  const token = challengeToken();
  if (token === '') {
    show(notice, 'Please complete the verification challenge.');
    return;
  }

  submit.disabled = true;
  submit.textContent = mode === 'register' ? 'Creating account…' : 'Signing in…';

  try {
    const result =
      mode === 'register'
        ? await window.SparkApi.register(email, secret, displayName, token)
        : await window.SparkApi.login(email, secret, token);

    if (result.verificationRequired) {
      showVerifyStep(
        email,
        result.emailSent === false ? 'We could not send the email. Use the resend button below.' : ''
      );
      return;
    }

    location.href = nextDestination();
  } catch (error) {
    show(notice, error.message);
    resetChallenge();
    submit.disabled = false;
    submit.textContent = mode === 'register' ? 'Create account' : 'Sign in';
  }
});

verifyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  show(verifyNotice, '');

  verifySubmit.disabled = true;
  verifySubmit.textContent = 'Verifying…';

  try {
    await window.SparkApi.verifyEmail(codeInput.value);
    location.href = nextDestination();
  } catch (error) {
    show(verifyNotice, error.message);
    verifySubmit.disabled = false;
    verifySubmit.textContent = 'Verify email';
  }
});

resendButton.addEventListener('click', async () => {
  resendButton.disabled = true;
  show(verifyNotice, '');

  try {
    await window.SparkApi.resendCode();
    show(verifyNotice, 'A new code is on its way.');
  } catch (error) {
    show(verifyNotice, error.message);
  }

  setTimeout(() => { resendButton.disabled = false; }, 8000);
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
});

tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));

setMode(mode);

(async function boot() {
  const [settings, session] = await Promise.all([
    window.SparkApi.settings().catch(() => ({})),
    window.SparkApi.me().catch(() => ({ user: null }))
  ]);

  if (settings.turnstileSiteKey) await loadTurnstile(settings.turnstileSiteKey);

  if (session.user && session.verificationRequired) {
    showVerifyStep(session.user.email, '');
    return;
  }
  if (session.user) location.href = nextDestination();
})();
