/*
File: /assets/js/backend/chat.js
Purpose: Manage the anonymous chat widget, local cache rendering, and Edge Function message sync flow.
*/

import { trackChatOpen, trackMessageSend } from './analytics.js';
import { sendBackendMessage, getBackendMessages } from './client.js';
import { CHAT_CONFIG, MESSAGE_TYPES, SENDER_TYPES } from './config.js';
import { startMessageSync } from './realtime.js';
import { ensureSession, getSessionContext, syncSessionSnapshot } from './session.js';
import { getCachedMessages, getClientName, mergeCachedMessages, setCachedMessages, setClientName } from './storage.js';

const chatState = {
    isSubmitting: false,
    isPanelOpen: false,
    nextAllowedSubmitAt: 0,
    messages: getCachedMessages(),
    syncController: null
};

// Section: Widget rendering.
function createChatWidgetMarkup() {
    const shell = document.createElement('section');
    shell.className = 'portfolio-chat-shell';
    shell.setAttribute('aria-label', 'Say Hello chat');

    shell.innerHTML = `
        <button
            class="portfolio-chat-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="portfolio-chat-panel"
        >
            <span class="portfolio-chat-toggle-label">Say Hello</span>
        </button>

        <div
            id="portfolio-chat-panel"
            class="portfolio-chat-panel"
            role="dialog"
            aria-label="Send a message"
            aria-hidden="true"
        >
            <div class="portfolio-chat-panel-header">
                <div>
                    <p class="portfolio-chat-kicker">Realtime Chat</p>
                    <h2>Say Hello</h2>
                </div>
                <button class="portfolio-chat-close" type="button" aria-label="Close chat">&times;</button>
            </div>

            <p class="portfolio-chat-status" aria-live="polite">Ready to send your message.</p>
            <p class="portfolio-chat-identity" data-chat-identity></p>

            <div class="portfolio-chat-thread" data-chat-thread></div>

            <form class="portfolio-chat-form" novalidate>
                <label class="portfolio-chat-field" data-chat-name-field>
                    <span>Name</span>
                    <input
                        class="portfolio-chat-input"
                        type="text"
                        name="clientName"
                        maxlength="${CHAT_CONFIG.MAX_NAME_LENGTH}"
                        placeholder="Your name"
                        autocomplete="name"
                    />
                </label>

                <label class="portfolio-chat-field">
                    <span>Message</span>
                    <textarea
                        class="portfolio-chat-textarea"
                        name="messageText"
                        maxlength="${CHAT_CONFIG.MAX_MESSAGE_LENGTH}"
                        placeholder="Write a quick hello..."
                        rows="4"
                        required
                    ></textarea>
                </label>

                <button class="portfolio-chat-submit" type="submit">Send Message</button>
            </form>
        </div>
    `;

    document.body.appendChild(shell);
    return shell;
}

function createChatElements(shell) {
    return {
        shell,
        toggle: shell.querySelector('.portfolio-chat-toggle'),
        panel: shell.querySelector('.portfolio-chat-panel'),
        closeButton: shell.querySelector('.portfolio-chat-close'),
        status: shell.querySelector('.portfolio-chat-status'),
        identity: shell.querySelector('[data-chat-identity]'),
        thread: shell.querySelector('[data-chat-thread]'),
        form: shell.querySelector('.portfolio-chat-form'),
        nameField: shell.querySelector('[data-chat-name-field]'),
        nameInput: shell.querySelector('input[name="clientName"]'),
        messageInput: shell.querySelector('textarea[name="messageText"]'),
        submitButton: shell.querySelector('.portfolio-chat-submit')
    };
}

function ensureChatWidget() {
    const existingShell = document.querySelector('.portfolio-chat-shell');
    const shell = existingShell || createChatWidgetMarkup();
    return createChatElements(shell);
}

// Section: UI helpers.
function setPanelOpen(elements, isOpen) {
    chatState.isPanelOpen = isOpen;
    elements.shell.classList.toggle('is-open', isOpen);
    elements.toggle.setAttribute('aria-expanded', String(isOpen));
    elements.panel.setAttribute('aria-hidden', String(!isOpen));
}

function updateChatStatus(elements, message, tone = 'default') {
    elements.status.textContent = message;
    elements.status.dataset.state = tone;
}

function setFormBusy(elements, isBusy) {
    const nextButtonLabel = isBusy ? 'Sending...' : 'Send Message';

    [elements.nameInput, elements.messageInput, elements.submitButton].forEach((node) => {
        if (node) {
            node.disabled = isBusy;
        }
    });

    elements.submitButton.textContent = nextButtonLabel;
}

function renderIdentity(elements) {
    const clientName = getClientName();

    if (clientName) {
        elements.identity.textContent = `Chatting as ${clientName}`;
        elements.identity.classList.add('is-visible');
        elements.nameField.classList.add('is-hidden');
        elements.nameInput.value = clientName;
        return;
    }

    elements.identity.textContent = '';
    elements.identity.classList.remove('is-visible');
    elements.nameField.classList.remove('is-hidden');
}

function createMessageBubble(message) {
    const article = document.createElement('article');
    const isClientMessage = message.senderType === SENDER_TYPES.CLIENT;

    article.className = `portfolio-chat-bubble ${isClientMessage ? 'portfolio-chat-bubble-visitor' : 'portfolio-chat-bubble-admin'}`;

    const label = document.createElement('p');
    label.className = 'portfolio-chat-bubble-label';
    label.textContent = isClientMessage ? 'You' : 'Admin Reply';

    const text = document.createElement('p');
    text.className = 'portfolio-chat-bubble-text';
    text.textContent = message.messageText;

    article.append(label, text);
    return article;
}

