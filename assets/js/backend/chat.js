/*
File: /assets/js/backend/chat.js
Purpose: Manage the anonymous chat widget, local cache rendering, and Edge Function message sync flow.
*/

import { trackChatOpen, trackMessageSend } from './analytics.js';
import { sendBackendMessage, getBackendMessages } from './client.js';
import { CHAT_CONFIG, MESSAGE_TYPES, SENDER_TYPES, STORAGE_KEYS } from './config.js';
import { startMessageSync } from './realtime.js';
import { ensureSession, getSessionContext, syncSessionSnapshot, resetSession, initSession } from './session.js';
import { getCachedMessages, getClientName, mergeCachedMessages, setCachedMessages, setClientName, getProfiles, saveProfile, getClientId } from './storage.js';

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
            aria-label="Open Live Chat"
        >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
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
                    <p class="portfolio-chat-kicker">
                        <span class="portfolio-chat-online-dot"></span>
                        Live Chat
                    </p>
                    <h2>Say Hello</h2>
                </div>
                <button class="portfolio-chat-close" type="button" aria-label="Close chat">&times;</button>
            </div>
            
            <div class="portfolio-chat-identity-row">
                <div class="portfolio-chat-identity-display" data-chat-identity-display>
                    <span data-chat-identity></span>
                    <button type="button" class="portfolio-chat-edit-name" data-chat-edit-btn aria-label="Switch User">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                </div>
                <div class="portfolio-chat-name-field" data-chat-name-field>
                    <div class="portfolio-chat-profiles-list" data-chat-profiles-list></div>
                    <div class="portfolio-chat-new-user-row">
                        <input
                            class="portfolio-chat-input portfolio-chat-name-input"
                            type="text"
                            name="clientName"
                            maxlength="${CHAT_CONFIG.MAX_NAME_LENGTH}"
                            placeholder="Tell us your name"
                            autocomplete="name"
                        />
                        <button type="button" class="portfolio-chat-new-user-btn" data-chat-add-btn>Add</button>
                    </div>
                </div>
            </div>

            <div class="portfolio-chat-thread" data-chat-thread></div>

            <form class="portfolio-chat-form" novalidate>
                <div class="portfolio-chat-input-row">
                    <textarea
                        class="portfolio-chat-textarea"
                        name="messageText"
                        maxlength="${CHAT_CONFIG.MAX_MESSAGE_LENGTH}"
                        placeholder="Message..."
                        rows="1"
                        required
                    ></textarea>
                    <button class="portfolio-chat-submit" type="submit" aria-label="Send">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
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
        identityDisplay: shell.querySelector('[data-chat-identity-display]'),
        editNameBtn: shell.querySelector('[data-chat-edit-btn]'),
        identity: shell.querySelector('[data-chat-identity]'),
        thread: shell.querySelector('[data-chat-thread]'),
        form: shell.querySelector('.portfolio-chat-form'),
        nameField: shell.querySelector('[data-chat-name-field]'),
        nameInput: shell.querySelector('input[name="clientName"]'),
        addBtn: shell.querySelector('[data-chat-add-btn]'),
        profilesList: shell.querySelector('[data-chat-profiles-list]'),
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
    if (tone === 'error') {
        console.error(`Live Chat: ${message}`);
    } else {
        console.log(`Live Chat: ${message}`);
    }
}

function setFormBusy(elements, isBusy) {
    [elements.nameInput, elements.messageInput, elements.submitButton].forEach((node) => {
        if (node) {
            node.disabled = isBusy;
        }
    });
}

async function switchChatProfile(profileId, elements) {
    const profiles = getProfiles();
    const target = profiles.find(p => p.id === profileId);
    if (!target) return;
    
    resetSession();
    window.localStorage.setItem(STORAGE_KEYS.CLIENT_ID, target.id);
    window.localStorage.setItem(STORAGE_KEYS.CLIENT_NAME, target.name);
    
    chatState.messages = [];
    renderMessages(elements);
    renderIdentity(elements);
    
    await initSession();
    await chatState.syncController?.syncNow();
}

