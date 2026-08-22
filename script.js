const api = window.SparkApi;
const markdown = window.SparkMarkdown;

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

const state = {
  signedIn: false,
  conversationId: null,
  streaming: false
};

function addMessage(content, isUser, { asMarkdown = false } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;

  const bubble = document.createElement('div');
  bubble.className = `message ${isUser ? 'user-msg' : 'bot-msg'}`;
  if (asMarkdown) bubble.innerHTML = markdown.render(content);
  else bubble.textContent = content;

  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

function addNotice(html) {
  const notice = document.createElement('div');
  notice.className = 'text-center text-[11px] text-[#777] py-1';
  notice.innerHTML = html;
  chatMessages.appendChild(notice);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function scrollToDemo() {
  document.getElementById('demo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => chatInput.focus(), 650);
}

function clearChat() {
  chatMessages.replaceChildren();
  state.conversationId = null;
  greet();
}

function greet() {
  if (state.signedIn) {
    addMessage("Hey. I'm Spark. Ask me anything — code, research, reasoning, whatever you're working on.", false);
  } else {
    addMessage("Hey. I'm Spark. Create a free account and I'll answer anything you throw at me.", false);
    addNotice('<a href="login.html?mode=register" class="underline">Create an account</a> or <a href="login.html" class="underline">sign in</a> to start chatting.');
  }
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || state.streaming) return;

  if (!state.signedIn) {
    location.href = 'login.html?mode=register&next=app.html';
    return;
  }

  state.streaming = true;
  chatInput.value = '';
  addMessage(text, true);

  const bubble = addMessage('', false, { asMarkdown: true });
  bubble.textContent = '…';
  let answer = '';

  try {
    await api.streamChat({
      message: text,
      conversationId: state.conversationId,
      onStart(data) {
        state.conversationId = data.conversationId;
      },
      onDelta(piece) {
        answer += piece;
        bubble.innerHTML = markdown.render(answer);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      },
      onError(error) {
        throw error;
      }
    });

    if (!answer.trim()) bubble.textContent = 'Spark returned an empty response. Try rephrasing that.';
  } catch (error) {
    if (error.status === 401) {
      state.signedIn = false;
      bubble.textContent = 'Your session expired.';
      addNotice('<a href="login.html?next=index.html" class="underline">Sign in again</a> to keep chatting.');
    } else {
      bubble.textContent = error.message;
    }
  } finally {
    state.streaming = false;
    chatInput.focus();
  }
}

function useSuggestion(button) {
  const text = button.textContent.trim();
  if (!text) return;
  chatInput.value = text;
  sendMessage();
}

function reflectSession(user) {
  state.signedIn = Boolean(user);

  const signIn = document.getElementById('nav-signin');
  const cta = document.getElementById('nav-cta');

  if (user) {
    signIn.textContent = user.displayName || user.email;
    signIn.href = 'app.html';
    cta.textContent = 'Open Spark';
    chatInput.placeholder = 'Ask anything…';
  } else {
    cta.href = 'login.html?mode=register';
    chatInput.placeholder = 'Sign in to chat with Spark';
  }
}

chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

window.scrollToDemo = scrollToDemo;
window.clearChat = clearChat;
window.sendMessage = sendMessage;
window.useSuggestion = useSuggestion;

(async function boot() {
  let session = { user: null };
  try {
    session = await api.me();
  } catch {
  }
  reflectSession(session.user);
  greet();
})();