function renderMessages(elements) {
    elements.thread.replaceChildren();

    if (!chatState.messages.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'portfolio-chat-thread-empty';
        emptyState.textContent = 'Messages will appear here once the conversation starts.';
        elements.thread.appendChild(emptyState);
        return;
    }

    chatState.messages.forEach((message) => {
        elements.thread.appendChild(createMessageBubble(message));
    });

    elements.thread.scrollTop = elements.thread.scrollHeight;
}

// Section: Data helpers.
function normalizeMessage(message) {
    return {
        id: message?.id,
        senderType: message?.senderType || message?.sender_type || '',
        messageText: message?.messageText || message?.message_text || '',
        createdAt: message?.createdAt || message?.created_at || ''
    };
}

function applyMessages(elements, messages) {
    chatState.messages = mergeCachedMessages(chatState.messages, messages.map(normalizeMessage));
    renderMessages(elements);
}

function sanitizeName(rawName) {
    return String(rawName || '').trim().slice(0, CHAT_CONFIG.MAX_NAME_LENGTH);
}

function sanitizeMessage(rawMessage) {
    return String(rawMessage || '').trim().slice(0, CHAT_CONFIG.MAX_MESSAGE_LENGTH);
}

async function fetchLatestMessages() {
    await ensureSession();
    const context = getSessionContext();

    if (!context.clientId || !context.conversationId) {
        return chatState.messages;
    }

    const response = await getBackendMessages({
        clientId: context.clientId,
        sessionId: context.sessionId,
        conversationId: context.conversationId
    });

    syncSessionSnapshot(response);

    const messages = Array.isArray(response?.messages) ? response.messages.map(normalizeMessage) : [];
    chatState.messages = mergeCachedMessages(chatState.messages, messages);
    return chatState.messages;
}

// Section: Event wiring.
function attachPanelEvents(elements) {
    elements.toggle.addEventListener('click', async () => {
        const nextOpenState = !chatState.isPanelOpen;
        setPanelOpen(elements, nextOpenState);

        if (nextOpenState) {
            await trackChatOpen();
            await chatState.syncController?.syncNow();
        }
    });

    elements.closeButton.addEventListener('click', () => {
        setPanelOpen(elements, false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setPanelOpen(elements, false);
        }
    });
}

function attachSubmitHandler(elements) {
    elements.form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const now = Date.now();
        if (chatState.isSubmitting || now < chatState.nextAllowedSubmitAt) {
            return;
        }

        const messageText = sanitizeMessage(elements.messageInput.value);
        const existingClientName = getClientName();
        const nextClientName = existingClientName || sanitizeName(elements.nameInput.value);

        if (!nextClientName) {
            updateChatStatus(elements, 'Please enter your name before sending.', 'error');
            elements.nameInput.focus();
            return;
        }

        if (!messageText) {
            updateChatStatus(elements, 'Please enter a message before sending.', 'error');
            elements.messageInput.focus();
            return;
        }

        try {
            chatState.isSubmitting = true;
            setFormBusy(elements, true);
            updateChatStatus(elements, 'Sending your message...', 'default');

            const storedClientName = setClientName(nextClientName);
            renderIdentity(elements);

            await ensureSession();
            const context = getSessionContext();
            const response = await sendBackendMessage({
                clientId: context.clientId,
                sessionId: context.sessionId,
                conversationId: context.conversationId,
                senderType: SENDER_TYPES.CLIENT,
                messageType: MESSAGE_TYPES.TEXT,
                messageText,
                clientName: storedClientName
            });

            syncSessionSnapshot(response);

            const sentMessage = normalizeMessage(response?.message || {});
            chatState.messages = mergeCachedMessages(chatState.messages, [sentMessage]);
            renderMessages(elements);

            elements.form.reset();
            elements.nameInput.value = storedClientName;
            updateChatStatus(elements, 'Message sent. Syncing replies...', 'success');
            chatState.nextAllowedSubmitAt = now + CHAT_CONFIG.SEND_COOLDOWN_MS;

            await trackMessageSend(messageText);
            await chatState.syncController?.syncNow();
        } catch (error) {
            console.error('Unable to send chat message.', error);
            updateChatStatus(elements, error.message || 'Unable to send your message right now.', 'error');
        } finally {
            chatState.isSubmitting = false;
            setFormBusy(elements, false);
        }
    });
}

// Section: Public initializer.
export async function initChatWidget() {
    const elements = ensureChatWidget();

    renderIdentity(elements);
    chatState.messages = setCachedMessages(chatState.messages);
    renderMessages(elements);

    attachPanelEvents(elements);
    attachSubmitHandler(elements);

    chatState.syncController = startMessageSync({
        fetchMessages: fetchLatestMessages,
        onMessages(messages) {
            chatState.messages = setCachedMessages(messages);
            renderMessages(elements);
            updateChatStatus(elements, 'Connected to the latest conversation state.', 'success');
        },
        onError(error) {
            console.error('Unable to sync chat messages.', error);
            updateChatStatus(elements, 'Unable to sync the latest messages right now.', 'error');
        },
        isPanelOpen() {
            return chatState.isPanelOpen;
        }
    });
}