async function createChatProfile(name, elements) {
    resetSession();
    const newId = (window.crypto && window.crypto.randomUUID) 
        ? window.crypto.randomUUID() 
        : 'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9); 
    window.localStorage.setItem(STORAGE_KEYS.CLIENT_ID, newId);
    setClientName(name);
    saveProfile(newId, name);
    
    chatState.messages = [];
    renderMessages(elements);
    renderIdentity(elements);
    
    await initSession();
    await chatState.syncController?.syncNow();
}

function renderIdentity(elements) {
    const clientName = getClientName();
    const clientId = getClientId();

    if (clientName) {
        elements.identity.textContent = `Connected as ${clientName}`;
        elements.identityDisplay.classList.add('is-visible');
        elements.nameField.classList.remove('is-visible');
        elements.nameInput.value = '';
    } else {
        elements.identity.textContent = '';
        elements.identityDisplay.classList.remove('is-visible');
        elements.nameField.classList.add('is-visible');
    }
    
    const profiles = getProfiles();
    elements.profilesList.replaceChildren();
    
    if (profiles.length > 0) {
        profiles.forEach(p => {
            if (p.id === clientId) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'portfolio-chat-profile-btn';
            btn.textContent = `Switch to ${p.name}`;
            btn.onclick = () => switchChatProfile(p.id, elements);
            elements.profilesList.appendChild(btn);
        });
    }
}

function formatChatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
}

function createMessageBubble(message) {
    const article = document.createElement('article');
    const isClientMessage = message.senderType === SENDER_TYPES.CLIENT;

    article.className = `portfolio-chat-bubble ${isClientMessage ? 'portfolio-chat-bubble-visitor' : 'portfolio-chat-bubble-admin'}`;
    if (message.id) article.dataset.messageId = message.id;

    const label = document.createElement('p');
    label.className = 'portfolio-chat-bubble-label';
    label.textContent = isClientMessage ? 'You' : 'Admin Reply';

    const text = document.createElement('p');
    text.className = 'portfolio-chat-bubble-text';
    text.textContent = message.messageText;

    article.append(label, text);
    
    if (message.createdAt) {
        const time = document.createElement('time');
        time.className = 'portfolio-chat-bubble-time';
        time.textContent = formatChatTime(message.createdAt);
        time.dateTime = message.createdAt;
        article.appendChild(time);
    }

    return article;
}

function renderMessages(elements) {
    if (!chatState.messages.length) {
        if (!elements.thread.querySelector('.portfolio-chat-thread-empty')) {
            elements.thread.replaceChildren();
            const emptyState = document.createElement('p');
            emptyState.className = 'portfolio-chat-thread-empty';
            emptyState.textContent = 'Messages will appear here once the conversation starts.';
            elements.thread.appendChild(emptyState);
        }
        return;
    }

    const empty = elements.thread.querySelector('.portfolio-chat-thread-empty');
    if (empty) empty.remove();

    let appended = false;
    chatState.messages.forEach((message) => {
        if (!message.id) return;
        const existing = elements.thread.querySelector(`[data-message-id="${message.id}"]`);
        if (!existing) {
            elements.thread.appendChild(createMessageBubble(message));
            appended = true;
        }
    });

    if (appended) {
        elements.thread.scrollTop = elements.thread.scrollHeight;
    }
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

    elements.editNameBtn.addEventListener('click', () => {
        elements.identityDisplay.classList.remove('is-visible');
        elements.nameField.classList.add('is-visible');
        elements.nameInput.focus();
    });

    elements.addBtn.addEventListener('click', () => {
        const newName = sanitizeName(elements.nameInput.value);
        if (newName) {
            createChatProfile(newName, elements);
        }
    });

    elements.nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            elements.addBtn.click();
        }
    });

    elements.messageInput.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
    });

    elements.messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (typeof elements.form.requestSubmit === 'function') {
                elements.form.requestSubmit();
            } else {
                // Fallback for extremely old browsers, though requestSubmit is widely supported now
                elements.submitButton.click();
            }
        }
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
            elements.messageInput.style.height = 'auto';
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
